import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { QuestionType } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const optionSchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1, "Le texte de l'option est requis"),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().default(0),
  type: z.nativeEnum(QuestionType),
  prompt: z.string().trim().min(1, "L'énoncé de la question est requis"),
  options: z.array(optionSchema).optional().nullable(),
  points: z.number().positive().default(1.0),
  skillTag: z.string().trim().optional().nullable(),
  rubric: z.string().trim().optional().nullable(),
  required: z.boolean().default(true),
});

const assessmentUpdateSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis"),
  description: z.string().trim().optional().nullable(),
  instructions: z.string().trim().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  passPercent: z.number().int().min(0).max(100).default(70),
  reviewPercent: z.number().int().min(0).max(100).default(50),
  maxAttempts: z.number().int().positive().default(1),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  isActive: z.boolean().default(true),
  questions: z.array(questionSchema).min(1, "Au moins une question est requise"),
});

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = forAgency(auth.session);

  try {
    const assessment = await db.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
        offers: {
          select: { id: true, title: true },
        },
        _count: {
          select: { attempts: true },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
    }

    return NextResponse.json(assessment);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture évaluation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = assessmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const db = forAgency(auth.session);

  try {
    const existing = await db.assessment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
    }

    // Supprimer anciennes questions et recréer pour mise à jour propre
    await db.jobQuestion.deleteMany({
      where: { assessmentId: id },
    });

    const updated = await db.assessment.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description || null,
        instructions: data.instructions || null,
        durationMinutes: data.durationMinutes || null,
        passPercent: data.passPercent,
        reviewPercent: data.reviewPercent,
        maxAttempts: data.maxAttempts,
        shuffleQuestions: data.shuffleQuestions,
        shuffleOptions: data.shuffleOptions,
        isActive: data.isActive,
        questions: {
          create: data.questions.map((q, idx) => ({
            agencyId: auth.session.agencyId!,
            order: q.order ?? idx,
            type: q.type,
            prompt: q.prompt,
            options: q.options || undefined,
            points: q.points,
            skillTag: q.skillTag || null,
            rubric: q.rubric || null,
            required: q.required,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur modification évaluation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
