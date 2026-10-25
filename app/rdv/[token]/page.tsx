"use client";

import { use, useEffect, useState } from "react";

interface SlotData {
  id: string;
  startsAt: string;
  endsAt: string;
  isChosen: boolean;
}

interface ProposalData {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  mode: "VISIO" | "PHONE" | "ONSITE";
  locationOrLink: string | null;
  message: string | null;
  expiresAt: string;
  agency: { name: string; logoUrl: string | null; brandKey: string };
  candidateName: string;
  jobOffer: {
    title: string;
    contractType: string;
    location: string | null;
    company: { name: string; logoUrl: string | null };
  };
  slots: SlotData[];
  confirmedInterview: {
    id: string;
    startsAt: string;
    endsAt: string;
    mode: string;
    locationOrLink: string | null;
    status: string;
  } | null;
}

export default function PublicRdvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedSlot, setConfirmedSlot] = useState<SlotData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/rdv/${token}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Lien invalide ou expiré");
        }
        setData(json.proposal);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleChooseSlot(slot: SlotData) {
    setSubmitting(slot.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/public/rdv/${token}/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Impossible de confirmer ce créneau");
      }
      setConfirmedSlot(slot);
      if (data) {
        setData({
          ...data,
          status: "ACCEPTED",
          confirmedInterview: json.interview,
        });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur lors de la sélection");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center text-slate-500">Chargement de votre invitation d&apos;entretien...</div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="text-3xl">⚠️</div>
          <h1 className="mt-3 text-lg font-bold text-slate-900">Lien indisponible</h1>
          <p className="mt-2 text-xs text-slate-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isAccepted = data.status === "ACCEPTED" || confirmedSlot !== null;
  const isExpired = data.status === "EXPIRED";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Header Marque Blanche */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white p-5 rounded-t-2xl shadow-xs">
          <div className="flex items-center gap-3">
            {data.agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.agency.logoUrl} alt={data.agency.name} className="h-8 w-auto object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-900 text-xs font-bold text-white">
                {data.agency.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-sm font-bold text-slate-900">{data.agency.name}</div>
              <div className="text-xs text-slate-500">Invitation d&apos;entretien de recrutement</div>
            </div>
          </div>
        </div>

        <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-white p-6 shadow-sm space-y-6">
          {/* Alerte si erreur ponctuelle */}
          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Fiche d'information sur le poste */}
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="rounded bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                {data.jobOffer.contractType}
              </span>
              <span className="text-xs text-slate-500">
                Lieu : {data.jobOffer.location || "Abidjan"}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{data.jobOffer.title}</h2>
            <p className="text-xs text-slate-600">
              Entreprise : <strong className="text-slate-800">{data.jobOffer.company.name}</strong> •
              Candidat : <strong className="text-slate-800">{data.candidateName}</strong>
            </p>
          </div>

          {/* Mode & Consignes */}
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1 font-semibold text-slate-800">
              <span>📍 Mode :</span> {data.mode === "VISIO" ? "Visioconférence" : data.mode === "PHONE" ? "Téléphonique" : "Présentiel"}
            </span>
            {data.locationOrLink && (
              <span className="truncate">
                • {data.locationOrLink}
              </span>
            )}
          </div>

          {data.message && (
            <div className="rounded-lg bg-amber-50/70 p-3 text-xs text-amber-900 border border-amber-200">
              <span className="font-semibold">Message de l&apos;équipe recrutement : </span>
              {data.message}
            </div>
          )}

          {/* État Confirmé */}
          {isAccepted ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center space-y-3">
              <div className="text-3xl">🎉</div>
              <h3 className="text-lg font-extrabold text-emerald-950">
                Votre créneau d&apos;entretien est confirmé !
              </h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                Un email de confirmation vous a été envoyé. Vous pouvez également ajouter ce rendez-vous directement à votre calendrier.
              </p>
              {data.confirmedInterview && (
                <div className="mt-4 pt-4 border-t border-emerald-200 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <div className="text-xs font-semibold text-emerald-900">
                    📅 {new Date(data.confirmedInterview.startsAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}{" "}
                    à {new Date(data.confirmedInterview.startsAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              )}
            </div>
          ) : isExpired ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-8 text-center text-slate-500">
              <div className="text-2xl mb-2">⌛</div>
              <h3 className="text-base font-bold text-slate-800">Invitation expirée</h3>
              <p className="mt-1 text-xs">
                Cette proposition d&apos;entretien a expiré. Veuillez contacter votre consultant Stratos Conseil pour convenir d&apos;une nouvelle date.
              </p>
            </div>
          ) : (
            /* Liste des créneaux au choix */
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Choisissez le créneau qui vous convient le mieux :
                </h3>
                <p className="text-xs text-slate-500">
                  Sélectionnez l&apos;horaire de votre choix pour valider instantanément votre rendez-vous.
                </p>
              </div>

              <div className="space-y-3">
                {data.slots.map((slot) => {
                  const s = new Date(slot.startsAt);
                  const e = new Date(slot.endsAt);
                  const isCurrentSubmitting = submitting === slot.id;

                  return (
                    <div
                      key={slot.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/30"
                    >
                      <div className="space-y-0.5">
                        <div className="text-sm font-bold text-slate-900">
                          {s.toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-slate-600 font-medium">
                          De {s.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} à{" "}
                          {e.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} (Heure locale)
                        </div>
                      </div>

                      <button
                        onClick={() => handleChooseSlot(slot)}
                        disabled={submitting !== null}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {isCurrentSubmitting ? "Confirmation..." : "Sélectionner ce créneau →"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
