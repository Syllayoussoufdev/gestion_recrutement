import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { computeAttemptScore } from "@/lib/scoring";
import { AttemptStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const gradeAnswerSchema = z.object({
  questionId: z.string(),
  manualPoints: z.number().min(0),
  comment: z.string().trim().optional(),
});

const gradeAttemptSchema = z.object({
  grades: z.array(gradeAnswerSchema).min(1, "Au moins une note requise"),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id: attemptId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = gradeAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const db = forAgency(auth.session);

  try {
    const attempt = await db.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          include: {
            questions: true,
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Tentative d'évaluation introuvable" }, { status: 404 });
    }

    // 1. Mettre à jour chaque réponse notée manuellement
    for (const g of parsed.data.grades) {
      const existingAnswer = attempt.answers.find((a) => a.questionId === g.questionId);
      if (existingAnswer) {
        await db.attemptAnswer.update({
          where: { id: existingAnswer.id },
          data: {
            manualPoints: g.manualPoints,
            comment: g.comment || existingAnswer.comment,
          },
        });
      } else {
        await db.attemptAnswer.create({
          data: {
            agencyId: auth.session.agencyId!,
            attemptId,
            questionId: g.questionId,
            manualPoints: g.manualPoints,
            comment: g.comment || null,
          },
        });
      }
    }

    // 2. Recharger toutes les réponses à jour
    const updatedAnswers = await db.attemptAnswer.findMany({
      where: { attemptId },
    });

    // 3. Recalculer le score déterministe complet (R3 / PRD V2 §4.2)
    const scoring = computeAttemptScore({
      questions: attempt.assessment.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        points: q.points,
        skillTag: q.skillTag,
        rubric: q.rubric,
      })),
      answers: updatedAnswers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        autoPoints: a.autoPoints,
        manualPoints: a.manualPoints,
      })),
      passPercent: attempt.assessment.passPercent,
      reviewPercent: attempt.assessment.reviewPercent,
    });

    // 4. Enregistrer la mise à jour de la tentative
    const newStatus = scoring.isComplete ? AttemptStatus.GRADED : AttemptStatus.SUBMITTED;

    const updatedAttempt = await db.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        status: newStatus,
        autoPoints: scoring.autoPoints,
        manualPoints: scoring.manualPoints,
        maxPoints: scoring.maxPoints,
        percent: scoring.percent,
        suggestion: scoring.suggestion,
        gradedById: auth.session.userId,
        gradedAt: new Date(),
      },
      include: {
        answers: true,
        gradedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // 5. Journaliser l'évaluation manuelle (PRD V2 §10.6)
    await db.auditLog.create({
      data: {
        agencyId: auth.session.agencyId!,
        actorUserId: auth.session.userId,
        action: "ASSESSMENT_GRADED",
        targetType: "AssessmentAttempt",
        targetId: attemptId,
        metadata: {
          percent: scoring.percent,
          suggestion: scoring.suggestion,
          isComplete: scoring.isComplete,
        },
      },
    });

    return NextResponse.json({
      attempt: updatedAttempt,
      scoring,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur notation manuelle test:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
