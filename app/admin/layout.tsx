import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") ||
    !session.agencyId
  ) {
    redirect("/login");
  }

  const agency = await prisma.agency.findUnique({
    where: { id: session.agencyId },
    select: {
      name: true,
      logoUrl: true,
      brandKey: true,
    },
  });

  if (!agency) {
    redirect("/login");
  }

  return (
    <AdminShell
      agencyName={agency.name}
      agencyLogoUrl={agency.logoUrl}
      brandKey={agency.brandKey}
      userFirstName={session.firstName}
      userLastName={session.lastName}
      userRole={session.role}
    >
      {children}
    </AdminShell>
  );
}
