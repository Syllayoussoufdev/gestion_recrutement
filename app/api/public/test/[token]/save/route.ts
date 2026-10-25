import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ token: string }>;
}

const saveSchema = z.object({
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

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { tokenHash },
      select: { id: true, agencyId: true, status: true },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Test introuvable" }, { status: 404 });
    }

    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.GRADED) {
      return NextResponse.json({ error: "Test déjà soumis" }, { status: 400 });
    }

    // Sauvegarde atomique des réponses
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

    return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Erreur sauvegarde réponses test:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
