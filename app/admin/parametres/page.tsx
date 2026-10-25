import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AgencySettingsForm, { AgencySettingsData } from "@/components/admin/AgencySettingsForm";

export default async function AdminParametresPage() {
  const session = await getSession();
  if (!session || session.role !== "AGENCY_ADMIN" || !session.agencyId) {
    redirect("/login");
  }

  const agency = await prisma.agency.findUnique({
    where: { id: session.agencyId },
    select: {
      id: true,
      name: true,
      slug: true,
      senderName: true,
      contactEmail: true,
      timezone: true,
      retentionMonths: true,
      testRetentionMonths: true,
      anonymizeUntilInterest: true,
      showScoreToCandidate: true,
      brandKey: true,
    },
  });

  if (!agency) {
    redirect("/login");
  }

  const initialSettings: AgencySettingsData = {
    ...agency,
    brandKey: (agency.brandKey as AgencySettingsData["brandKey"]) || "blue",
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Paramètres du Cabinet</h1>
        <p className="text-sm text-slate-500">
          Personnalisation de la marque blanche, règles de confidentialité et gestion des délais de rétention RGPD.
        </p>
      </div>

      <AgencySettingsForm initialSettings={initialSettings} />
    </div>
  );
}
