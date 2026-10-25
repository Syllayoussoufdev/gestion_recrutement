import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import OfferForm, { OfferFormData } from "@/components/admin/OfferForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOffreEditPage({ params }: PageProps) {
  const session = await getSession();
  if (!session || (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") || !session.agencyId) {
    redirect("/login");
  }

  const { id } = await params;
  const db = forAgency(session);

  let offer;
  let companies;

  try {
    [offer, companies] = await Promise.all([
      db.jobOffer.findUniqueOrThrow({
        where: { id },
      }),
      db.company.findMany({
        where: { archived: false },
        select: {
          id: true,
          name: true,
          logoUrl: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);
  } catch {
    notFound();
  }

  const initialData: OfferFormData = {
    id: offer.id,
    companyId: offer.companyId,
    title: offer.title,
    description: offer.description,
    skills: offer.skills,
    contractType: offer.contractType,
    location: offer.location,
    salaryMin: offer.salaryMin,
    salaryMax: offer.salaryMax,
    status: offer.status,
  };

  return <OfferForm companies={companies} initialData={initialData} isEdit={true} />;
}
