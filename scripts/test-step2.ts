import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { POST as loginPost } from "../app/api/auth/login/route";
import { GET as meGet } from "../app/api/auth/me/route";
import { middleware } from "../middleware";
import {
  forAgency,
  TenantResourceNotFoundError,
  UnscopedTenantAccessError,
} from "../lib/tenant";

const APP_ORIGIN = "http://localhost:3000";
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? "DevOnly_ChangeMe_2026!";

function extractSessionCookie(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader, "Set-Cookie doit être présent");
  const match = setCookieHeader.match(/stratos_session=[^;]+/);
  assert.ok(match, "Cookie stratos_session introuvable dans Set-Cookie");
  return match[0];
}

async function runTests() {
  console.log("=== Tests Étape 2' : Auth, Middleware, tokenVersion, Origin & forAgency ===");

  // Reset rate limit before running automated tests
  await prisma.rateLimit.deleteMany({});

  // 1. Protection CSRF Origin
  {
    const badOriginReq = new Request(`${APP_ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.invalid",
      },
      body: JSON.stringify({
        email: "admin@stratosconseil.test",
        password: DEV_PASSWORD,
      }),
    });
    const res = await loginPost(badOriginReq);
    assert.equal(res.status, 403, "Une origine externe doit être rejetée en 403");
    console.log("✔ [1/6] Protection CSRF Origin : requête externe rejetée (403)");
  }

  // 2. Connexion des 5 rôles
  const roleExpectations = [
    {
      email: "platform.admin@plateforme-recrutement.test",
      expectedRole: "PLATFORM_ADMIN",
      expectedRedirect: "/platform",
    },
    {
      email: "admin@stratosconseil.test",
      expectedRole: "AGENCY_ADMIN",
      expectedRedirect: "/admin",
    },
    {
      email: "consultant@stratosconseil.test",
      expectedRole: "CONSULTANT",
      expectedRedirect: "/admin",
    },
    {
      email: "client@techcorp.test",
      expectedRole: "CLIENT",
      expectedRedirect: "/client",
    },
    {
      email: "jean.dupont@candidat.test",
      expectedRole: "CANDIDAT",
      expectedRedirect: "/candidat",
    },
  ] as const;

  const cookiesByRole: Record<string, string> = {};

  for (const item of roleExpectations) {
    const req = new Request(`${APP_ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: APP_ORIGIN,
        Host: "localhost:3000",
      },
      body: JSON.stringify({
        email: item.email,
        password: DEV_PASSWORD,
      }),
    });

    const res = await loginPost(req);
    assert.equal(res.status, 200, `Login ${item.expectedRole} doit retourner 200`);
    const body = (await res.json()) as { role: string; redirectTo: string };
    assert.equal(body.role, item.expectedRole);
    assert.equal(body.redirectTo, item.expectedRedirect);

    const setCookie = res.headers.get("set-cookie");
    assert.ok(
      setCookie?.toLowerCase().includes("samesite=lax"),
      "Le cookie doit avoir SameSite=Lax"
    );
    assert.ok(
      setCookie?.toLowerCase().includes("httponly"),
      "Le cookie doit être HttpOnly"
    );

    cookiesByRole[item.expectedRole] = extractSessionCookie(setCookie);
  }
  console.log(
    "✔ [2/6] Connexion des 5 rôles (PLATFORM_ADMIN, AGENCY_ADMIN, CONSULTANT, CLIENT, CANDIDAT) + Cookie HttpOnly SameSite=Lax : OK"
  );

  // 3. Middleware : accès non authentifié et accès interdit inter-rôles
  {
    const unauthPageReq = new NextRequest(`${APP_ORIGIN}/admin/entreprises`);
    const unauthPageRes = await middleware(unauthPageReq);
    assert.equal(unauthPageRes.status, 307);
    assert.ok(
      unauthPageRes.headers.get("location")?.includes("/login?next=%2Fadmin%2Fentreprises")
    );

    const unauthApiReq = new NextRequest(`${APP_ORIGIN}/api/admin/entreprises`);
    const unauthApiRes = await middleware(unauthApiReq);
    assert.equal(unauthApiRes.status, 401);

    const clientToAdminReq = new NextRequest(`${APP_ORIGIN}/admin`, {
      headers: { cookie: cookiesByRole.CLIENT },
    });
    const clientToAdminRes = await middleware(clientToAdminReq);
    assert.equal(clientToAdminRes.status, 403, "CLIENT sur /admin doit recevoir 403");

    const consultantToPlatformReq = new NextRequest(`${APP_ORIGIN}/platform`, {
      headers: { cookie: cookiesByRole.CONSULTANT },
    });
    const consultantToPlatformRes = await middleware(consultantToPlatformReq);
    assert.equal(
      consultantToPlatformRes.status,
      403,
      "CONSULTANT sur /platform doit recevoir 403"
    );

    const consultantToAdminReq = new NextRequest(`${APP_ORIGIN}/admin`, {
      headers: { cookie: cookiesByRole.CONSULTANT },
    });
    const consultantToAdminRes = await middleware(consultantToAdminReq);
    assert.equal(
      consultantToAdminRes.status,
      200,
      "CONSULTANT sur /admin doit être autorisé"
    );

    console.log(
      "✔ [3/6] Middleware par rôle (/platform, /admin, /client, /candidat) : redirections 307, 401 et 403 validées"
    );
  }

  // 4. Invalidation immédiate par incrémentation de tokenVersion en base
  {
    const meValidReq = new Request(`${APP_ORIGIN}/api/auth/me`, {
      headers: { cookie: cookiesByRole.CONSULTANT },
    });
    const meValidRes = await meGet(meValidReq);
    assert.equal(meValidRes.status, 200, "Session valide avant révocation");

    await prisma.user.update({
      where: { email: "consultant@stratosconseil.test" },
      data: { tokenVersion: { increment: 1 } },
    });

    const meRevokedReq = new Request(`${APP_ORIGIN}/api/auth/me`, {
      headers: { cookie: cookiesByRole.CONSULTANT },
    });
    const meRevokedRes = await meGet(meRevokedReq);
    assert.equal(
      meRevokedRes.status,
      401,
      "Session avec tokenVersion obsolète doit être rejetée en 401"
    );

    // Remise à 0 de tokenVersion après le test
    await prisma.user.update({
      where: { email: "consultant@stratosconseil.test" },
      data: { tokenVersion: 0 },
    });

    console.log("✔ [4/6] Révocation immédiate via tokenVersion en base : 401 validé");
  }

  // 5. Couche d'accès forAgency : requête sans portée refusée
  {
    assert.throws(
      () => forAgency(null),
      UnscopedTenantAccessError,
      "forAgency(null) doit lever UnscopedTenantAccessError"
    );
    assert.throws(
      () => forAgency({ agencyId: null }),
      UnscopedTenantAccessError,
      "forAgency({ agencyId: null }) doit lever UnscopedTenantAccessError"
    );
    assert.throws(
      () => forAgency(""),
      UnscopedTenantAccessError,
      "forAgency('') doit lever UnscopedTenantAccessError"
    );
    console.log(
      "✔ [5/6] Couche d'accès forAgency : requête sans agencyId refusée (UnscopedTenantAccessError)"
    );
  }

  // 6. Couche d'accès forAgency : isolation stricte et 404 sur ressource d'un autre cabinet
  {
    const stratos = await prisma.agency.findUniqueOrThrow({
      where: { slug: "stratos-conseil" },
    });
    const demo = await prisma.agency.findUniqueOrThrow({
      where: { slug: "cabinet-demo" },
    });

    const demoCompany = await prisma.company.findFirstOrThrow({
      where: { agencyId: demo.id },
    });

    const stratosDb = forAgency({ agencyId: stratos.id });
    const stratosCompanies = await stratosDb.company.findMany();

    assert.equal(stratosCompanies.length, 1);
    assert.equal(stratosCompanies[0]?.agencyId, stratos.id);

    const crossFindUnique = await stratosDb.company.findUnique({
      where: { id: demoCompany.id },
    });
    assert.equal(
      crossFindUnique,
      null,
      "findUnique sur un ID d'un autre cabinet doit retourner null"
    );

    await assert.rejects(
      async () => {
        await stratosDb.company.findUniqueOrThrow({
          where: { id: demoCompany.id },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TenantResourceNotFoundError);
        assert.equal(err.statusCode, 404);
        return true;
      },
      "findUniqueOrThrow sur un autre cabinet doit lever TenantResourceNotFoundError (404)"
    );

    await assert.rejects(
      async () => {
        await stratosDb.company.update({
          where: { id: demoCompany.id },
          data: { name: "Tentative Modification Inter-Cabinet" },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TenantResourceNotFoundError);
        assert.equal(err.statusCode, 404);
        return true;
      },
      "update sur un autre cabinet doit lever TenantResourceNotFoundError (404)"
    );

    console.log(
      "✔ [6/6] Isolation inter-cabinets via forAgency : filtrage auto + 404 systématique sur ressource d'un autre cabinet"
    );
  }

  await prisma.rateLimit.deleteMany({});
  console.log("=== Tous les tests de l'Étape 2' sont VERTS ===");
}

runTests()
  .catch((err) => {
    console.error("Échec des tests Étape 2' :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
