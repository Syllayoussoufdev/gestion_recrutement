"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ShortlistItemCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  currentTitle?: string | null;
  skills?: string[];
}

export interface ShortlistItemData {
  id: string;
  applicationId: string;
  summary: string | null;
  showTestResult: boolean;
  showSubscores: boolean;
  cvShared: boolean;
  consentStatus: "PENDING" | "GRANTED" | "DECLINED";
  consentAt: string | null;
  clientDecision: "INTERESTED" | "NOT_FOR_THIS_ROLE" | "NEEDS_INFO" | null;
  clientReason: string | null;
  clientDecidedAt: string | null;
  application: {
    id: string;
    status: string;
    candidate: ShortlistItemCandidate;
    assessmentAttempts?: Array<{
      id: string;
      score: number;
      maxScore: number;
      scorePercent: number;
      isComplete: boolean;
      subscores: Record<string, number> | null;
    }>;
  };
}

export interface ShortlistData {
  id: string;
  title: string;
  message: string | null;
  status: "DRAFT" | "SENT";
  sentAt: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  items: ShortlistItemData[];
}

export interface AvailableCandidate {
  applicationId: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  currentTitle?: string | null;
  status: string;
  latestScorePercent?: number | null;
}

interface ShortlistManagerProps {
  jobOfferId: string;
  jobOfferTitle: string;
  companyName: string;
  initialShortlists: ShortlistData[];
  availableCandidates: AvailableCandidate[];
}

export default function ShortlistManager({
  jobOfferId,
  jobOfferTitle,
  companyName,
  initialShortlists,
  availableCandidates,
}: ShortlistManagerProps) {
  const router = useRouter();
  const [shortlists, setShortlists] = useState<ShortlistData[]>(initialShortlists);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulaire nouvelle shortlist
  const [title, setTitle] = useState(`Shortlist #${shortlists.length + 1} - ${jobOfferTitle}`);
  const [message, setMessage] = useState(
    `Bonjour,\n\nVeuillez trouver ci-joint notre sélection de profils qualifiés et validés pour le poste de ${jobOfferTitle}.\n\nRestant à votre entière disposition pour tout échange complémentaire.`
  );
  const [selectedCandidates, setSelectedCandidates] = useState<
    Array<{
      applicationId: string;
      summary: string;
      showTestResult: boolean;
      showSubscores: boolean;
      cvShared: boolean;
      consentStatus: "PENDING" | "GRANTED" | "DECLINED";
    }>
  >([]);

  function toggleCandidateSelection(appId: string) {
    if (selectedCandidates.some((c) => c.applicationId === appId)) {
      setSelectedCandidates(selectedCandidates.filter((c) => c.applicationId !== appId));
    } else {
      setSelectedCandidates([
        ...selectedCandidates,
        {
          applicationId: appId,
          summary: "",
          showTestResult: true,
          showSubscores: true,
          cvShared: true,
          consentStatus: "PENDING",
        },
      ]);
    }
  }

  function updateSelectedCandidate(appId: string, patch: Partial<(typeof selectedCandidates)[0]>) {
    setSelectedCandidates(
      selectedCandidates.map((c) => (c.applicationId === appId ? { ...c, ...patch } : c))
    );
  }

  async function handleCreateShortlist(e: React.FormEvent) {
    e.preventDefault();
    if (selectedCandidates.length === 0) {
      setError("Veuillez sélectionner au moins un candidat à inclure dans la shortlist.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/offres/${jobOfferId}/shortlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          items: selectedCandidates,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la création de la shortlist");
      }

      setSuccessMsg("Shortlist créée en brouillon avec succès !");
      setIsCreating(false);
      router.refresh();
      // Reload shortlists
      const refRes = await fetch(`/api/admin/offres/${jobOfferId}/shortlists`);
      const refData = await refRes.json();
      if (refData.shortlists) setShortlists(refData.shortlists);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendShortlist(shortlistId: string) {
    if (!confirm("Confirmez-vous l'envoi de cette shortlist au client ? Les candidats passeront à l'étape 'Présenté' (PRESENTED).")) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shortlists/${shortlistId}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi de la shortlist");
      }

      setSuccessMsg(data.message || "Shortlist transmise au client avec succès !");
      router.refresh();
      // Reload
      const refRes = await fetch(`/api/admin/offres/${jobOfferId}/shortlists`);
      const refData = await refRes.json();
      if (refData.shortlists) setShortlists(refData.shortlists);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateItemConsent(shortlistId: string, itemId: string, status: "PENDING" | "GRANTED" | "DECLINED") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shortlists/${shortlistId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentStatus: status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur mise à jour consentement");
      }

      // Reload
      const refRes = await fetch(`/api/admin/offres/${jobOfferId}/shortlists`);
      const refData = await refRes.json();
      if (refData.shortlists) setShortlists(refData.shortlists);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Messages d'alerte / confirmation */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">Action impossible</div>
          <div>{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      {/* Barre d'action supérieure */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Shortlists & Soumissions Client</h2>
          <p className="text-sm text-slate-500">
            Entreprise cliente : <span className="font-medium text-slate-700">{companyName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/offres/${jobOfferId}/pipeline`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ← Retour au Pipeline Kanban
          </Link>
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
            >
              + Préparer une nouvelle Shortlist
            </button>
          )}
        </div>
      </div>

      {/* Règle V2 Encadré explicatif */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
        <p className="font-semibold flex items-center gap-2">
          <span>🔒</span> Règle stricte PRD V2 §6.2 — Consentement Candidat Préalable
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Aucun profil ne peut être transmis à l&apos;entreprise cliente tant que le candidat n&apos;a pas donné son accord explicite
          (statut <span className="font-semibold underline">GRANTED</span>). Le système bloque automatiquement l&apos;envoi
          si un seul profil reste en attente.
        </p>
      </div>

      {/* Formulaire Création Shortlist */}
      {isCreating && (
        <form onSubmit={handleCreateShortlist} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-900">Nouvelle Shortlist</h3>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              Annuler
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Titre de la sélection</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Message d&apos;accompagnement pour le client
              </label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Sélection des candidats disponibles */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Candidats à inclure ({selectedCandidates.length} sélectionné(s))
                </label>
                <span className="text-xs text-slate-400">
                  {availableCandidates.length} candidat(s) dans le vivier de l&apos;offre
                </span>
              </div>

              {availableCandidates.length === 0 ? (
                <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                  Aucun candidat disponible. Ajoutez des candidats depuis l&apos;offre ou le vivier.
                </div>
              ) : (
                <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {availableCandidates.map((cand) => {
                    const isSelected = selectedCandidates.some((c) => c.applicationId === cand.applicationId);
                    const currentSel = selectedCandidates.find((c) => c.applicationId === cand.applicationId);

                    return (
                      <div key={cand.applicationId} className={`p-4 transition ${isSelected ? "bg-blue-50/40" : "bg-white"}`}>
                        <div className="flex items-center justify-between gap-4">
                          <label className="flex cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCandidateSelection(cand.applicationId)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <div className="font-medium text-slate-900">
                                {cand.firstName} {cand.lastName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {cand.currentTitle || "Profil"} • {cand.email} • Étape : {cand.status}
                              </div>
                            </div>
                          </label>

                          <div className="flex items-center gap-2">
                            {cand.latestScorePercent !== null && cand.latestScorePercent !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                Test: {cand.latestScorePercent}%
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Options spécifiques si sélectionné */}
                        {isSelected && currentSel && (
                          <div className="mt-3 space-y-3 rounded-lg border border-blue-100 bg-white p-3 text-xs">
                            <div>
                              <label className="block font-medium text-slate-700">
                                Synthèse consultant pour ce candidat (affichée au client) :
                              </label>
                              <textarea
                                rows={2}
                                value={currentSel.summary}
                                onChange={(e) =>
                                  updateSelectedCandidate(cand.applicationId, { summary: e.target.value })
                                }
                                placeholder="Points forts, motivation, adéquation avec la culture d'entreprise..."
                                className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-4 text-slate-600">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={currentSel.showTestResult}
                                  onChange={(e) =>
                                    updateSelectedCandidate(cand.applicationId, { showTestResult: e.target.checked })
                                  }
                                />
                                Partager le score au test
                              </label>

                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={currentSel.showSubscores}
                                  onChange={(e) =>
                                    updateSelectedCandidate(cand.applicationId, { showSubscores: e.target.checked })
                                  }
                                />
                                Détailler les sous-scores
                              </label>

                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={currentSel.cvShared}
                                  onChange={(e) =>
                                    updateSelectedCandidate(cand.applicationId, { cvShared: e.target.checked })
                                  }
                                />
                                Partager le CV en PJ
                              </label>
                            </div>

                            <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                              <span className="font-semibold text-slate-700">Consentement préalable candidat :</span>
                              <select
                                value={currentSel.consentStatus}
                                onChange={(e) =>
                                  updateSelectedCandidate(cand.applicationId, {
                                    consentStatus: e.target.value as "PENDING" | "GRANTED" | "DECLINED",
                                  })
                                }
                                className={`rounded px-2 py-1 text-xs font-semibold ${
                                  currentSel.consentStatus === "GRANTED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : currentSel.consentStatus === "DECLINED"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                <option value="PENDING">PENDING (En attente d&apos;accord)</option>
                                <option value="GRANTED">GRANTED (Accord reçu du candidat)</option>
                                <option value="DECLINED">DECLINED (Refus du candidat)</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading || selectedCandidates.length === 0}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Enregistrement..." : "Enregistrer la Shortlist (Brouillon)"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Liste des Shortlists existantes */}
      <div className="space-y-4">
        {shortlists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              📋
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">Aucune shortlist créée</h3>
            <p className="mt-1 text-sm text-slate-500">
              Préparez une sélection de candidats qualifiés pour {companyName}.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
            >
              Créer la première shortlist
            </button>
          </div>
        ) : (
          shortlists.map((sl) => {
            const hasUnconsented = sl.items.some((i) => i.consentStatus !== "GRANTED");

            return (
              <div key={sl.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-slate-900">{sl.title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          sl.status === "SENT"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {sl.status === "SENT" ? "Transmise au client" : "Brouillon interne"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Créée le {new Date(sl.createdAt).toLocaleDateString("fr-FR")} par {sl.createdBy.firstName} {sl.createdBy.lastName}
                      {sl.sentAt && ` • Envoyée le ${new Date(sl.sentAt).toLocaleDateString("fr-FR")}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {sl.status === "DRAFT" && (
                      <button
                        onClick={() => handleSendShortlist(sl.id)}
                        disabled={loading || hasUnconsented}
                        title={
                          hasUnconsented
                            ? "Tous les candidats doivent avoir donné leur accord préalable (statut GRANTED)"
                            : "Envoyer au portail client"
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition ${
                          hasUnconsented
                            ? "bg-slate-400 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {hasUnconsented ? "⚠️ Consentements requis" : "🚀 Transmettre au client"}
                      </button>
                    )}
                  </div>
                </div>

                {sl.message && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-line">
                    <span className="font-semibold text-slate-700">Note au client : </span>
                    {sl.message}
                  </div>
                )}

                {/* Items de la shortlist */}
                <div className="mt-4 divide-y divide-slate-100">
                  {sl.items.map((item) => {
                    const c = item.application.candidate;
                    const attempt = item.application.assessmentAttempts?.[0];

                    return (
                      <div key={item.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {c.firstName} {c.lastName}
                            </span>
                            <span className="text-xs text-slate-500">
                              ({c.currentTitle || "Candidat"} • {c.email})
                            </span>
                            {attempt && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                Test: {attempt.scorePercent}%
                              </span>
                            )}
                          </div>

                          {item.summary && (
                            <p className="text-xs italic text-slate-600">
                              &ldquo;{item.summary}&rdquo;
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                            <span>CV partagé : {item.cvShared ? "Oui" : "Non"}</span>
                            <span>•</span>
                            <span>Scores partagés : {item.showTestResult ? "Oui" : "Non"}</span>
                          </div>
                        </div>

                        {/* Bloc consentement & décisions client */}
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Statut consentement */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500">Accord candidat :</span>
                            {sl.status === "DRAFT" ? (
                              <select
                                value={item.consentStatus}
                                onChange={(e) =>
                                  handleUpdateItemConsent(
                                    sl.id,
                                    item.id,
                                    e.target.value as "PENDING" | "GRANTED" | "DECLINED"
                                  )
                                }
                                className={`rounded px-2 py-1 text-xs font-semibold border-0 ${
                                  item.consentStatus === "GRANTED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : item.consentStatus === "DECLINED"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                <option value="PENDING">PENDING</option>
                                <option value="GRANTED">GRANTED (Accordé)</option>
                                <option value="DECLINED">DECLINED</option>
                              </select>
                            ) : (
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                  item.consentStatus === "GRANTED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {item.consentStatus}
                              </span>
                            )}
                          </div>

                          {/* Décision client si SENT */}
                          {sl.status === "SENT" && (
                            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                              <span className="text-xs text-slate-500">Retour client :</span>
                              {item.clientDecision === "INTERESTED" ? (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 flex items-center gap-1">
                                  <span>✓</span> Intéressé (Entretien)
                                </span>
                              ) : item.clientDecision === "NOT_FOR_THIS_ROLE" ? (
                                <span
                                  title={item.clientReason || undefined}
                                  className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 flex items-center gap-1 cursor-help"
                                >
                                  <span>✕</span> Non retenu ({item.clientReason || "sans motif"})
                                </span>
                              ) : item.clientDecision === "NEEDS_INFO" ? (
                                <span
                                  title={item.clientReason || undefined}
                                  className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 flex items-center gap-1 cursor-help"
                                >
                                  <span>ℹ</span> Infos requises
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                                  En attente de consultation
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
