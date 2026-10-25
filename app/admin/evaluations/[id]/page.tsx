import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  HelpCircle,
  ArrowLeft,
  Clock,
  Briefcase,
  Layers,
  Edit,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAssessmentDetailPage({ params }: PageProps) {
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

  let assessment;
  try {
    assessment = await db.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
        offers: {
          select: { id: true, title: true, company: { select: { name: true } } },
        },
        _count: {
          select: { attempts: true },
        },
      },
    });
  } catch (err) {
    console.error(err);
  }

  if (!assessment) {
    notFound();
  }

  const totalPoints = assessment.questions.reduce((sum, q) => sum + (q.points || 1), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/evaluations"
            className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {assessment.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {assessment.questions.length} questions • Barème total : {totalPoints} pts
            </p>
          </div>
        </div>
      </div>

      {/* Cartes d'infos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Durée limite</p>
          <p className="text-base font-bold text-slate-900">
            {assessment.durationMinutes ? `${assessment.durationMinutes} minutes` : "Libre (aucun chrono)"}
          </p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Seuil validation</p>
          <p className="text-base font-bold text-emerald-700">≥ {assessment.passPercent}%</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Tests passés</p>
          <p className="text-base font-bold text-slate-900">{assessment._count.attempts} tentative(s)</p>
        </Card>
      </div>

      {/* Offres associées */}
      {assessment.offers.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Offres utilisant cette évaluation :</p>
          <div className="flex flex-wrap gap-2">
            {assessment.offers.map((offer) => (
              <Link
                key={offer.id}
                href={`/admin/offres/${offer.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{offer.title} ({offer.company.name})</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Liste des questions */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Aperçu des questions & Barème</h2>

        {assessment.questions.map((q, idx) => (
          <Card key={q.id} className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs bg-primary text-white rounded-full h-5 w-5 flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  {q.type === "MCQ_SINGLE" && "QCM Unique"}
                  {q.type === "MCQ_MULTI" && "QCM Multiples"}
                  {q.type === "SHORT_TEXT" && "Texte court"}
                  {q.type === "LONG_TEXT" && "Question ouverte"}
                </span>
                {q.skillTag && (
                  <Badge variant="secondary" className="text-[10px]">
                    {q.skillTag}
                  </Badge>
                )}
              </div>
              <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                {q.points} pt{q.points > 1 ? "s" : ""}
              </span>
            </div>

            <p className="text-sm font-semibold text-slate-900 pl-7">{q.prompt}</p>

            {/* Options QCM avec affichage des bonnes réponses pour les consultants */}
            {Array.isArray(q.options) && (
              <div className="pl-7 space-y-1.5 pt-1">
                {(q.options as Array<{ id: string; text: string; isCorrect: boolean }>).map((opt) => (
                  <div
                    key={opt.id}
                    className={`flex items-center gap-2 text-xs p-2 rounded border ${
                      opt.isCorrect
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-medium"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                    }`}
                  >
                    {opt.isCorrect ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-300 shrink-0" />
                    )}
                    <span>{opt.text}</span>
                    {opt.isCorrect && (
                      <span className="ml-auto text-[10px] text-emerald-700 font-bold uppercase">
                        Correct
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {q.rubric && (
              <div className="pl-7 pt-1 text-xs text-muted-foreground bg-slate-50 p-2.5 rounded border">
                <strong>Barème consultant :</strong> {q.rubric}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
