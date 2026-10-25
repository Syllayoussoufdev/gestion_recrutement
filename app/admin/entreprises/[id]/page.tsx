import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Globe,
  Mail,
  Phone,
  ArrowLeft,
  Briefcase,
  Users,
  Calendar,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CompanyDetailActions from "@/components/admin/CompanyDetailActions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEntrepriseDetailPage({ params }: PageProps) {
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
        offers: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: {
              select: { applications: true },
            },
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });
  } catch {
    notFound();
  }

  const activeOffers = company.offers.filter((o) => o.status === "OPEN");

  return (
    <div className="space-y-6">
      {/* Retour & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/entreprises" className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span>Toutes les entreprises</span>
          </Link>
        </Button>
        <CompanyDetailActions
          companyId={company.id}
          companyName={company.name}
          archived={company.archived}
        />
      </div>

      {/* Header Fiche Entreprise */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt={company.name}
              className="h-20 w-20 rounded-xl border border-slate-100 object-contain p-1"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Building2 className="h-10 w-10" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {company.name}
              </h1>
              {company.archived ? (
                <Badge variant="destructive">Archivée</Badge>
              ) : (
                <Badge variant="success">Active</Badge>
              )}
              {company.sector && (
                <Badge variant="secondary">{company.sector}</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 sm:text-sm">
              {company.siret && (
                <span className="font-mono text-xs">
                  SIRET : <strong>{company.siret}</strong>
                </span>
              )}
              {(company.city || company.address) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {[company.address, company.city].filter(Boolean).join(", ")}
                </span>
              )}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-slate-900 underline hover:text-slate-700"
                >
                  <Globe className="h-3.5 w-3.5 text-slate-400" />
                  {company.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grille Informations : Contacts & Offres */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Colonne Gauche : Contacts (1/3) */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>Contacts ({company.contacts.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {company.contacts.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun contact enregistré.</p>
              ) : (
                company.contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">
                        {contact.firstName} {contact.lastName}
                      </p>
                      {contact.isPrimary && (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                          Principal
                        </span>
                      )}
                    </div>
                    {contact.position && (
                      <p className="text-xs text-slate-500">{contact.position}</p>
                    )}
                    <div className="space-y-1 pt-1 text-xs text-slate-600">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center gap-1.5 hover:underline"
                        >
                          <Mail className="h-3 w-3 text-slate-400" />
                          <span>{contact.email}</span>
                        </a>
                      )}
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="flex items-center gap-1.5 hover:underline"
                        >
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>{contact.phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Utilisateurs avec accès Client */}
          {company.users.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Accès Portail Entreprise</CardTitle>
                <CardDescription>
                  Comptes clients autorisés à suivre les recrutements.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {company.users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-md border border-slate-100 p-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-slate-500">{u.email}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {u.role}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Colonne Droite : Offres d'emploi (2/3) */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  <span>Offres d&apos;emploi ({company.offers.length})</span>
                </CardTitle>
                <CardDescription>
                  {activeOffers.length} offre{activeOffers.length > 1 ? "s" : ""} en cours de recrutement.
                </CardDescription>
              </div>
              <Button size="sm" asChild>
                <Link href={`/admin/offres/new?companyId=${company.id}`}>
                  <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                  <span>Créer une offre</span>
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {company.offers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
                  <Briefcase className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    Aucune offre liée
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Créez la première offre d&apos;emploi pour cette entreprise.
                  </p>
                  <Button size="sm" className="mt-4" asChild>
                    <Link href={`/admin/offres/new?companyId=${company.id}`}>
                      Créer une offre
                    </Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titre de l&apos;offre</TableHead>
                      <TableHead>Type de contrat</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-center">Candidats</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.offers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/admin/offres/${offer.id}`}
                            className="text-slate-900 hover:underline"
                          >
                            {offer.title}
                          </Link>
                          {offer.location && (
                            <p className="text-xs text-slate-400">{offer.location}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{offer.contractType}</Badge>
                        </TableCell>
                        <TableCell>
                          {offer.status === "OPEN" ? (
                            <Badge variant="success">Ouverte</Badge>
                          ) : offer.status === "CLOSED" ? (
                            <Badge variant="secondary">Clôturée</Badge>
                          ) : (
                            <Badge variant="warning">Brouillon</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-slate-900">
                          {offer._count.applications}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/offres/${offer.id}`}>
                              Voir pipeline
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
        </div>
      </div>
    </div>
  );
}
