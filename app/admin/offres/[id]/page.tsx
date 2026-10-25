import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  MapPin,
  Banknote,
  Calendar,
  ArrowLeft,
  Users,
  Clock,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { marked } from "marked";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import OfferDetailActions from "@/components/admin/OfferDetailActions";
import { ApplicationStatus, OfferStatus } from "@prisma/client";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  IDENTIFIED: "Identifié",
  CONTACTED: "Contacté",
  ASSESSMENT_SENT: "Test envoyé",
  ASSESSMENT_DONE: "Test passé",
  VALIDATED: "Validé consultant",
  RH_INTERVIEW: "Entretien RH",
  PRESENTED: "Présenté client",
  INTERVIEW_REQUESTED: "Entretien demandé",
  INTERVIEW_SCHEDULED: "Entretien planifié",
  CLIENT_INTERVIEW: "Entretien client",
  OFFER: "Proposition",
  PLACED: "Placé ✓",
  REJECTED: "Refusé ✗",
};

export default async function AdminOffreDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session || (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") || !session.agencyId) {
    redirect("/login");
  }

  const { id } = await params;
  const db = forAgency(session);

  let offer;
  let allCandidates;

  try {
    [offer, allCandidates] = await Promise.all([
      db.jobOffer.findUniqueOrThrow({
        where: { id },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              city: true,
            },
          },
          applications: {
            orderBy: { updatedAt: "desc" },
            include: {
              candidate: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  currentTitle: true,
                  skills: true,
                },
              },
              statusHistory: {
                orderBy: { changedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      }),
      db.candidate.findMany({
        where: { archived: false },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          currentTitle: true,
          skills: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
    ]);
  } catch {
    notFound();
  }

  const assignedCandidateIds = new Set(offer.applications.map((a) => a.candidateId));
  const availableCandidates = allCandidates.filter((c) => !assignedCandidateIds.has(c.id));

  // Répartition par étape
  const countsByStatus: Partial<Record<ApplicationStatus, number>> = {};
  for (const app of offer.applications) {
    countsByStatus[app.status] = (countsByStatus[app.status] || 0) + 1;
  }

  function getOfferStatusBadge(st: OfferStatus) {
    switch (st) {
      case "OPEN":
        return <Badge variant="success">Ouverte</Badge>;
      case "DRAFT":
        return <Badge variant="warning">Brouillon</Badge>;
      case "CLOSED":
        return <Badge variant="secondary">Clôturée</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Retour & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/offres" className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>Toutes les offres</span>
          </Link>
        </Button>
        <OfferDetailActions
          offerId={offer.id}
          currentStatus={offer.status}
          availableCandidates={availableCandidates}
        />
      </div>

      {/* Header Fiche Offre */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {offer.title}
              </h1>
              {getOfferStatusBadge(offer.status)}
              <Badge variant="outline">{offer.contractType}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 sm:text-sm">
              <Link
                href={`/admin/entreprises/${offer.company.id}`}
                className="flex items-center gap-1.5 font-medium text-slate-900 hover:underline"
              >
                <Building2 className="h-4 w-4 text-slate-400" />
                <span>{offer.company.name}</span>
              </Link>
              {offer.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>{offer.location}</span>
                </span>
              )}
              {(offer.salaryMin != null || offer.salaryMax != null) && (
                <span className="flex items-center gap-1">
                  <Banknote className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    {offer.salaryMin != null && offer.salaryMax != null
                      ? `${offer.salaryMin.toLocaleString()} - ${offer.salaryMax.toLocaleString()} €`
                      : offer.salaryMin != null
                      ? `À partir de ${offer.salaryMin.toLocaleString()} €`
                      : `Jusqu'à ${offer.salaryMax?.toLocaleString()} €`}
                  </span>
                </span>
              )}
              <span className="flex items-center gap-1 text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>Créée le {new Date(offer.createdAt).toLocaleDateString("fr-FR")}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Compétences requises */}
        {offer.skills.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-2">Compétences :</span>
            {offer.skills.map((skill, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Résumé du Pipeline de Candidatures */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Candidats dans le pipeline ({offer.applications.length})</span>
            </CardTitle>
            <CardDescription>
              Progression des candidats assignés à ce recrutement.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Funnel badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(STATUS_LABELS).map(([statusKey, label]) => {
              const count = countsByStatus[statusKey as ApplicationStatus] || 0;
              if (count === 0 && !["IDENTIFIED", "PRESENTED", "PLACED"].includes(statusKey)) {
                return null;
              }
              return (
                <div
                  key={statusKey}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                    count > 0
                      ? "border-slate-300 bg-slate-50 font-semibold text-slate-900"
                      : "border-slate-100 text-slate-400"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    count > 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
                  }`}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Tableau des candidats assignés */}
          {offer.applications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-900">
                Aucun candidat assigné
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Assignez des profils pour démarrer le processus de sélection.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidat</TableHead>
                  <TableHead>Titre actuel</TableHead>
                  <TableHead>Statut dans le pipeline</TableHead>
                  <TableHead>Dernière activité</TableHead>
                  <TableHead className="text-right">Fiche</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offer.applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium text-slate-900">
                      <Link
                        href={`/admin/candidats/${app.candidate.id}`}
                        className="hover:underline"
                      >
                        {app.candidate.firstName} {app.candidate.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {app.candidate.currentTitle || "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                        {STATUS_LABELS[app.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {new Date(app.updatedAt).toLocaleDateString("fr-FR")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/candidats/${app.candidate.id}`}>
                          Voir profil
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Description de l'offre rendue en Markdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description du poste</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="prose prose-slate max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: marked.parse(offer.description) as string,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
