import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import CandidateForm from "@/components/admin/CandidateForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCandidatePage({ params }: PageProps) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") ||
    !session.agencyId
  ) {
    redirect("/login");
  }

  const { id } = await params;
  const db = forAgency(session);

  let candidate;
  try {
    candidate = await db.candidate.findUnique({
      where: { id },
    });
  } catch (err) {
    console.error("Erreur lecture candidat:", err);
  }

  if (!candidate) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/candidats/${candidate.id}`}
          className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            Modifier le profil de {candidate.firstName} {candidate.lastName}
          </h1>
          <p className="text-sm text-slate-600">
            Mettez à jour les informations, compétences ou le CV du candidat.
          </p>
        </div>
      </div>

      <CandidateForm
        initialData={{
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          currentTitle: candidate.currentTitle,
          skills: candidate.skills,
          availableFrom: candidate.availableFrom?.toISOString() || null,
          source: candidate.source,
          cvPublicId: candidate.cvPublicId,
          cvResourceType: candidate.cvResourceType,
          cvDeliveryType: candidate.cvDeliveryType,
          cvMimeType: candidate.cvMimeType,
          cvSizeBytes: candidate.cvSizeBytes,
        }}
        isEdit
      />
    </div>
  );
}
