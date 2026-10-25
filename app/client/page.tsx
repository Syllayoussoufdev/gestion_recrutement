import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";

export default async function ClientDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.agencyId || !session.companyId) {
    redirect("/login");
  }

  const db = forAgency(session);

  const company = await db.company.findUnique({
    where: { id: session.companyId },
    select: { name: true, sector: true, city: true },
  });

  const jobOffers = await db.jobOffer.findMany({
    where: {
      companyId: session.companyId,
      status: { in: ["OPEN", "CLOSED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      shortlists: {
        where: { status: "SENT" },
        include: {
          items: {
            select: {
              id: true,
              clientDecision: true,
            },
          },
        },
      },
      applications: {
        where: { status: { in: ["PRESENTED", "INTERVIEW_REQUESTED", "INTERVIEW_SCHEDULED", "PLACED"] } },
        select: { id: true, status: true },
      },
    },
  });

  const totalOffers = jobOffers.length;
  let totalCandidatesSent = 0;
  let pendingDecisions = 0;
  let interestedCount = 0;

  jobOffers.forEach((offer) => {
    offer.shortlists.forEach((sl) => {
      sl.items.forEach((item) => {
        totalCandidatesSent++;
        if (!item.clientDecision) {
          pendingDecisions++;
        } else if (item.clientDecision === "INTERESTED") {
          interestedCount++;
        }
      });
    });
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-md">
        <h1 className="text-2xl font-bold tracking-tight">
          Bienvenue, {session.firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Espace Recrutement Entreprise • {company?.name || "Votre Entreprise"}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Postes en recrutement
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">{totalOffers}</div>
          <div className="mt-1 text-xs text-slate-500">Missions confiées au cabinet</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Candidats présentés
          </div>
          <div className="mt-2 text-3xl font-extrabold text-blue-600">{totalCandidatesSent}</div>
          <div className="mt-1 text-xs text-slate-500">Via shortlists validées</div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            À examiner (Décision requise)
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-600">{pendingDecisions}</div>
          <div className="mt-1 text-xs text-amber-600">Profils en attente de votre avis</div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Profils retenus
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-600">{interestedCount}</div>
          <div className="mt-1 text-xs text-emerald-600">Entretiens demandés</div>
        </div>
      </div>

      {/* Missions actives et shortlists à consulter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Vos offres d&apos;emploi et sélections</h2>
          <Link
            href="/client/offres"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            Voir toutes les offres →
          </Link>
        </div>

        {jobOffers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Aucun poste ouvert pour le moment. Votre consultant Stratos Conseil prendra contact lors du lancement de vos recrutements.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {jobOffers.map((offer) => {
              const sentShortlists = offer.shortlists;
              const unreviewedInOffer = sentShortlists.reduce(
                (acc, sl) => acc + sl.items.filter((i) => !i.clientDecision).length,
                0
              );

              return (
                <div
                  key={offer.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {offer.contractType}
                      </span>
                      {unreviewedInOffer > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 animate-pulse">
                          {unreviewedInOffer} profil(s) à valider
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-base font-bold text-slate-900">
                      {offer.title}
                    </h3>
                    <p className="text-xs text-slate-500">{offer.location || "Localisation non précisée"}</p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {sentShortlists.length} sélection(s) reçue(s)
                    </span>
                    <Link
                      href={`/client/offres/${offer.id}/shortlist`}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition"
                    >
                      Consulter les profils →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
