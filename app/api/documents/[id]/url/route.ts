import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { generatePrivateDownloadUrl } from "@/lib/cloudinary";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteParams) {
  const auth = await requireRole(request, [
    "AGENCY_ADMIN",
    "CONSULTANT",
    "PLATFORM_ADMIN",
    "CLIENT",
    "CANDIDAT",
  ]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { session } = auth;

  try {
    // 1. Chercher d'abord dans la table Document
    let targetAgencyId: string | null = null;
    let candidateId: string | null = null;
    let publicId: string | null = null;
    let resourceType: "raw" | "image" = "raw";
    let label = "Document";

    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        candidate: {
          select: { id: true, agencyId: true, firstName: true, lastName: true },
        },
      },
    });

    if (doc) {
      targetAgencyId = doc.agencyId;
      candidateId = doc.candidateId;
      publicId = doc.publicId;
      resourceType = (doc.resourceType as "raw" | "image") || "raw";
      label = doc.label;
    } else {
      // 2. Si pas trouvé dans Document, vérifier si l'id correspond directement à un Candidat ayant un cvPublicId
      const candidate = await prisma.candidate.findUnique({
        where: { id },
        select: {
          id: true,
          agencyId: true,
          cvPublicId: true,
          cvResourceType: true,
          firstName: true,
          lastName: true,
        },
      });

      if (candidate && candidate.cvPublicId) {
        targetAgencyId = candidate.agencyId;
        candidateId = candidate.id;
        publicId = candidate.cvPublicId;
        resourceType = (candidate.cvResourceType as "raw" | "image") || "raw";
        label = `CV - ${candidate.firstName} ${candidate.lastName}`;
      }
    }

    if (!publicId || !targetAgencyId || !candidateId) {
      return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
    }

    // 3. Vérification des autorisations par rôle (R1 isolation multi-cabinet + R4 documents privés)
    if (session.role === "PLATFORM_ADMIN") {
      // Autorisé pour la supervision plateforme
    } else if (session.role === "AGENCY_ADMIN" || session.role === "CONSULTANT") {
      if (session.agencyId !== targetAgencyId) {
        return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
      }
    } else if (session.role === "CANDIDAT") {
      // Un candidat ne peut accéder qu'à ses propres documents
      if (session.candidateId !== candidateId) {
        return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
      }
    } else if (session.role === "CLIENT") {
      // Un client ne peut voir le CV d'un candidat que s'il est rattaché à son entreprise
      // ET que le CV a été partagé (cvSharedClient = true)
      if (!session.companyId) {
        return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
      }

      const activeApplication = await prisma.application.findFirst({
        where: {
          agencyId: targetAgencyId,
          candidateId,
          cvSharedClient: true,
          jobOffer: {
            companyId: session.companyId,
          },
        },
        select: { id: true },
      });

      if (!activeApplication) {
        return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // 4. Génération de l'URL signée temporaire (10 minutes)
    const { url, expiresAt } = generatePrivateDownloadUrl(publicId, resourceType, "", 600);

    // 5. Journal d'audit (R10 / PRD V2 §10.6)
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    await prisma.auditLog.create({
      data: {
        agencyId: targetAgencyId,
        actorUserId: session.userId,
        action: "DOCUMENT_VIEW",
        targetType: "Document",
        targetId: id,
        metadata: {
          candidateId,
          label,
          publicId,
          viewerRole: session.role,
        },
        ipAddress,
      },
    });

    return NextResponse.json({
      url,
      expiresAt: expiresAt.toISOString(),
      label,
    });
  } catch (error) {
    console.error("Erreur génération URL document signée:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
