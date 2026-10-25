"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  History,
  XCircle,
  CheckCircle2,
  FileText,
  Clock,
  Plus,
  Loader2,
  X,
  Filter,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApplicationStatus } from "@prisma/client";

export interface CandidateSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  currentTitle: string | null;
  skills: string[];
  cvPublicId: string | null;
  availableFrom: string | null;
  lastActivityAt: string;
}

export interface ApplicationItem {
  id: string;
  status: ApplicationStatus;
  cvSharedClient: boolean;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: CandidateSummary;
  _count?: {
    statusHistory: number;
    messages: number;
  };
}

export interface JobOfferSummary {
  id: string;
  title: string;
  status: string;
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
    city: string | null;
  };
  applications: ApplicationItem[];
}

export interface HistoryItem {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  changedAt: string;
  note: string | null;
  reason: string | null;
  changedByUser?: {
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

const STAGES: { status: ApplicationStatus; label: string; color: string }[] = [
  { status: "IDENTIFIED", label: "Identifiés", color: "border-slate-300 bg-slate-50" },
  { status: "CONTACTED", label: "Contactés", color: "border-sky-300 bg-sky-50/50" },
  { status: "ASSESSMENT_SENT", label: "Test envoyé", color: "border-indigo-300 bg-indigo-50/50" },
  { status: "ASSESSMENT_DONE", label: "Test complété", color: "border-indigo-400 bg-indigo-50" },
  { status: "VALIDATED", label: "Validé consultant", color: "border-blue-400 bg-blue-50" },
  { status: "RH_INTERVIEW", label: "Entretien RH", color: "border-purple-300 bg-purple-50/50" },
  { status: "PRESENTED", label: "Présenté client", color: "border-amber-400 bg-amber-50" },
  { status: "INTERVIEW_REQUESTED", label: "Entretien demandé", color: "border-orange-300 bg-orange-50/50" },
  { status: "INTERVIEW_SCHEDULED", label: "Entretien planifié", color: "border-orange-400 bg-orange-50" },
  { status: "CLIENT_INTERVIEW", label: "Entretien client", color: "border-orange-500 bg-orange-50" },
  { status: "OFFER", label: "Proposition", color: "border-emerald-400 bg-emerald-50" },
  { status: "PLACED", label: "Placé ✓", color: "border-emerald-600 bg-emerald-100/60" },
  { status: "REJECTED", label: "Non retenu ✗", color: "border-rose-300 bg-rose-50/60" },
];

const STAGE_ORDER: ApplicationStatus[] = STAGES.map((s) => s.status);

interface KanbanBoardProps {
  initialOffer: JobOfferSummary;
}

export default function KanbanBoard({ initialOffer }: KanbanBoardProps) {
  const [applications, setApplications] = useState<ApplicationItem[]>(initialOffer.applications);
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<string>("ALL");
  const [movingAppId, setMovingAppId] = useState<string | null>(null);

  // Modals
  const [rejectionModalApp, setRejectionModalApp] = useState<ApplicationItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionNote, setRejectionNote] = useState("");
  const [submittingRejection, setSubmittingRejection] = useState(false);

  // History Modal
  const [historyModalApp, setHistoryModalApp] = useState<ApplicationItem | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Quick CV
  const [loadingCvId, setLoadingCvId] = useState<string | null>(null);

  // Extraire toutes les compétences uniques des candidats
  const allSkills = useMemo(() => {
    const set = new Set<string>();
    applications.forEach((app) => {
      app.candidate.skills.forEach((s) => set.add(s));
    });
    return Array.from(set).sort();
  }, [applications]);

  // Candidatures filtrées
  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const matchSearch =
        search.trim() === "" ||
        `${app.candidate.firstName} ${app.candidate.lastName}`
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        (app.candidate.currentTitle &&
          app.candidate.currentTitle.toLowerCase().includes(search.toLowerCase())) ||
        app.candidate.email.toLowerCase().includes(search.toLowerCase());

      const matchSkill =
        selectedSkill === "ALL" || app.candidate.skills.includes(selectedSkill);

      return matchSearch && matchSkill;
    });
  }, [applications, search, selectedSkill]);

  // Candidatures groupées par étape
  const groupedApps = useMemo(() => {
    const map: Record<ApplicationStatus, ApplicationItem[]> = {
      IDENTIFIED: [],
      CONTACTED: [],
      ASSESSMENT_SENT: [],
      ASSESSMENT_DONE: [],
      VALIDATED: [],
      RH_INTERVIEW: [],
      PRESENTED: [],
      INTERVIEW_REQUESTED: [],
      INTERVIEW_SCHEDULED: [],
      CLIENT_INTERVIEW: [],
      OFFER: [],
      PLACED: [],
      REJECTED: [],
    };
    filteredApps.forEach((app) => {
      if (map[app.status]) {
        map[app.status].push(app);
      }
    });
    return map;
  }, [filteredApps]);

  // Déplacement de statut
  async function handleMoveStatus(
    app: ApplicationItem,
    toStatus: ApplicationStatus,
    reason?: string,
    note?: string
  ) {
    if (toStatus === "REJECTED") {
      setRejectionModalApp(app);
      setRejectionReason("");
      setRejectionNote("");
      return;
    }

    setMovingAppId(app.id);
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, reason, note }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur de mise à jour");
      }

      const data = await res.json();
      setApplications((prev) =>
        prev.map((item) => (item.id === app.id ? { ...item, status: toStatus, updatedAt: new Date().toISOString() } : item))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setMovingAppId(null);
    }
  }

  // Soumission rejet explicite (Règle R2)
  async function handleConfirmRejection(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectionModalApp) return;

    setSubmittingRejection(true);
    try {
      const res = await fetch(`/api/admin/applications/${rejectionModalApp.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: "REJECTED",
          reason: rejectionReason.trim() || "Non retenu après examen",
          note: rejectionNote.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors du rejet");
      }

      setApplications((prev) =>
        prev.map((item) =>
          item.id === rejectionModalApp.id
            ? {
                ...item,
                status: "REJECTED",
                rejectionReason: rejectionReason.trim(),
                updatedAt: new Date().toISOString(),
              }
            : item
        )
      );
      setRejectionModalApp(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur lors du rejet");
    } finally {
      setSubmittingRejection(false);
    }
  }

  // Ouvrir modal historique
  async function handleOpenHistory(app: ApplicationItem) {
    setHistoryModalApp(app);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/admin/applications/${app.id}/history`);
      if (res.ok) {
        const json = await res.json();
        setHistoryItems(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }

  // Ouvrir CV signé (R4)
  async function handleOpenCv(candidateId: string) {
    setLoadingCvId(candidateId);
    try {
      const res = await fetch(`/api/documents/${candidateId}/url`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'accéder au document");
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur CV");
    } finally {
      setLoadingCvId(null);
    }
  }

  // Obtenir l'étape suivante dans le flux
  function getNextStatus(current: ApplicationStatus): ApplicationStatus | null {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx >= 0 && idx < STAGE_ORDER.length - 2) {
      return STAGE_ORDER[idx + 1];
    }
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Barre d'outils et filtres */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-xs">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un candidat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {allSkills.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs"
              >
                <option value="ALL">Toutes compétences</option>
                {allSkills.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Total candidats : <strong className="text-foreground">{filteredApps.length}</strong></span>
          <span>•</span>
          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
            {groupedApps.PLACED.length} placé(s)
          </span>
          <span>•</span>
          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-medium">
            {groupedApps.REJECTED.length} refusé(s)
          </span>
        </div>
      </div>

      {/* Grille Kanban avec défilement horizontal fluide */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[3200px]">
          {STAGES.map((stage) => {
            const apps = groupedApps[stage.status];
            return (
              <div
                key={stage.status}
                className="w-72 shrink-0 flex flex-col rounded-xl border bg-slate-50/70 shadow-xs max-h-[calc(100vh-250px)]"
              >
                {/* En-tête de colonne */}
                <div
                  className={`p-3 border-b rounded-t-xl font-medium text-xs flex items-center justify-between ${stage.color}`}
                >
                  <span className="font-semibold text-slate-800">{stage.label}</span>
                  <span className="inline-flex items-center justify-center h-5 px-2 rounded-full text-[11px] font-bold bg-white text-slate-700 border">
                    {apps.length}
                  </span>
                </div>

                {/* Cartes de candidatures */}
                <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
                  {apps.length === 0 ? (
                    <div className="h-24 flex items-center justify-center text-xs text-muted-foreground italic border-2 border-dashed border-slate-200 rounded-lg">
                      Aucun candidat
                    </div>
                  ) : (
                    apps.map((app) => {
                      const nextStatus = getNextStatus(app.status);
                      const isMoving = movingAppId === app.id;

                      return (
                        <div
                          key={app.id}
                          className="p-3 bg-white rounded-lg border shadow-xs hover:shadow-sm transition-shadow space-y-2.5"
                        >
                          {/* Titre & Lien vers candidat */}
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <Link
                                href={`/admin/candidats/${app.candidate.id}`}
                                className="font-semibold text-sm text-slate-900 hover:text-primary transition-colors flex items-center gap-1"
                              >
                                {app.candidate.firstName} {app.candidate.lastName}
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </Link>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {app.candidate.currentTitle || "Sans titre renseigné"}
                              </p>
                            </div>
                          </div>

                          {/* Compétences clés */}
                          {app.candidate.skills && app.candidate.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {app.candidate.skills.slice(0, 2).map((skill) => (
                                <span
                                  key={skill}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                                >
                                  {skill}
                                </span>
                              ))}
                              {app.candidate.skills.length > 2 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{app.candidate.skills.length - 2}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Motif de rejet si rejeté */}
                          {app.status === "REJECTED" && app.rejectionReason && (
                            <div className="p-2 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                              <span className="font-semibold">Motif :</span> {app.rejectionReason}
                            </div>
                          )}

                          {/* Barre d'outils de la carte */}
                          <div className="pt-2 border-t flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1">
                              {/* Bouton CV signé */}
                              {app.candidate.cvPublicId && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCv(app.candidate.id)}
                                  disabled={loadingCvId === app.candidate.id}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors"
                                  title="Consulter le CV (URL signée)"
                                >
                                  {loadingCvId === app.candidate.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                                  )}
                                </button>
                              )}

                              {/* Bouton Historique */}
                              <button
                                type="button"
                                onClick={() => handleOpenHistory(app)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors"
                                title="Voir l'historique des statuts"
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Actions de changement de statut */}
                            <div className="flex items-center gap-1">
                              {/* Rejeter (Règle R2) */}
                              {app.status !== "REJECTED" && app.status !== "PLACED" && (
                                <button
                                  type="button"
                                  onClick={() => handleMoveStatus(app, "REJECTED")}
                                  disabled={isMoving}
                                  className="p-1 rounded text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Non retenu (rejet avec motif)"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Bouton étape suivante rapide */}
                              {nextStatus && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMoveStatus(app, nextStatus)}
                                  disabled={isMoving}
                                  className="h-6 px-1.5 text-[11px] flex items-center gap-1 bg-slate-50 hover:bg-slate-100"
                                >
                                  {isMoving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <span>Suivant</span>
                                      <ArrowRight className="h-3 w-3" />
                                    </>
                                  )}
                                </Button>
                              )}

                              {/* Sélecteur de statut direct */}
                              <select
                                value={app.status}
                                onChange={(e) =>
                                  handleMoveStatus(app, e.target.value as ApplicationStatus)
                                }
                                disabled={isMoving}
                                className="h-6 text-[10px] bg-transparent border rounded px-1 max-w-[70px] text-muted-foreground cursor-pointer"
                              >
                                {STAGES.map((s) => (
                                  <option key={s.status} value={s.status}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL REJET EXPLICITE (Règle R2) */}
      {rejectionModalApp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
                Décision de rejet explicite
              </h3>
              <button
                onClick={() => setRejectionModalApp(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Conformément à la règle <strong>R2</strong>, le système ne procède à aucun rejet automatique.
              Vous vous apprêtez à écarter le candidat{" "}
              <strong>
                {rejectionModalApp.candidate.firstName} {rejectionModalApp.candidate.lastName}
              </strong>{" "}
              pour ce poste.
            </p>

            <form onSubmit={handleConfirmRejection} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rejectionReason">Motif principal de rejet *</Label>
                <select
                  id="rejectionReason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  required
                >
                  <option value="">Sélectionnez un motif...</option>
                  <option value="Compétences techniques insuffisantes">Compétences techniques insuffisantes</option>
                  <option value="Prétentions salariales non alignées">Prétentions salariales non alignées</option>
                  <option value="Disponibilité inadaptée">Disponibilité inadaptée</option>
                  <option value="Retour négatif entretien client">Retour négatif entretien client</option>
                  <option value="Désistement du candidat">Désistement du candidat</option>
                  <option value="Autre motif">Autre motif</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejectionNote">Commentaire explicatif (optionnel)</Label>
                <textarea
                  id="rejectionNote"
                  rows={3}
                  placeholder="Détails complémentaires pour l'historique et la transparence..."
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  className="w-full p-2.5 rounded-md border border-input bg-background text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRejectionModalApp(null)}
                  disabled={submittingRejection}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={submittingRejection || !rejectionReason}
                >
                  {submittingRejection ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    "Confirmer le rejet"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL HISTORIQUE DU CANDIDAT */}
      {historyModalApp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Historique des étapes — {historyModalApp.candidate.firstName} {historyModalApp.candidate.lastName}
              </h3>
              <button
                onClick={() => setHistoryModalApp(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {loadingHistory ? (
                <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement de l&apos;historique...
                </div>
              ) : historyItems.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-6">
                  Aucun historique disponible.
                </p>
              ) : (
                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-200">
                  {historyItems.map((item) => (
                    <div key={item.id} className="relative pl-7 text-xs space-y-1">
                      <div className="absolute left-1.5 top-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-primary bg-white" />
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-800">
                          {item.fromStatus ? `${item.fromStatus} → ` : ""}
                          <strong className="text-primary">{item.toStatus}</strong>
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(item.changedAt).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      {item.changedByUser && (
                        <p className="text-muted-foreground text-[11px]">
                          Par {item.changedByUser.firstName} {item.changedByUser.lastName}
                        </p>
                      )}
                      {(item.reason || item.note) && (
                        <p className="p-2 rounded bg-slate-50 border text-slate-700 italic">
                          {item.reason ? `Motif: ${item.reason} ` : ""}
                          {item.note ? `• ${item.note}` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setHistoryModalApp(null)}
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
