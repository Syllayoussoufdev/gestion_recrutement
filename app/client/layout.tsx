import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import ClientHeader from "@/components/client/ClientHeader";

/**
 * Règle 9 : Aucun composant shadcn/ui dans /client.
 */
export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.agencyId) {
    redirect("/login");
  }

  const agency = await prisma.agency.findUnique({
    where: { id: session.agencyId },
    select: {
      name: true,
      logoUrl: true,
    },
  });

  if (!agency) {
    redirect("/login");
  }

  let companyName = "Entreprise partenaire";
  if (session.companyId) {
    const db = forAgency(session);
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { name: true },
    });
    if (company) {
      companyName = company.name;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <ClientHeader
        agencyName={agency.name}
        agencyLogoUrl={agency.logoUrl}
        companyName={companyName}
        userFirstName={session.firstName}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
