import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });
  }

  // 1. Calculer le hash SHA-256 du jeton secret
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { tokenHash },
      include: {
        assessment: {
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
        candidate: {
          select: { firstName: true, lastName: true, email: true },
        },
        agency: {
          select: { name: true, contactEmail: true, logoUrl: true, brandKey: true },
        },
        answers: true,
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: "Ce lien d'évaluation est invalide ou introuvable." },
        { status: 404 }
      );
    }

    // 2. Vérifier si le test est expiré
    if (new Date() > attempt.expiresAt && attempt.status !== AttemptStatus.SUBMITTED && attempt.status !== AttemptStatus.GRADED) {
      if (attempt.status !== AttemptStatus.EXPIRED) {
        await prisma.assessmentAttempt.update({
          where: { id: attempt.id },
          data: { status: AttemptStatus.EXPIRED },
        });
      }
      return NextResponse.json(
        { error: "La date limite pour passer ce test a expiré." },
        { status: 410 }
      );
    }

    // 3. Vérifier si le test a déjà été soumis
    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.GRADED) {
      return NextResponse.json({
        alreadySubmitted: true,
        candidateName: `${attempt.candidate.firstName} ${attempt.candidate.lastName}`,
        agencyName: attempt.agency.name,
        submittedAt: attempt.submittedAt,
        message: "Votre test a déjà été transmis avec succès. Merci !",
      });
    }

    // 4. PRÉVENTION DE LA FRAUDE : Retirer les indicateurs 'isCorrect' des options QCM
    const sanitizedQuestions = attempt.assessment.questions.map((q) => {
      let sanitizedOptions = null;
      if (Array.isArray(q.options)) {
        sanitizedOptions = (q.options as Array<{ id: string; text: string }>).map((opt) => ({
          id: opt.id,
          text: opt.text,
        }));
      }

      return {
        id: q.id,
        order: q.order,
        type: q.type,
        prompt: q.prompt,
        options: sanitizedOptions,
        points: q.points,
        required: q.required,
      };
    });

    // Option de mélange si activée
    if (attempt.assessment.shuffleQuestions) {
      sanitizedQuestions.sort(() => Math.random() - 0.5);
    }

    return NextResponse.json({
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      consentAt: attempt.consentAt,
      expiresAt: attempt.expiresAt,
      durationMinutes: attempt.assessment.durationMinutes,
      assessment: {
        title: attempt.assessment.title,
        description: attempt.assessment.description,
        instructions: attempt.assessment.instructions,
      },
      candidate: attempt.candidate,
      agency: attempt.agency,
      questions: sanitizedQuestions,
      savedAnswers: attempt.answers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
      })),
    });
  } catch (error) {
    console.error("Erreur résolution test public:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
