import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import CandidatHeader from "@/components/candidat/CandidatHeader";

/**
 * Règle 9 : Aucun composant shadcn/ui dans /candidat.
 */
export default async function CandidatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "CANDIDAT" || !session.agencyId) {
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

  return (
    <div className="min-h-screen bg-slate-50">
      <CandidatHeader
        agencyName={agency.name}
        agencyLogoUrl={agency.logoUrl}
        userFirstName={session.firstName}
      />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
