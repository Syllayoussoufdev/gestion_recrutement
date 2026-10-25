import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  ArrowLeft,
  FileText,
  Clock,
  Building2,
  Tag,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CandidateDetailActions from "@/components/admin/CandidateDetailActions";
import DocumentItemAction from "@/components/admin/DocumentItemAction";
import { ApplicationStatus } from "@prisma/client";

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

export default async function AdminCandidateDetailPage({ params }: PageProps) {
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
      include: {
        applications: {
          orderBy: { updatedAt: "desc" },
          include: {
            jobOffer: {
              select: {
                id: true,
                title: true,
                status: true,
                company: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          include: {
            author: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        documents: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });
  } catch (err) {
    console.error("Erreur chargement candidat:", err);
  }

  if (!candidate) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Barre de navigation */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/candidats"
          className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm text-muted-foreground">Retour à la liste des candidats</span>
      </div>

      {/* Carte d'en-tête du profil */}
      <div className="bg-white p-6 rounded-xl border shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {candidate.firstName} {candidate.lastName}
              </h1>
              {candidate.archived && (
                <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">
                  Archivé
                </Badge>
              )}
            </div>
            <p className="text-base text-slate-700 font-medium">
              {candidate.currentTitle || "Poste non renseigné"}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {candidate.email}
              </span>
              {candidate.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {candidate.phone}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Disponibilité :{" "}
                {candidate.availableFrom
                  ? new Date(candidate.availableFrom).toLocaleDateString("fr-FR")
                  : "Immédiate"}
              </span>
              <span className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                Source : {candidate.source}
              </span>
            </div>
          </div>

          <CandidateDetailActions
            candidateId={candidate.id}
            hasCv={!!candidate.cvPublicId}
            isArchived={candidate.archived}
          />
        </div>

        {/* Compétences */}
        {candidate.skills && candidate.skills.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Compétences clés
            </p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grille principale : Candidatures & Documents / Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche (2/3) : Historique des candidatures */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Historique des candidatures ({candidate.applications.length})
              </CardTitle>
              <CardDescription>
                Offres d&apos;emploi auxquelles ce candidat a été associé.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {candidate.applications.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-4 text-center">
                  Ce candidat n&apos;est actuellement positionné sur aucune offre.
                </p>
              ) : (
                <div className="space-y-3">
                  {candidate.applications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-3.5 rounded-lg border hover:bg-slate-50 transition-colors"
                    >
                      <div className="space-y-1">
                        <Link
                          href={`/admin/offres/${app.jobOffer.id}`}
                          className="font-medium text-slate-900 hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          {app.jobOffer.title}
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {app.jobOffer.company.name} • Associé le{" "}
                          {new Date(app.createdAt).toLocaleDateString("fr-FR")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {STATUS_LABELS[app.status] || app.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes internes de suivi */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Notes et Journal de suivi ({candidate.notes.length})
              </CardTitle>
              <CardDescription>
                Commentaires internes des consultants et retours d&apos;entretiens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {candidate.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-4 text-center">
                  Aucune note de suivi enregistrée pour ce candidat.
                </p>
              ) : (
                <div className="space-y-4">
                  {candidate.notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3.5 rounded-lg border bg-slate-50/50 space-y-2 text-sm"
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {note.author.firstName} {note.author.lastName}
                          </span>
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            {note.tag === "INTERNAL" ? "Interne" : "Retour client"}
                          </Badge>
                        </div>
                        <span>{new Date(note.createdAt).toLocaleString("fr-FR")}</span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Colonne droite (1/3) : Documents privés Cloudinary (R4) */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Documents privés (R4)
              </CardTitle>
              <CardDescription>
                Accès sécurisé par URL signée temporaire (10 min).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidate.documents.length === 0 && !candidate.cvPublicId ? (
                <p className="text-sm text-muted-foreground italic py-4 text-center">
                  Aucun document enregistré.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {candidate.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-lg border bg-white space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-slate-900">{doc.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {doc.mimeType} • {(doc.sizeBytes / 1024).toFixed(0)} Ko
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Ajouté le {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                      </div>
                      <DocumentItemAction documentId={doc.id} label={doc.label} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
