import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE_NAME, verifySessionJwt } from "@/lib/jwt";

const ROUTE_ROLE_MAP: Array<{
  prefix: string;
  apiPrefix: string;
  allowedRoles: Role[];
}> = [
  {
    prefix: "/platform",
    apiPrefix: "/api/platform",
    allowedRoles: ["PLATFORM_ADMIN"],
  },
  {
    prefix: "/admin",
    apiPrefix: "/api/admin",
    allowedRoles: ["AGENCY_ADMIN", "CONSULTANT"],
  },
  {
    prefix: "/client",
    apiPrefix: "/api/client",
    allowedRoles: ["CLIENT"],
  },
  {
    prefix: "/candidat",
    apiPrefix: "/api/candidat",
    allowedRoles: ["CANDIDAT"],
  },
];

function getRequiredRolesForPath(pathname: string): {
  isApi: boolean;
  allowedRoles: Role[];
} | null {
  for (const rule of ROUTE_ROLE_MAP) {
    if (pathname === rule.apiPrefix || pathname.startsWith(`${rule.apiPrefix}/`)) {
      return { isApi: true, allowedRoles: rule.allowedRoles };
    }
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return { isApi: false, allowedRoles: rule.allowedRoles };
    }
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const matchedRule = getRequiredRolesForPath(pathname);

  if (!matchedRule) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    if (matchedRule.isApi) {
      return NextResponse.json(
        { error: "Authentification requise" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = await verifySessionJwt(token);
  if (!payload) {
    if (matchedRule.isApi) {
      return NextResponse.json(
        { error: "Session invalide ou expirée" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!matchedRule.allowedRoles.includes(payload.role)) {
    return NextResponse.json(
      { error: "Accès interdit pour ce rôle" },
      { status: 403 }
    );
  }

  // Les rôles rattachés à un cabinet doivent impérativement avoir un agencyId dans le JWT
  if (payload.role !== "PLATFORM_ADMIN" && !payload.agencyId) {
    return NextResponse.json(
      { error: "Portée cabinet (agencyId) manquante dans la session" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/(platform|admin|client|candidat)(.*)",
    "/api/(platform|admin|client|candidat)(.*)",
  ],
};
