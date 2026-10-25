import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { forAgency, toTenantErrorResponse } from "@/lib/tenant";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const actionFilter = searchParams.get("action");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const db = forAgency(auth.session);

  try {
    const whereClause: Record<string, unknown> = {};
    if (actionFilter && actionFilter !== "ALL") {
      whereClause.action = actionFilter;
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          actorUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      }),
      db.auditLog.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    const tenantRes = toTenantErrorResponse(error);
    if (tenantRes) return tenantRes;
    console.error("Erreur lecture journal audit:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
