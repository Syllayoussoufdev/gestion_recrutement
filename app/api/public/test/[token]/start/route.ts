import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Jeton manquant" }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const attempt = await prisma.assessmentAttempt.findUnique({
      where: { tokenHash },
    });

    if (!attempt) {
      return NextResponse.json({ error: "Test introuvable" }, { status: 404 });
    }

    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.GRADED) {
      return NextResponse.json({ error: "Ce test est déjà soumis." }, { status: 400 });
    }

    const now = new Date();
    const updated = await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: AttemptStatus.STARTED,
        startedAt: attempt.startedAt || now,
        consentAt: attempt.consentAt || now,
      },
    });

    return NextResponse.json({
      success: true,
      startedAt: updated.startedAt,
      consentAt: updated.consentAt,
    });
  } catch (error) {
    console.error("Erreur démarrage test:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
