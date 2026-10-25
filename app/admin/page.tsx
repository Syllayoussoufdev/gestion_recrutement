import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Kanban,
  HelpCircle,
  Plus,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApplicationStatus } from "@prisma/client";

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") ||
    !session.agencyId
  ) {
    redirect("/login");
  }

  const db = forAgency(session);

  // Charger les compteurs et données en temps réel pour ce cabinet (Isolation R1)
  const [
    companiesCount,
    activeOffersCount,
    candidatesCount,
    placedCount,
    recentOffers,
    recentCandidates,
    applicationsByStatus,
  ] = await Promise.all([
    db.company.count({ where: { archived: false } }),
    db.jobOffer.count({ where: { status: "OPEN" } }),
    db.candidate.count({ where: { archived: false } }),
    db.application.count({ where: { status: ApplicationStatus.PLACED } }),
    db.jobOffer.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: {
        company: { select: { name: true } },
        _count: { select: { applications: true } },
      },
    }),
    db.candidate.findMany({
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        currentTitle: true,
        skills: true,
        updatedAt: true,
      },
    }),
    db.application.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const statusMap = new Map(applicationsByStatus.map((s) => [s.status, s._count.status]));
  const identifiedCount = statusMap.get(ApplicationStatus.IDENTIFIED) || 0;
  const inProgressCount =
    (statusMap.get(ApplicationStatus.CONTACTED) || 0) +
    (statusMap.get(ApplicationStatus.ASSESSMENT_SENT) || 0) +
    (statusMap.get(ApplicationStatus.ASSESSMENT_DONE) || 0) +
    (statusMap.get(ApplicationStatus.VALIDATED) || 0) +
    (statusMap.get(ApplicationStatus.RH_INTERVIEW) || 0);
  const presentedCount =
    (statusMap.get(ApplicationStatus.PRESENTED) || 0) +
    (statusMap.get(ApplicationStatus.CLIENT_INTERVIEW) || 0) +
    (statusMap.get(ApplicationStatus.OFFER) || 0);

  return (
    <div className="space-y-8">
      {/* En-tête de bienvenue */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tableau de Bord — {session.agencyName || "Espace Cabinet"}
          </h1>
          <p className="text-sm text-slate-600">
            Bienvenue {session.firstName}. Suivi en temps réel de votre activité de recrutement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/offres/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Nouvelle offre
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/candidats/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Nouveau candidat
            </Link>
          </Button>
        </div>
      </div>

      {/* Cartes KPI colorées (inspirées du tableau de bord de gestion présenté) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Entreprises clientes (Bleu) */}
        <div className="rounded-xl border bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-blue-100">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Entreprises Clientes
            </span>
            <Building2 className="h-5 w-5 opacity-80" />
          </div>
          <div className="text-3xl font-extrabold">{companiesCount}</div>
          <p className="text-xs text-blue-200">Partenaires actifs en compte</p>
        </div>

        {/* KPI 2 : Offres actives (Orange / Rouge) */}
        <div className="rounded-xl border bg-gradient-to-br from-amber-500 to-amber-600 text-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-amber-100">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Missions Ouvertes
            </span>
            <Briefcase className="h-5 w-5 opacity-80" />
          </div>
          <div className="text-3xl font-extrabold">{activeOffersCount}</div>
          <p className="text-xs text-amber-100">Postes en cours de recrutement</p>
        </div>

        {/* KPI 3 : Vivier Candidats (Vert / Émeraude) */}
        <div className="rounded-xl border bg-gradient-to-br from-emerald-600 to-emerald-700 text-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-emerald-100">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Vivier Candidats
            </span>
            <Users className="h-5 w-5 opacity-80" />
          </div>
          <div className="text-3xl font-extrabold">{candidatesCount}</div>
          <p className="text-xs text-emerald-200">Profils qualifiés & CV sécurisés</p>
        </div>

        {/* KPI 4 : Placements Réussis (Violet / Indigo) */}
        <div className="rounded-xl border bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-indigo-100">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Placements Conclus
            </span>
            <CheckCircle2 className="h-5 w-5 opacity-80" />
          </div>
          <div className="text-3xl font-extrabold">{placedCount}</div>
          <p className="text-xs text-indigo-200">Recrutements finalisés avec succès</p>
        </div>
      </div>

      {/* Barre de funnel de recrutement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            État global du Pipeline de Recrutement
          </CardTitle>
          <CardDescription>
            Répartition des candidatures actives au travers des étapes du processus.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
            <div className="p-3 bg-slate-50 rounded-lg border text-center space-y-1">
              <p className="text-xs text-muted-foreground">Sourcing & Vivier</p>
              <p className="text-xl font-bold text-slate-800">{identifiedCount}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center space-y-1">
              <p className="text-xs text-blue-700 font-medium">Évaluations & RH</p>
              <p className="text-xl font-bold text-blue-900">{inProgressCount}</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center space-y-1">
              <p className="text-xs text-amber-700 font-medium">Présentés Client</p>
              <p className="text-xl font-bold text-amber-900">{presentedCount}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center space-y-1">
              <p className="text-xs text-emerald-700 font-medium">Recrutés (Placés)</p>
              <p className="text-xl font-bold text-emerald-900">{placedCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grille Offres récentes & Candidats récents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Offres récentes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Missions Recrutement Récentes
              </CardTitle>
              <CardDescription>Dernières offres publiées</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/admin/offres">
                Tout voir
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentOffers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Aucune offre créée pour le moment.
              </p>
            ) : (
              recentOffers.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <Link
                      href={`/admin/offres/${o.id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-primary transition-colors block"
                    >
                      {o.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{o.company.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                      <Link href={`/admin/offres/${o.id}/pipeline`}>
                        <Kanban className="h-3 w-3 mr-1" />
                        Pipeline ({o._count.applications})
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Candidats récents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Derniers Candidats Intégrés
              </CardTitle>
              <CardDescription>Mises à jour récentes du vivier</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/admin/candidats">
                Tout voir
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Aucun candidat dans le vivier.
              </p>
            ) : (
              recentCandidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <Link
                      href={`/admin/candidats/${c.id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-primary transition-colors block"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.currentTitle || "Sans titre renseigné"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1 max-w-xs justify-end">
                    {c.skills.slice(0, 2).map((sk) => (
                      <span
                        key={sk}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                      >
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
