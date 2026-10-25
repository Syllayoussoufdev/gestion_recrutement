"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ClientShortlistItem {
  id: string;
  applicationId: string;
  isAnonymized: boolean;
  displayName: string;
  email: string | null;
  phone: string | null;
  currentTitle: string | null;
  skills?: string[];
  summary: string | null;
  cvAvailable: boolean;
  cvDocumentId: string | null;
  testResult: {
    score: number;
    maxScore: number;
    scorePercent: number;
    isComplete: boolean;
    subscores: Record<string, number> | null;
  } | null;
  clientDecision: "INTERESTED" | "NOT_FOR_THIS_ROLE" | "NEEDS_INFO" | null;
  clientReason: string | null;
  clientDecidedAt: string | null;
}

export interface ClientShortlistGroup {
  id: string;
  title: string;
  message: string | null;
  sentAt: string | null;
  consultant: string;
  items: ClientShortlistItem[];
}

interface ClientShortlistViewProps {
  jobOfferId: string;
  jobOfferTitle: string;
  jobOfferContract: string;
  jobOfferLocation: string | null;
  initialShortlists: ClientShortlistGroup[];
}

export default function ClientShortlistView({
  jobOfferId,
  jobOfferTitle,
  jobOfferContract,
  jobOfferLocation,
  initialShortlists,
}: ClientShortlistViewProps) {
  const router = useRouter();
  const [shortlists, setShortlists] = useState<ClientShortlistGroup[]>(initialShortlists);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    itemId: string;
    decision: "NOT_FOR_THIS_ROLE" | "NEEDS_INFO";
    title: string;
    candidateName: string;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadingCvId, setDownloadingCvId] = useState<string | null>(null);

  async function handleDecision(
    itemId: string,
    decision: "INTERESTED" | "NOT_FOR_THIS_ROLE" | "NEEDS_INFO",
    reason?: string
  ) {
    setLoadingItemId(itemId);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/client/shortlists/items/${itemId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible d'enregistrer votre choix.");
      }

      // Recharger les données fraîches pour démasquer immédiatement les coordonnées
      const refreshRes = await fetch(`/api/client/offres/${jobOfferId}/shortlists`);
      const refreshData = await refreshRes.json();
      if (refreshData.shortlists) {
        setShortlists(refreshData.shortlists);
      }

      setFeedbackModal(null);
      setReasonInput("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoadingItemId(null);
    }
  }

  async function handleDownloadCv(docId: string) {
    setDownloadingCvId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/url`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Impossible de télécharger le document.");
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'accès au CV");
    } finally {
      setDownloadingCvId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête de l'offre */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/client/offres"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              ← Retour à mes offres
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{jobOfferTitle}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Contrat : <span className="font-semibold text-slate-700">{jobOfferContract}</span> • Lieu :{" "}
            <span className="font-semibold text-slate-700">{jobOfferLocation || "Abidjan"}</span>
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Liste des sélections transmises */}
      {shortlists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <p className="text-base font-semibold text-slate-800">Aucune shortlist reçue pour le moment</p>
          <p className="mt-1 text-xs">Votre consultant est actuellement en phase de qualification et d&apos;évaluation des candidatures.</p>
        </div>
      ) : (
        shortlists.map((sl) => (
          <div key={sl.id} className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{sl.title}</h2>
                  <p className="text-xs text-slate-500">
                    Présentée par votre consultant{" "}
                    <span className="font-semibold text-slate-700">{sl.consultant}</span>
                    {sl.sentAt && ` le ${new Date(sl.sentAt).toLocaleDateString("fr-FR")}`}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {sl.items.length} candidat(s) qualifié(s)
                </span>
              </div>

              {sl.message && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-line border border-slate-100">
                  <div className="font-semibold text-slate-900 mb-1">Message d&apos;accompagnement :</div>
                  {sl.message}
                </div>
              )}
            </div>

            {/* Cartes des candidats présentés */}
            <div className="grid grid-cols-1 gap-6">
              {sl.items.map((item) => {
                const isDecided = Boolean(item.clientDecision);
                const isInterested = item.clientDecision === "INTERESTED";

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border bg-white p-6 shadow-sm transition ${
                      isInterested
                        ? "border-emerald-300 ring-1 ring-emerald-200"
                        : item.clientDecision === "NOT_FOR_THIS_ROLE"
                        ? "border-slate-200 opacity-75"
                        : "border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* En-tête profil */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-extrabold text-slate-900">
                            {item.displayName}
                          </h3>
                          {item.isAnonymized ? (
                            <span
                              title="Coordonnées masquées selon les règles de confidentialité Stratos Conseil jusqu'à confirmation de votre intérêt."
                              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 flex items-center gap-1 cursor-help"
                            >
                              <span>🔒</span> Identité protégée
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 flex items-center gap-1">
                              <span>✓</span> Profil débloqué
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 font-medium">
                          {item.currentTitle || "Professionnel qualifié"}
                          {item.skills && item.skills.length > 0 && ` • ${item.skills.join(", ")}`}
                        </div>

                        {/* Coordonnées débloquées ou masquées */}
                        <div className="mt-2 text-xs">
                          {item.isAnonymized ? (
                            <div className="flex items-center gap-2 text-slate-400 italic">
                              <span>📧 Email et 📞 Téléphone masqués</span>
                              <span>(cliquez sur &ldquo;Intéressé(e)&rdquo; pour afficher les coordonnées)</span>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-4 font-semibold text-slate-700">
                              <span>📧 {item.email}</span>
                              {item.phone && <span>📞 {item.phone}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Score du test d'évaluation si partagé */}
                      {item.testResult && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 min-w-[200px] text-center">
                          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                            Score Évaluation
                          </div>
                          <div className="mt-1 text-2xl font-black text-indigo-900">
                            {item.testResult.scorePercent}%
                          </div>
                          <div className="text-xs text-indigo-600">
                            {item.testResult.score} / {item.testResult.maxScore} pts
                          </div>

                          {/* Sous-scores par compétence */}
                          {item.testResult.subscores && Object.keys(item.testResult.subscores).length > 0 && (
                            <div className="mt-2 pt-2 border-t border-indigo-100 text-left space-y-1">
                              {Object.entries(item.testResult.subscores).map(([comp, val]) => (
                                <div key={comp} className="flex justify-between text-[11px] text-indigo-800">
                                  <span className="truncate pr-1">{comp}</span>
                                  <span className="font-semibold">{Math.round(val)}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Synthèse consultant */}
                    {item.summary && (
                      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Recommandation & Analyse du Consultant
                        </div>
                        <p className="mt-1 text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                          {item.summary}
                        </p>
                      </div>
                    )}

                    {/* Téléchargement CV */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                      <div>
                        {item.cvAvailable && item.cvDocumentId ? (
                          <button
                            onClick={() => handleDownloadCv(item.cvDocumentId!)}
                            disabled={downloadingCvId === item.cvDocumentId}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                          >
                            <span>📄</span>
                            {downloadingCvId === item.cvDocumentId ? "Génération URL sécurisée..." : "Consulter le Curriculum Vitae"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            {item.isAnonymized
                              ? "🔒 Le CV complet sera accessible dès confirmation de votre intérêt."
                              : "CV non joint"}
                          </span>
                        )}
                      </div>

                      {/* Barre d'action décisionnelle Client */}
                      <div className="flex flex-wrap items-center gap-2">
                        {isDecided ? (
                          <div className="flex items-center gap-2">
                            {item.clientDecision === "INTERESTED" && (
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                                  ✓ Intérêt confirmé • Entretien demandé
                                </span>
                                <button
                                  onClick={() =>
                                    setFeedbackModal({
                                      itemId: item.id,
                                      decision: "NOT_FOR_THIS_ROLE",
                                      title: "Modifier mon choix : Décliner ce profil",
                                      candidateName: item.displayName,
                                    })
                                  }
                                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                                >
                                  Modifier
                                </button>
                              </div>
                            )}

                            {item.clientDecision === "NOT_FOR_THIS_ROLE" && (
                              <div className="flex items-center gap-2">
                                <span
                                  title={item.clientReason || undefined}
                                  className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 cursor-help"
                                >
                                  ✕ Non retenu ({item.clientReason})
                                </span>
                                <button
                                  onClick={() => handleDecision(item.id, "INTERESTED")}
                                  className="text-xs text-blue-600 hover:underline font-medium"
                                >
                                  Finalement intéressé(e)
                                </button>
                              </div>
                            )}

                            {item.clientDecision === "NEEDS_INFO" && (
                              <div className="flex items-center gap-2">
                                <span
                                  title={item.clientReason || undefined}
                                  className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 cursor-help"
                                >
                                  ℹ Précisions demandées ({item.clientReason})
                                </span>
                                <button
                                  onClick={() => handleDecision(item.id, "INTERESTED")}
                                  className="text-xs text-emerald-600 hover:underline font-medium"
                                >
                                  Valider pour entretien
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDecision(item.id, "INTERESTED")}
                              disabled={loadingItemId === item.id}
                              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              {loadingItemId === item.id ? "Validation..." : "✓ Intéressé(e) (Entretien)"}
                            </button>

                            <button
                              onClick={() =>
                                setFeedbackModal({
                                  itemId: item.id,
                                  decision: "NEEDS_INFO",
                                  title: "Demander des informations complémentaires",
                                  candidateName: item.displayName,
                                })
                              }
                              disabled={loadingItemId === item.id}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                            >
                              ℹ Précisions
                            </button>

                            <button
                              onClick={() =>
                                setFeedbackModal({
                                  itemId: item.id,
                                  decision: "NOT_FOR_THIS_ROLE",
                                  title: "Décliner ce profil pour ce poste",
                                  candidateName: item.displayName,
                                })
                              }
                              disabled={loadingItemId === item.id}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                            >
                              ✕ Pas pour ce poste
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Modal motif de décision (Rejet ou Précisions) */}
      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">{feedbackModal.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              Candidat concerné : <strong className="text-slate-800">{feedbackModal.candidateName}</strong>
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase text-slate-600">
                {feedbackModal.decision === "NOT_FOR_THIS_ROLE"
                  ? "Motif du refus (obligatoire) :"
                  : "Questions ou précisions souhaitées (obligatoire) :"}
              </label>
              <textarea
                rows={3}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder={
                  feedbackModal.decision === "NOT_FOR_THIS_ROLE"
                    ? "Ex : Prétentions salariales trop élevées, manque d'expérience sur notre ERP..."
                    : "Ex : Disponibilité exacte du candidat, maîtrise confirmée de l'anglais technique..."
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setFeedbackModal(null);
                  setReasonInput("");
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={loadingItemId !== null || reasonInput.trim().length < 3}
                onClick={() => handleDecision(feedbackModal.itemId, feedbackModal.decision, reasonInput.trim())}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-50 ${
                  feedbackModal.decision === "NOT_FOR_THIS_ROLE"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {loadingItemId ? "Envoi..." : "Confirmer mon retour"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
