"use client";

import { useEffect, useState, use } from "react";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  Send,
  Loader2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TestPageProps {
  params: Promise<{ token: string }>;
}

interface Question {
  id: string;
  order: number;
  type: "MCQ_SINGLE" | "MCQ_MULTI" | "SHORT_TEXT" | "LONG_TEXT";
  prompt: string;
  options?: Array<{ id: string; text: string }> | null;
  points: number;
  required: boolean;
}

interface TestData {
  attemptId: string;
  status: string;
  startedAt: string | null;
  consentAt: string | null;
  durationMinutes: number | null;
  assessment: {
    title: string;
    description: string | null;
    instructions: string | null;
  };
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
  };
  agency: {
    name: string;
    contactEmail: string;
    logoUrl: string | null;
  };
  questions: Question[];
  savedAnswers: Array<{ questionId: string; answer: any }>;
  alreadySubmitted?: boolean;
}

export default function CandidateTestPage({ params }: TestPageProps) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TestData | null>(null);

  // État du test
  const [step, setStep] = useState<"CONSENT" | "TESTING" | "SUBMITTED">("CONSENT");
  const [consentGiven, setConsentGiven] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingNotice, setSavingNotice] = useState(false);

  // Charger les données du test
  useEffect(() => {
    async function fetchTest() {
      try {
        const res = await fetch(`/api/public/test/${token}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Impossible de charger le test.");
          return;
        }

        if (json.alreadySubmitted) {
          setData(json);
          setStep("SUBMITTED");
          return;
        }

        setData(json);

        // Restaurer les réponses déjà sauvegardées
        const initialAnswers: Record<string, any> = {};
        if (json.savedAnswers) {
          json.savedAnswers.forEach((a: any) => {
            initialAnswers[a.questionId] = a.answer;
          });
        }
        setAnswers(initialAnswers);

        if (json.status === "STARTED") {
          setStep("TESTING");
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur de connexion");
      } finally {
        setLoading(false);
      }
    }

    fetchTest();
  }, [token]);

  // Sauvegarde automatique toutes les 15 secondes pendant le test (PRD V2 §4.3)
  useEffect(() => {
    if (step !== "TESTING") return;

    const interval = setInterval(async () => {
      const answersList = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));

      if (answersList.length === 0) return;

      try {
        setSavingNotice(true);
        await fetch(`/api/public/test/${token}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: answersList }),
        });
        setTimeout(() => setSavingNotice(false), 2000);
      } catch {
        // En cas d'échec de sauvegarde silencieuse, continuer
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [step, token, answers]);

  // 1. Démarrer le test après consentement
  async function handleStartTest() {
    if (!consentGiven) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/public/test/${token}/start`, {
        method: "POST",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Impossible de démarrer le test");
      }

      setStep("TESTING");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  // 2. Gestion des réponses
  function handleSelectSingle(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function handleToggleMulti(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const currentList = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const exists = currentList.includes(optionId);
      const updated = exists
        ? currentList.filter((id: string) => id !== optionId)
        : [...currentList, optionId];
      return { ...prev, [questionId]: updated };
    });
  }

  function handleTextChange(questionId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  }

  // 3. Soumission finale
  async function handleSubmit() {
    if (!confirm("Êtes-vous sûr de vouloir valider et soumettre définitivement vos réponses ?")) {
      return;
    }

    setSubmitting(true);
    try {
      const answersList = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));

      const res = await fetch(`/api/public/test/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersList }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Erreur de soumission");
      }

      setStep("SUBMITTED");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur de soumission");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-slate-600">Chargement de votre évaluation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-rose-200 p-6 text-center space-y-4 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Accès indisponible</h2>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (step === "SUBMITTED") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border p-8 text-center space-y-4 shadow-sm">
          <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Test terminé, merci !</h2>
          <p className="text-sm text-slate-600">
            Vos réponses ont été transmises avec succès à l&apos;équipe de recrutement de{" "}
            <strong>{data?.agency.name}</strong>.
          </p>
          <p className="text-xs text-muted-foreground pt-2">
            Un consultant examinera vos résultats et vous recontactera pour la suite du processus.
          </p>
        </div>
      </div>
    );
  }

  // ÉCRAN 1 : CONSENTEMENT ET INSTRUCTIONS (PRD V2 §4.3)
  if (step === "CONSENT") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-xl w-full bg-white rounded-2xl border p-6 sm:p-8 space-y-6 shadow-sm">
          {/* En-tête cabinet */}
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                {data?.agency.name}
              </p>
              <h1 className="text-xl font-bold text-slate-900">{data?.assessment.title}</h1>
            </div>
          </div>

          {/* Candidat et instructions */}
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Bonjour <strong>{data?.candidate.firstName}</strong>, vous avez été invité(e) à passer
              cette évaluation dans le cadre de votre candidature.
            </p>

            {data?.assessment.description && (
              <p className="text-slate-600 italic bg-slate-50 p-3 rounded-lg border">
                {data.assessment.description}
              </p>
            )}

            {data?.assessment.instructions && (
              <div className="space-y-1">
                <p className="font-semibold text-slate-900">Consignes :</p>
                <p className="text-slate-600">{data.assessment.instructions}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                <span>
                  Durée :{" "}
                  <strong>
                    {data?.durationMinutes ? `${data.durationMinutes} min` : "Libre"}
                  </strong>
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-slate-500" />
                <span>
                  Questions : <strong>{data?.questions.length}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Consentement transparent (Règles RGPD & PRD V2 §4.3) */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/60 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900 space-y-1">
                <p className="font-semibold">Transparence et respect de votre vie privée :</p>
                <p>
                  Ce test vise uniquement à apprécier vos compétences en lien direct avec le poste.
                  Aucune surveillance intrusive (ni caméra, ni capture d&apos;écran) n&apos;est
                  utilisée.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="h-4 w-4 rounded border-blue-300 text-primary focus:ring-primary"
              />
              <span className="text-xs font-medium text-slate-800">
                J&apos;ai pris connaissance des consignes et je consens à passer cette évaluation.
              </span>
            </label>
          </div>

          <Button
            className="w-full h-11 text-sm font-semibold"
            disabled={!consentGiven}
            onClick={handleStartTest}
          >
            Commencer le test
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ÉCRAN 2 : PASSAGE DU TEST (PRD V2 §4.3)
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Barre supérieure fixe avec progression et état */}
      <header className="sticky top-0 z-30 bg-white border-b px-4 py-3 shadow-xs">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
              {data?.assessment.title}
            </h2>
            <p className="text-[11px] text-muted-foreground">{data?.agency.name}</p>
          </div>

          <div className="flex items-center gap-3">
            {savingNotice && (
              <span className="text-[11px] text-slate-400 animate-pulse">Sauvegarde...</span>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-8 text-xs font-semibold"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1" />
              )}
              Valider le test
            </Button>
          </div>
        </div>
      </header>

      {/* Conteneur des questions */}
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {data?.questions.map((q, index) => {
          const currentAnswer = answers[q.id];

          return (
            <div
              key={q.id}
              className="p-5 sm:p-6 bg-white rounded-xl border shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                  {index + 1}
                </span>
                <p className="text-sm sm:text-base font-semibold text-slate-900 flex-1">
                  {q.prompt}
                </p>
                <span className="text-[11px] font-medium text-muted-foreground bg-slate-100 px-2 py-0.5 rounded shrink-0">
                  {q.points} pt{q.points > 1 ? "s" : ""}
                </span>
              </div>

              {/* QCM Choix Unique */}
              {q.type === "MCQ_SINGLE" && q.options && (
                <div className="space-y-2 pt-1 pl-9">
                  {q.options.map((opt) => {
                    const isSelected = currentAnswer === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                          isSelected
                            ? "border-primary bg-primary/5 font-medium text-slate-900"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          value={opt.id}
                          checked={isSelected}
                          onChange={() => handleSelectSingle(q.id, opt.id)}
                          className="h-4 w-4 text-primary border-slate-300"
                        />
                        <span>{opt.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* QCM Choix Multiples */}
              {q.type === "MCQ_MULTI" && q.options && (
                <div className="space-y-2 pt-1 pl-9">
                  <p className="text-xs text-muted-foreground italic">
                    Plusieurs réponses possibles :
                  </p>
                  {q.options.map((opt) => {
                    const selectedList: string[] = Array.isArray(currentAnswer)
                      ? currentAnswer
                      : [];
                    const isChecked = selectedList.includes(opt.id);

                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                          isChecked
                            ? "border-primary bg-primary/5 font-medium text-slate-900"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          value={opt.id}
                          checked={isChecked}
                          onChange={() => handleToggleMulti(q.id, opt.id)}
                          className="h-4 w-4 rounded text-primary border-slate-300"
                        />
                        <span>{opt.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Question Texte Court */}
              {q.type === "SHORT_TEXT" && (
                <div className="pt-1 pl-9">
                  <input
                    type="text"
                    placeholder="Saisissez votre réponse ici..."
                    value={currentAnswer || ""}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              )}

              {/* Question Texte Long */}
              {q.type === "LONG_TEXT" && (
                <div className="pt-1 pl-9">
                  <textarea
                    rows={4}
                    placeholder="Développez votre réponse ici..."
                    value={currentAnswer || ""}
                    onChange={(e) => handleTextChange(q.id, e.target.value)}
                    className="w-full p-3 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Bouton bas de page */}
        <div className="pt-4 flex justify-end">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:w-auto font-semibold px-8"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Transmission en cours...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Soumettre mon évaluation
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
