import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import OfferForm from "@/components/admin/OfferForm";

interface PageProps {
  searchParams: Promise<{ companyId?: string }>;
}

export default async function AdminOffreNewPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") || !session.agencyId) {
    redirect("/login");
  }

  const { companyId } = await searchParams;
  const db = forAgency(session);

  const companies = await db.company.findMany({
    where: { archived: false },
    select: {
      id: true,
      name: true,
      logoUrl: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <OfferForm
      companies={companies}
      defaultCompanyId={companyId}
    />
  );
}
