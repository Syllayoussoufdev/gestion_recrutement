import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import CandidateForm from "@/components/admin/CandidateForm";

export default function NewCandidatePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/candidats"
          className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" />
            Nouveau Candidat
          </h1>
          <p className="text-sm text-slate-600">
            Ajoutez un profil au vivier de votre cabinet avec son CV sécurisé.
          </p>
        </div>
      </div>

      <CandidateForm />
    </div>
  );
}
