import Link from "next/link";
import { redirect } from "next/navigation";
import {
  HelpCircle,
  Plus,
  Clock,
  Briefcase,
  Layers,
  ChevronRight,
  CheckCircle2,
  FileQuestion,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function AdminEvaluationsPage() {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") ||
    !session.agencyId
  ) {
    redirect("/login");
  }

  const db = forAgency(session);
  const assessments = await db.assessment.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      questions: {
        select: { id: true, skillTag: true, type: true },
      },
      offers: {
        select: { id: true, title: true },
      },
      _count: {
        select: { attempts: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <HelpCircle className="h-7 w-7 text-primary" />
            Questionnaires d&apos;Évaluation
          </h1>
          <p className="text-sm text-slate-600">
            Tests techniques et métier à barème déterministe (R3). Utilisables sur plusieurs offres.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/admin/evaluations/new">
            <Plus className="mr-2 h-4 w-4" />
            Créer un questionnaire
          </Link>
        </Button>
      </div>

      {/* Liste des questionnaires */}
      {assessments.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <FileQuestion className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            Aucun questionnaire d&apos;évaluation
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Créez des tests QCM et questions ouvertes pour évaluer objectivement les candidats selon vos grilles de compétences.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href="/admin/evaluations/new">
                <Plus className="mr-2 h-4 w-4" />
                Créer un premier questionnaire
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assessments.map((a) => {
            const skillTags = Array.from(
              new Set(a.questions.map((q) => q.skillTag).filter(Boolean) as string[])
            );

            return (
              <Card key={a.id} className="hover:shadow-md transition-shadow flex flex-col justify-between">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900 line-clamp-1">
                      {a.title}
                    </CardTitle>
                    {a.isActive ? (
                      <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">
                        Actif
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactif
                      </Badge>
                    )}
                  </div>
                  {a.description && (
                    <CardDescription className="text-xs line-clamp-2">
                      {a.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      {a.questions.length} question(s)
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {a.durationMinutes ? `${a.durationMinutes} min` : "Libre"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      {a.offers.length} offre(s)
                    </span>
                  </div>

                  <div className="pt-2 border-t text-xs space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>Seuil validation :</span>
                      <strong className="text-emerald-700">≥ {a.passPercent}%</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Seuil à revoir :</span>
                      <strong className="text-amber-700">≥ {a.reviewPercent}%</strong>
                    </div>
                  </div>

                  {skillTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {skillTags.slice(0, 3).map((st) => (
                        <span key={st} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {st}
                        </span>
                      ))}
                      {skillTags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{skillTags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-3 flex items-center justify-between border-t text-xs">
                    <span className="text-muted-foreground">
                      {a._count.attempts} test(s) passé(s)
                    </span>
                    <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                      <Link href={`/admin/evaluations/${a.id}`}>
                        Voir le détail
                        <ChevronRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
