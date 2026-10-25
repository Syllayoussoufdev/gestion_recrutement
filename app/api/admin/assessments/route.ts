import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { QuestionType } from "@prisma/client";

const optionSchema = z.object({
  id: z.string(),
  text: z.string().trim().min(1, "Le texte de l'option est requis"),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  order: z.number().int().default(0),
  type: z.nativeEnum(QuestionType),
  prompt: z.string().trim().min(1, "L'énoncé de la question est requis"),
  options: z.array(optionSchema).optional().nullable(),
  points: z.number().positive().default(1.0),
  skillTag: z.string().trim().optional().nullable(),
  rubric: z.string().trim().optional().nullable(),
  required: z.boolean().default(true),
});

const assessmentSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis"),
  description: z.string().trim().optional().nullable(),
  instructions: z.string().trim().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  passPercent: z.number().int().min(0).max(100).default(70),
  reviewPercent: z.number().int().min(0).max(100).default(50),
  maxAttempts: z.number().int().positive().default(1),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  questions: z.array(questionSchema).min(1, "Au moins une question est requise"),
});

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  const db = forAgency(auth.session);

  try {
    const assessments = await db.assessment.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            questions: true,
            offers: true,
            attempts: true,
          },
        },
      },
    });

    return NextResponse.json(assessments);
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur liste évaluations:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = assessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const db = forAgency(auth.session);

  try {
    const assessment = await db.assessment.create({
      data: {
        agencyId: auth.session.agencyId!,
        title: data.title,
        description: data.description || null,
        instructions: data.instructions || null,
        durationMinutes: data.durationMinutes || null,
        passPercent: data.passPercent,
        reviewPercent: data.reviewPercent,
        maxAttempts: data.maxAttempts,
        shuffleQuestions: data.shuffleQuestions,
        shuffleOptions: data.shuffleOptions,
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
        questions: true,
      },
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur création évaluation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
