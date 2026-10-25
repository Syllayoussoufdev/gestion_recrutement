"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ClientInterviewItem {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: "VISIO" | "PHONE" | "ONSITE";
  locationOrLink: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW_CANDIDATE" | "NO_SHOW_CLIENT";
  cancelReason: string | null;
  application: {
    candidate: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
      currentTitle: string | null;
    };
    jobOffer: {
      id: string;
      title: string;
    };
  };
}

export interface ClientProposalItem {
  id: string;
  status: string;
  mode: string;
  locationOrLink: string | null;
  expiresAt: string;
  message: string | null;
  application: {
    candidate: { firstName: string; lastName: string };
    jobOffer: { title: string };
  };
  slots: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    isChosen: boolean;
  }>;
}

interface ClientInterviewViewProps {
  initialInterviews: ClientInterviewItem[];
  initialProposals: ClientProposalItem[];
}

export default function ClientInterviewView({
  initialInterviews,
  initialProposals,
}: ClientInterviewViewProps) {
  const router = useRouter();
  const [interviews, setInterviews] = useState<ClientInterviewItem[]>(initialInterviews);
  const [cancelModal, setCancelModal] = useState<{ id: string; candidateName: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCancelInterview() {
    if (!cancelModal) return;
    if (cancelReason.trim().length < 3) {
      setErrorMsg("Veuillez indiquer un motif d'annulation (au moins 3 caractères).");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/client/interviews/${cancelModal.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'annulation");
      }

      setInterviews(
        interviews.map((item) =>
          item.id === cancelModal.id
            ? { ...item, status: "CANCELLED", cancelReason: cancelReason.trim() }
            : item
        )
      );

      setCancelModal(null);
      setCancelReason("");
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Vos Entretiens de Recrutement</h1>
        <p className="text-sm text-slate-500">
          Consultez vos rendez-vous confirmés avec les candidats sélectionnés et suivez les créneaux proposés.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {/* Propositions en attente */}
      {initialProposals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 space-y-3">
          <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span>⏳</span> Créneaux proposés en attente de choix du candidat ({initialProposals.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {initialProposals.map((prop) => (
              <div key={prop.id} className="rounded-lg border border-amber-200 bg-white p-3 text-xs space-y-1">
                <div className="font-bold text-slate-900">
                  {prop.application.candidate.firstName} {prop.application.candidate.lastName}
                </div>
                <div className="text-slate-600">Poste : {prop.application.jobOffer.title}</div>
                <div className="text-slate-500">
                  {prop.slots.length} créneau(x) transmis • Mode : {prop.mode}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des entretiens planifiés */}
      <div className="space-y-4">
        {interviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <p className="text-base font-semibold text-slate-800">Aucun entretien planifié pour le moment</p>
            <p className="mt-1 text-xs">
              Dès que vous confirmez votre intérêt pour un profil dans vos shortlists, vous pourrez lui proposer des créneaux d&apos;échange.
            </p>
          </div>
        ) : (
          interviews.map((item) => {
            const starts = new Date(item.startsAt);
            const ends = new Date(item.endsAt);
            const isScheduled = item.status === "SCHEDULED";

            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-white p-5 shadow-xs transition ${
                  isScheduled ? "border-blue-200 hover:border-blue-300" : "border-slate-200 opacity-80"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-900">
                        {item.application.candidate.firstName} {item.application.candidate.lastName}
                      </h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.status === "SCHEDULED"
                            ? "bg-blue-100 text-blue-800"
                            : item.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {item.status === "SCHEDULED"
                          ? "Confirmé"
                          : item.status === "COMPLETED"
                          ? "Tenu ✓"
                          : "Annulé"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium">
                      Poste : {item.application.jobOffer.title}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                      <span>
                        📅{" "}
                        {starts.toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "long",
                        })}
                      </span>
                      <span>
                        ⏰ {starts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {ends.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>• Mode : {item.mode}</span>
                    </div>

                    {item.locationOrLink && (
                      <div className="text-xs text-blue-600 pt-1 truncate">
                        Lien / Lieu :{" "}
                        <a href={item.locationOrLink} target="_blank" rel="noreferrer" className="underline">
                          {item.locationOrLink}
                        </a>
                      </div>
                    )}

                    {item.cancelReason && (
                      <div className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800 border border-rose-100">
                        Motif d&apos;annulation : {item.cancelReason}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/client/interviews/${item.id}/ics`}
                      download
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Ajouter au calendrier (.ics)
                    </a>

                    {isScheduled && (
                      <button
                        onClick={() =>
                          setCancelModal({
                            id: item.id,
                            candidateName: `${item.application.candidate.firstName} ${item.application.candidate.lastName}`,
                          })
                        }
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal motif d'annulation client */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Annuler l&apos;entretien</h3>
            <p className="mt-1 text-xs text-slate-500">
              Candidat concerné : <strong>{cancelModal.candidateName}</strong>
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Motif d&apos;annulation (obligatoire) :
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex : Conflit d'agenda imprévu, poste pourvu en interne..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCancelModal(null);
                  setCancelReason("");
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Fermer
              </button>
              <button
                type="button"
                disabled={loading || cancelReason.trim().length < 3}
                onClick={handleCancelInterview}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50"
              >
                {loading ? "Annulation..." : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
