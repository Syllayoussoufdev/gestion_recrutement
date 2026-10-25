import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import CompanyForm from "@/components/admin/CompanyForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEntrepriseEditPage({ params }: PageProps) {
  const session = await getSession();
  if (!session || (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") || !session.agencyId) {
    redirect("/login");
  }

  const { id } = await params;
  const db = forAgency(session);

  let company;
  try {
    company = await db.company.findUniqueOrThrow({
      where: { id },
      include: {
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    });
  } catch {
    notFound();
  }

  const initialData = {
    id: company.id,
    name: company.name,
    sector: company.sector,
    siret: company.siret,
    address: company.address,
    city: company.city,
    website: company.website,
    logoUrl: company.logoUrl,
    logoPublicId: company.logoPublicId,
    contacts: company.contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      position: c.position,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
    })),
  };

  return <CompanyForm initialData={initialData} isEdit={true} />;
}
