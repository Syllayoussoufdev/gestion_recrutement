import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";

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
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar
        agencyName={agency.name}
        agencyLogoUrl={agency.logoUrl}
        brandKey={agency.brandKey}
        userFirstName={session.firstName}
        userLastName={session.lastName}
        userRole={session.role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
