import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { verifyOrigin } from "@/lib/security";

/**
 * POST /api/auth/logout
 * Efface le cookie stratos_session (maxAge=0).
 */
export async function POST(request: Request) {
  const originError = verifyOrigin(request);
  if (originError) {
    return originError;
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  clearSessionCookie(response);
  return response;
}
