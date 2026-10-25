import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * PRD V2 §10.5 — Protection CSRF :
 * Vérifie l'en-tête Origin sur toutes les requêtes qui modifient des données.
 * Retourne null si la requête est valide, ou une NextResponse 403 si invalide.
 */
export function verifyOrigin(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) {
    return null;
  }

  const originHeader = request.headers.get("origin");
  const hostHeader =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!originHeader) {
    return NextResponse.json(
      { error: "En-tête Origin manquant (protection CSRF)" },
      { status: 403 }
    );
  }

  let originHost: string;
  try {
    const parsedOrigin = new URL(originHeader);
    originHost = parsedOrigin.host;
  } catch {
    return NextResponse.json(
      { error: "En-tête Origin invalide (protection CSRF)" },
      { status: 403 }
    );
  }

  const allowedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  let allowedAppHost: string | null = null;
  if (allowedAppUrl) {
    try {
      allowedAppHost = new URL(allowedAppUrl).host;
    } catch {
      allowedAppHost = null;
    }
  }

  const isHostMatch = Boolean(hostHeader && originHost === hostHeader);
  const isAppUrlMatch = Boolean(allowedAppHost && originHost === allowedAppHost);

  if (!isHostMatch && !isAppUrlMatch) {
    return NextResponse.json(
      { error: "Origine non autorisée (protection CSRF)" },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Récupère l'adresse IP du client depuis les en-têtes standards.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * PRD V2 §10.4 — Limitation de débit persistante compatible serverless via PostgreSQL (RateLimit).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = new Date();
  const nextReset = new Date(now.getTime() + windowSeconds * 1000);

  const existing = await prisma.rateLimit.findUnique({
    where: { key },
  });

  if (!existing || existing.resetAt <= now) {
    const record = await prisma.rateLimit.upsert({
      where: { key },
      update: {
        count: 1,
        resetAt: nextReset,
      },
      create: {
        key,
        count: 1,
        resetAt: nextReset,
      },
    });

    return {
      allowed: true,
      remaining: Math.max(0, limit - record.count),
      resetAt: record.resetAt,
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  const updated = await prisma.rateLimit.update({
    where: { key },
    data: {
      count: { increment: 1 },
    },
  });

  return {
    allowed: true,
    remaining: Math.max(0, limit - updated.count),
    resetAt: updated.resetAt,
  };
}
