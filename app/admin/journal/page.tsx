import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import AuditLogViewer, { AuditLogEntry } from "@/components/admin/AuditLogViewer";

export default async function AdminJournalPage() {
  const session = await getSession();
  if (!session || session.role !== "AGENCY_ADMIN" || !session.agencyId) {
    redirect("/login");
  }

  const db = forAgency(session);

  const [rawLogs, totalCount] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actorUser: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    }),
    db.auditLog.count(),
  ]);

  const initialLogs: AuditLogEntry[] = rawLogs.map((log) => ({
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
    metadata: log.metadata as Record<string, unknown> | null,
    actorUser: log.actorUser,
  }));

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Journal d&apos;Audit &amp; Sécurité</h1>
        <p className="text-sm text-slate-500">
          Traçabilité exhaustive et inaltérable des accès aux documents privés, exports CSV, décisions clients et opérations RGPD.
        </p>
      </div>

      <AuditLogViewer initialLogs={initialLogs} totalCount={totalCount} />
    </div>
  );
}
