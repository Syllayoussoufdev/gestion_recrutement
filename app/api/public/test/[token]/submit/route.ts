import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeAttemptScore } from "@/lib/scoring";
import { ApplicationStatus, AttemptStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ token: string }>;
}

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.unknown(),
    })
  ),
});

export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { tokenHash },
      include: {
        assessment: {
          include: {
            questions: true,
          },
        },
        application: true,
      },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Test introuvable" }, { status: 404 });
    }

    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.GRADED) {
      return NextResponse.json({ error: "Ce test a déjà été soumis" }, { status: 400 });
    }

    // 1. Sauvegarder les réponses soumises
    for (const item of parsed.data.answers) {
      const existing = await prisma.attemptAnswer.findUnique({
        where: {
          attemptId_questionId: {
            attemptId: attempt.id,
            questionId: item.questionId,
          },
        },
      });

      if (existing) {
        await prisma.attemptAnswer.update({
          where: { id: existing.id },
          data: { answer: item.answer as any },
        });
      } else {
        await prisma.attemptAnswer.create({
          data: {
            agencyId: attempt.agencyId,
            attemptId: attempt.id,
            questionId: item.questionId,
            answer: item.answer as any,
          },
        });
      }
    }

    // 2. Calculer le scoring déterministe (R3 / PRD V2 §4.2)
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
      answers: parsed.data.answers,
      passPercent: attempt.assessment.passPercent,
      reviewPercent: attempt.assessment.reviewPercent,
    });

    // Mettre à jour les points automatiques sur chaque réponse
    for (const ga of scoring.gradedAnswers) {
      if (typeof ga.autoPoints === "number") {
        await prisma.attemptAnswer.updateMany({
          where: {
            attemptId: attempt.id,
            questionId: ga.questionId,
          },
          data: { autoPoints: ga.autoPoints },
        });
      }
    }

    // 3. Statut de la tentative : si toutes les questions sont QCM (pas de questions texte à noter), le test est GRADED directement !
    const finalAttemptStatus = scoring.isComplete
      ? AttemptStatus.GRADED
      : AttemptStatus.SUBMITTED;

    const submittedAt = new Date();

    await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: finalAttemptStatus,
        autoPoints: scoring.autoPoints,
        manualPoints: scoring.manualPoints,
        maxPoints: scoring.maxPoints,
        percent: scoring.percent,
        suggestion: scoring.suggestion,
        submittedAt,
      },
    });

    // 4. Passage automatique et informatif de la candidature à ASSESSMENT_DONE (PRD V2 §3)
    const fromStatus = attempt.application.status;
    const toStatus = ApplicationStatus.ASSESSMENT_DONE;

    await Promise.all([
      prisma.application.update({
        where: { id: attempt.applicationId },
        data: { status: toStatus },
      }),
      prisma.applicationHistory.create({
        data: {
          agencyId: attempt.agencyId,
          applicationId: attempt.applicationId,
          fromStatus,
          toStatus,
          note: `Test complété et remis par le candidat (Score automatique : ${scoring.percent}%).`,
        },
      }),
      prisma.candidate.update({
        where: { id: attempt.candidateId },
        data: { lastActivityAt: submittedAt },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Test soumis avec succès. Merci !",
      submittedAt: submittedAt.toISOString(),
    });
  } catch (error) {
    console.error("Erreur soumission test public:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
