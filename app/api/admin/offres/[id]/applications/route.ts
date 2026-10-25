import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";
import { ApplicationStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const assignCandidateSchema = z.object({
  candidateId: z.string().min(1, "L'identifiant du candidat est requis"),
});

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { id: jobOfferId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide" },
      { status: 400 }
    );
  }

  const parsed = assignCandidateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { candidateId } = parsed.data;
  const db = forAgency(auth.session);

  try {
    // 1. Vérifier existence et portée de l'offre
    const offer = await db.jobOffer.findUnique({
      where: { id: jobOfferId },
      select: { id: true, title: true, status: true },
    });

    if (!offer) {
      return NextResponse.json(
        { error: "Offre d'emploi introuvable." },
        { status: 404 }
      );
    }

    // 2. Vérifier existence et portée du candidat
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidat introuvable dans votre cabinet." },
        { status: 404 }
      );
    }

    // 3. Vérifier doublon d'assignation
    const existing = await db.application.findUnique({
      where: {
        candidateId_jobOfferId: {
          candidateId,
          jobOfferId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Le candidat ${candidate.firstName} ${candidate.lastName} est déjà assigné à cette offre.` },
        { status: 409 }
      );
    }

    // 4. Créer l'application et l'historique initial
    const application = await db.application.create({
      data: {
        agencyId: auth.session.agencyId!,
        candidateId,
        jobOfferId,
        status: ApplicationStatus.IDENTIFIED,
        statusHistory: {
          create: {
            agencyId: auth.session.agencyId!,
            fromStatus: null,
            toStatus: ApplicationStatus.IDENTIFIED,
            changedByUserId: auth.session.userId,
            note: "Assignation initiale du candidat à l'offre",
          },
        },
      },
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            currentTitle: true,
            skills: true,
          },
        },
      },
    });

    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    return NextResponse.json(
      { error: "Erreur lors de l'assignation du candidat" },
      { status: 500 }
    );
  }
}
