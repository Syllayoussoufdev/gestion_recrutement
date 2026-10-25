import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientOffreDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/client/offres/${id}/shortlist`);
}
