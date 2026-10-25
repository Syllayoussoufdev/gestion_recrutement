import { QuestionType, ScoreSuggestion } from "@prisma/client";

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionData {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: unknown; // Array of QuestionOption
  points: number;
  skillTag?: string | null;
  rubric?: string | null;
  required?: boolean;
}

export interface AnswerData {
  questionId: string;
  answer?: unknown; // string (MCQ_SINGLE or text) | string[] (MCQ_MULTI)
  autoPoints?: number | null;
  manualPoints?: number | null;
  comment?: string | null;
}

export interface SkillSubscore {
  skill: string;
  pointsEarned: number;
  pointsMax: number;
  percent: number;
}

export interface ScoringResult {
  autoPoints: number;
  manualPoints: number;
  totalPoints: number;
  maxPoints: number;
  percent: number;
  isComplete: boolean; // false tant que des questions texte ne sont pas notées
  suggestion: ScoreSuggestion;
  subscores: SkillSubscore[];
  gradedAnswers: {
    questionId: string;
    autoPoints: number | null;
    manualPoints: number | null;
  }[];
}

/**
 * Calcule la note pour une question QCM à choix unique (MCQ_SINGLE)
 */
export function gradeMcqSingle(
  question: QuestionData,
  selectedOptionId?: string | null
): number {
  if (!selectedOptionId) return 0;
  const options = (question.options as QuestionOption[]) || [];
  const correctOption = options.find((o) => o.isCorrect);
  if (!correctOption) return 0;
  return selectedOptionId === correctOption.id ? question.points : 0;
}

/**
 * Calcule la note pour une question QCM à choix multiples (MCQ_MULTI)
 * Règle PRD V2 §4.2 :
 * (bonnes réponses cochées − mauvaises cochées) ÷ nombre de bonnes réponses,
 * plancher à 0, multiplié par les points.
 */
export function gradeMcqMulti(
  question: QuestionData,
  selectedOptionIds?: string[] | null
): number {
  if (!selectedOptionIds || !Array.isArray(selectedOptionIds) || selectedOptionIds.length === 0) {
    return 0;
  }

  const options = (question.options as QuestionOption[]) || [];
  const correctIds = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));
  const totalCorrect = correctIds.size;

  if (totalCorrect === 0) return 0;

  let correctChecked = 0;
  let wrongChecked = 0;

  for (const id of selectedOptionIds) {
    if (correctIds.has(id)) {
      correctChecked++;
    } else {
      wrongChecked++;
    }
  }

  const rawScore = (correctChecked - wrongChecked) / totalCorrect;
  const ratio = Math.max(0, rawScore);
  const points = Math.round(ratio * question.points * 100) / 100;

  return Math.min(question.points, points);
}

/**
 * Moteur de calcul global déterministe (Règle R3 / PRD V2 §4.2)
 *
 * Calcule :
 * - Points automatiques (QCM)
 * - Points manuels (Questions ouvertes / texte)
 * - État de complétude (isComplete)
 * - Pourcentage global (0-100%)
 * - Sous-scores par compétence (skillTag)
 * - Suggestion (RECOMMEND_VALIDATE, TO_REVIEW, BELOW_THRESHOLD)
 */
export function computeAttemptScore(params: {
  questions: QuestionData[];
  answers: AnswerData[];
  passPercent?: number;
  reviewPercent?: number;
}): ScoringResult {
  const { questions, answers, passPercent = 70, reviewPercent = 50 } = params;

  const answerMap = new Map<string, AnswerData>();
  answers.forEach((a) => answerMap.set(a.questionId, a));

  let autoPoints = 0;
  let manualPoints = 0;
  let maxPoints = 0;
  let hasUngradedText = false;

  const skillBuckets = new Map<
    string,
    { earned: number; max: number }
  >();

  const gradedAnswers: ScoringResult["gradedAnswers"] = [];

  for (const q of questions) {
    const qPoints = q.points || 1.0;
    maxPoints += qPoints;

    const skill = q.skillTag?.trim() || "Général";
    if (!skillBuckets.has(skill)) {
      skillBuckets.set(skill, { earned: 0, max: 0 });
    }
    const bucket = skillBuckets.get(skill)!;
    bucket.max += qPoints;

    const answer = answerMap.get(q.id);

    if (q.type === QuestionType.MCQ_SINGLE) {
      const selectedId = typeof answer?.answer === "string" ? answer.answer : null;
      const pts = gradeMcqSingle(q, selectedId);
      autoPoints += pts;
      bucket.earned += pts;
      gradedAnswers.push({ questionId: q.id, autoPoints: pts, manualPoints: null });
    } else if (q.type === QuestionType.MCQ_MULTI) {
      const selectedIds = Array.isArray(answer?.answer) ? (answer.answer as string[]) : null;
      const pts = gradeMcqMulti(q, selectedIds);
      autoPoints += pts;
      bucket.earned += pts;
      gradedAnswers.push({ questionId: q.id, autoPoints: pts, manualPoints: null });
    } else {
      // Question texte (SHORT_TEXT ou LONG_TEXT)
      if (answer && typeof answer.manualPoints === "number") {
        const pts = Math.min(qPoints, Math.max(0, answer.manualPoints));
        manualPoints += pts;
        bucket.earned += pts;
        gradedAnswers.push({ questionId: q.id, autoPoints: null, manualPoints: pts });
      } else {
        hasUngradedText = true;
        gradedAnswers.push({ questionId: q.id, autoPoints: null, manualPoints: null });
      }
    }
  }

  const totalPoints = autoPoints + manualPoints;
  const percent = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  const isComplete = !hasUngradedText;

  // Détermination de la suggestion déterministe (R3)
  let suggestion: ScoreSuggestion = ScoreSuggestion.BELOW_THRESHOLD;
  if (percent >= passPercent) {
    suggestion = ScoreSuggestion.RECOMMEND_VALIDATE;
  } else if (percent >= reviewPercent) {
    suggestion = ScoreSuggestion.TO_REVIEW;
  } else {
    suggestion = ScoreSuggestion.BELOW_THRESHOLD;
  }

  // Sous-scores par compétence
  const subscores: SkillSubscore[] = Array.from(skillBuckets.entries()).map(
    ([skill, data]) => ({
      skill,
      pointsEarned: Math.round(data.earned * 100) / 100,
      pointsMax: Math.round(data.max * 100) / 100,
      percent: data.max > 0 ? Math.round((data.earned / data.max) * 100) : 0,
    })
  );

  return {
    autoPoints: Math.round(autoPoints * 100) / 100,
    manualPoints: Math.round(manualPoints * 100) / 100,
    totalPoints: Math.round(totalPoints * 100) / 100,
    maxPoints: Math.round(maxPoints * 100) / 100,
    percent,
    isComplete,
    suggestion,
    subscores,
    gradedAnswers,
  };
}
