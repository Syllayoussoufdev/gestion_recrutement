import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { executeRetentionPurge } from "@/lib/retention";

export async function POST(request: Request) {
  const session = await getSession(request);

  // Autoriser soit un AGENCY_ADMIN connecté, soit un cron via en-tête x-cron-secret
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const expectedCronSecret = process.env.CRON_SECRET || "dev_cron_secret_stratos_2026";
  const isCronAuth = cronSecretHeader && cronSecretHeader === expectedCronSecret;

  let targetAgencyId: string | null = null;
  let actorUserId: string | null = null;

  if (isCronAuth) {
    // Si cron, agencyId peut être spécifié dans l'URL (?agencyId=...) ou le corps
    const { searchParams } = new URL(request.url);
    targetAgencyId = searchParams.get("agencyId");
    if (!targetAgencyId) {
      return NextResponse.json(
        { error: "Paramètre agencyId obligatoire pour exécution cron." },
        { status: 400 }
      );
    }
  } else {
    if (!session || session.role !== "AGENCY_ADMIN" || !session.agencyId) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs du cabinet." },
        { status: 403 }
      );
    }
    targetAgencyId = session.agencyId;
    actorUserId = session.userId;
  }

  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;

  try {
    const result = await executeRetentionPurge(targetAgencyId, actorUserId, ipAddress);

    return NextResponse.json({
      success: true,
      message: "Purge de rétention RGPD exécutée avec succès.",
      ...result,
    });
  } catch (error) {
    console.error("Erreur purge rétention:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de la purge" },
      { status: 500 }
    );
  }
}
