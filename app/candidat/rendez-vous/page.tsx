import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";

export default async function CandidatRendezVousPage() {
  const session = await getSession();
  if (!session || session.role !== "CANDIDAT" || !session.candidateId || !session.agencyId) {
    redirect("/login");
  }

  const db = forAgency(session);

  const interviews = await db.interview.findMany({
    where: {
      application: { candidateId: session.candidateId },
    },
    orderBy: { startsAt: "asc" },
    include: {
      application: {
        include: {
          jobOffer: {
            select: {
              title: true,
              company: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const proposals = await db.interviewProposal.findMany({
    where: {
      application: { candidateId: session.candidateId },
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: {
      slots: { orderBy: { startsAt: "asc" } },
      application: {
        include: {
          jobOffer: {
            select: {
              title: true,
              company: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Mes Entretiens & Rendez-vous</h1>
        <p className="text-sm text-slate-500">
          Retrouvez vos invitations à échanger et les créneaux confirmés avec les recruteurs.
        </p>
      </div>

      {/* Invitations en attente */}
      {proposals.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 space-y-3">
          <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2">
            <span>⏳</span> Propositions d&apos;entretien reçues ({proposals.length})
          </h2>
          <div className="grid grid-cols-1 gap-3">
            {proposals.map((prop) => (
              <div
                key={prop.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-4 shadow-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">
                    {prop.application.jobOffer.title} • {prop.application.jobOffer.company.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {prop.slots.length} créneau(x) au choix • Mode : {prop.mode}
                  </div>
                </div>

                <Link
                  href={`/candidat`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition text-center"
                >
                  Choisir mon créneau →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des entretiens confirmés */}
      <div className="space-y-4">
        {interviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <p className="text-base font-semibold text-slate-800">Aucun entretien planifié pour l&apos;instant</p>
            <p className="mt-1 text-xs">
              Les propositions d&apos;entretien s&apos;afficheront ici dès que votre profil sera sélectionné.
            </p>
          </div>
        ) : (
          interviews.map((item) => {
            const starts = new Date(item.startsAt);
            const ends = new Date(item.endsAt);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row sm:items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-slate-900">
                      {item.application.jobOffer.title}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.status === "SCHEDULED"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "COMPLETED"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {item.status === "SCHEDULED"
                        ? "Confirmé"
                        : item.status === "COMPLETED"
                        ? "Tenu"
                        : "Annulé"}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 font-medium">
                    Entreprise : {item.application.jobOffer.company.name}
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
                    <div className="text-xs text-blue-600 pt-1">
                      Lien / Lieu :{" "}
                      <a href={item.locationOrLink} target="_blank" rel="noreferrer" className="underline">
                        {item.locationOrLink}
                      </a>
                    </div>
                  )}
                </div>

                <a
                  href={`/api/candidat/interviews/${item.id}/ics`}
                  download
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition text-center"
                >
                  Ajouter au calendrier (.ics)
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
