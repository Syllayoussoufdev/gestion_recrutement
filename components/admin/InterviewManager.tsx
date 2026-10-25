"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface InterviewCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  currentTitle?: string | null;
}

export interface InterviewJobOffer {
  id: string;
  title: string;
  company: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
}

export interface InterviewItem {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  mode: "VISIO" | "PHONE" | "ONSITE";
  locationOrLink: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW_CANDIDATE" | "NO_SHOW_CLIENT";
  cancelReason: string | null;
  resultNote: string | null;
  application: {
    candidate: InterviewCandidate;
    jobOffer: InterviewJobOffer;
  };
}

export interface ProposalItem {
  id: string;
  mode: string;
  status: string;
  expiresAt: string;
  message: string | null;
  proposedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  application: {
    candidate: { id: string; firstName: string; lastName: string; email: string };
    jobOffer: { id: string; title: string; company: { id: string; name: string } };
  };
  slots: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    isChosen: boolean;
  }>;
}

interface InterviewManagerProps {
  initialInterviews: InterviewItem[];
  initialProposals: ProposalItem[];
}

export default function InterviewManager({
  initialInterviews,
  initialProposals,
}: InterviewManagerProps) {
  const router = useRouter();
  const [interviews, setInterviews] = useState<InterviewItem[]>(initialInterviews);
  const [proposals, setProposals] = useState<ProposalItem[]>(initialProposals);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal conclusion / annulation
  const [activeModal, setActiveModal] = useState<{
    interview: InterviewItem;
    targetStatus: "COMPLETED" | "NO_SHOW_CANDIDATE" | "NO_SHOW_CLIENT" | "CANCELLED";
  } | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredInterviews = interviews.filter((i) => {
    if (statusFilter === "ALL") return true;
    return i.status === statusFilter;
  });

  async function handleUpdateStatus() {
    if (!activeModal) return;
    setLoading(true);
    setErrorMsg(null);

    const isCancel = activeModal.targetStatus === "CANCELLED";
    if (isCancel && noteInput.trim().length < 3) {
      setErrorMsg("Un motif d'annulation (au moins 3 caractères) est requis.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/interviews/${activeModal.interview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: activeModal.targetStatus,
          resultNote: !isCancel ? noteInput.trim() : undefined,
          cancelReason: isCancel ? noteInput.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }

      setInterviews(
        interviews.map((item) =>
          item.id === activeModal.interview.id ? { ...item, ...data.interview } : item
        )
      );

      setActiveModal(null);
      setNoteInput("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtres et KPIs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-500">Filtrer par statut :</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">Tous les entretiens ({interviews.length})</option>
            <option value="SCHEDULED">Planifiés</option>
            <option value="COMPLETED">Tenus (Validés)</option>
            <option value="NO_SHOW_CANDIDATE">Absence Candidat</option>
            <option value="NO_SHOW_CLIENT">Absence Client</option>
            <option value="CANCELLED">Annulés</option>
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
            {interviews.filter((i) => i.status === "SCHEDULED").length} à venir
          </span>
          <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
            {interviews.filter((i) => i.status === "COMPLETED").length} tenus
          </span>
          <span className="rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
            {proposals.length} proposition(s) en attente
          </span>
        </div>
      </div>

      {/* Propositions en attente */}
      {proposals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 space-y-3">
          <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span>⏳</span> Créneaux en attente de réponse du candidat ({proposals.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proposals.map((prop) => (
              <div key={prop.id} className="rounded-lg border border-amber-200 bg-white p-3 text-xs space-y-1">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>{prop.application.candidate.firstName} {prop.application.candidate.lastName}</span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {prop.slots.length} créneau(x) proposé(s)
                  </span>
                </div>
                <div className="text-slate-500">
                  Poste : {prop.application.jobOffer.title} ({prop.application.jobOffer.company.name})
                </div>
                <div className="text-slate-400">
                  Mode : {prop.mode} • Expire le {new Date(prop.expiresAt).toLocaleDateString("fr-FR")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des entretiens */}
      <div className="space-y-3">
        {filteredInterviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            Aucun entretien dans cette catégorie.
          </div>
        ) : (
          filteredInterviews.map((item) => {
            const starts = new Date(item.startsAt);
            const ends = new Date(item.endsAt);
            const isUpcoming = starts > new Date() && item.status === "SCHEDULED";

            return (
              <div
                key={item.id}
                className={`rounded-xl border bg-white p-5 shadow-xs transition ${
                  isUpcoming ? "border-blue-200 hover:border-blue-300" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Informations principales */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-base text-slate-900">
                        {item.application.candidate.firstName} {item.application.candidate.lastName}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.status === "SCHEDULED"
                            ? "bg-blue-100 text-blue-800"
                            : item.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "CANCELLED"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {item.status === "SCHEDULED"
                          ? "Planifié"
                          : item.status === "COMPLETED"
                          ? "Tenu ✓"
                          : item.status === "CANCELLED"
                          ? "Annulé"
                          : item.status === "NO_SHOW_CANDIDATE"
                          ? "Absence Candidat ✗"
                          : "Absence Client ✗"}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 font-medium">
                      Poste : <strong>{item.application.jobOffer.title}</strong> • Entreprise :{" "}
                      <strong>{item.application.jobOffer.company.name}</strong>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                      <span>
                        📅{" "}
                        {starts.toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <span>
                        ⏰ {starts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {ends.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (UTC)
                      </span>
                      <span>• Mode : {item.mode}</span>
                    </div>

                    {item.locationOrLink && (
                      <div className="text-xs text-blue-600 truncate max-w-lg">
                        Lien / Lieu :{" "}
                        <a href={item.locationOrLink} target="_blank" rel="noreferrer" className="underline">
                          {item.locationOrLink}
                        </a>
                      </div>
                    )}

                    {item.resultNote && (
                      <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700 italic border border-slate-100">
                        Compte-rendu : {item.resultNote}
                      </div>
                    )}

                    {item.cancelReason && (
                      <div className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800 border border-rose-100">
                        Motif d&apos;annulation : {item.cancelReason}
                      </div>
                    )}
                  </div>

                  {/* Actions Consultant */}
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/admin/interviews/${item.id}/ics`}
                      download
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center gap-1"
                    >
                      <span>📅</span> Télécharger .ics
                    </a>

                    {item.status === "SCHEDULED" && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setActiveModal({ interview: item, targetStatus: "COMPLETED" })
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                        >
                          ✓ Valider comme tenu
                        </button>

                        <button
                          onClick={() =>
                            setActiveModal({ interview: item, targetStatus: "NO_SHOW_CANDIDATE" })
                          }
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                        >
                          Absence candidat
                        </button>

                        <button
                          onClick={() =>
                            setActiveModal({ interview: item, targetStatus: "CANCELLED" })
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Enregistrement issue entretien */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {activeModal.targetStatus === "COMPLETED"
                ? "Confirmer l'entretien comme tenu"
                : activeModal.targetStatus === "CANCELLED"
                ? "Annuler l'entretien"
                : "Signaler un incident d'absence"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Candidat : {activeModal.interview.application.candidate.firstName}{" "}
              {activeModal.interview.application.candidate.lastName} • Poste :{" "}
              {activeModal.interview.application.jobOffer.title}
            </p>

            {errorMsg && (
              <div className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">{errorMsg}</div>
            )}

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase text-slate-600">
                {activeModal.targetStatus === "CANCELLED"
                  ? "Motif d'annulation (obligatoire) :"
                  : "Commentaire / Compte-rendu (optionnel) :"}
              </label>
              <textarea
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={
                  activeModal.targetStatus === "CANCELLED"
                    ? "Ex : Indisponibilité imprévue du recruteur..."
                    : "Ex : Bon échange, candidat motivé, suite favorable..."
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setNoteInput("");
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleUpdateStatus}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? "Enregistrement..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
