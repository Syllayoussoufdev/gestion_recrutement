import Link from "next/link";
import { ArrowLeft, HelpCircle } from "lucide-react";
import AssessmentForm from "@/components/admin/AssessmentForm";

export default function NewAssessmentPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/evaluations"
          className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-primary" />
            Nouveau Questionnaire d&apos;Évaluation
          </h1>
          <p className="text-sm text-slate-600">
            Concevez un test technique ou métier avec barème déterministe (R3).
          </p>
        </div>
      </div>

      <AssessmentForm />
    </div>
  );
}
