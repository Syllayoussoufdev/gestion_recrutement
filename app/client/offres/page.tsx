import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";

export default async function ClientOffresPage() {
  const session = await getSession();
  if (!session || session.role !== "CLIENT" || !session.agencyId || !session.companyId) {
    redirect("/login");
  }

  const db = forAgency(session);

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
            select: { id: true, clientDecision: true },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Postes & Missions de Recrutement</h1>
        <p className="text-sm text-slate-500">
          Suivez l&apos;état d&apos;avancement des postes confiés à votre cabinet partenaire et accédez aux profils qualifiés.
        </p>
      </div>

      {jobOffers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          Aucun poste actif pour votre entreprise.
        </div>
      ) : (
        <div className="space-y-4">
          {jobOffers.map((offer) => {
            const shortlistsCount = offer.shortlists.length;
            const totalCandidates = offer.shortlists.reduce(
              (acc, sl) => acc + sl.items.length,
              0
            );
            const pendingDecisions = offer.shortlists.reduce(
              (acc, sl) => acc + sl.items.filter((i) => !i.clientDecision).length,
              0
            );

            return (
              <div
                key={offer.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">{offer.title}</h2>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {offer.contractType}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        offer.status === "OPEN"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {offer.status === "OPEN" ? "En cours" : "Clôturée"}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500">
                    {offer.location || "Abidjan"} • Créée le{" "}
                    {new Date(offer.createdAt).toLocaleDateString("fr-FR")}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                    <span>
                      <strong>{shortlistsCount}</strong> shortlist(s) transmise(s)
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{totalCandidates}</strong> candidat(s) qualifié(s)
                    </span>
                    {pendingDecisions > 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800">
                        {pendingDecisions} avis en attente
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/client/offres/${offer.id}/shortlist`}
                    className="w-full sm:w-auto text-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    Examiner les profils ({totalCandidates}) →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
