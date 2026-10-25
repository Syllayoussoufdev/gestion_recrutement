import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Vérifie la session courante (y compris tokenVersion et statut du cabinet en base).
 */
export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Non authentifié ou session révoquée" },
      { status: 401 }
    );
  }

  return NextResponse.json({ user: session }, { status: 200 });
}
