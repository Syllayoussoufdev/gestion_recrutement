"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AgencySettingsData {
  id: string;
  name: string;
  slug: string;
  senderName: string;
  contactEmail: string;
  timezone: string;
  retentionMonths: number;
  testRetentionMonths: number;
  anonymizeUntilInterest: boolean;
  showScoreToCandidate: boolean;
  brandKey: "blue" | "emerald" | "indigo" | "slate";
}

interface AgencySettingsFormProps {
  initialSettings: AgencySettingsData;
}

const BRAND_OPTIONS = [
  { key: "blue", label: "Bleu Stratos (Corporate)", class: "bg-blue-600 border-blue-700" },
  { key: "emerald", label: "Émeraude (Santé / Assurance)", class: "bg-emerald-600 border-emerald-700" },
  { key: "indigo", label: "Indigo (Tech / Digital)", class: "bg-indigo-600 border-indigo-700" },
  { key: "slate", label: "Ardoise (Neutre / Minimaliste)", class: "bg-slate-700 border-slate-800" },
];

export default function AgencySettingsForm({ initialSettings }: AgencySettingsFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    purgedAnswersCount: number;
    purgedCandidatesCount: number;
    purgedDocumentsCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/admin/parametres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de l'enregistrement des paramètres");
      }

      setSaveSuccess(true);
      router.refresh();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  async function handleExecutePurge() {
    if (
      !confirm(
        `Confirmez-vous le lancement immédiat de la purge RGPD pour le cabinet ?\n\n- Les réponses détaillées de tests de plus de ${formData.testRetentionMonths} mois seront supprimées.\n- Les candidats sans activité depuis plus de ${formData.retentionMonths} mois (et sans mission en cours) seront purgés avec leurs documents Cloudinary.`
      )
    ) {
      return;
    }

    setPurging(true);
    setErrorMsg(null);
    setPurgeResult(null);

    try {
      const res = await fetch("/api/admin/retention/purge", {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la purge");
      }

      setPurgeResult({
        purgedAnswersCount: data.purgedAnswersCount,
        purgedCandidatesCount: data.purgedCandidatesCount,
        purgedDocumentsCount: data.purgedDocumentsCount,
      });
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur lors de la purge");
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="space-y-8">
      {saveSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
          ✓ Paramètres du cabinet enregistrés avec succès.
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1 : Identité & Marque Blanche */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Identité du Cabinet &amp; Marque Blanche
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Nom du cabinet
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Identifiant slug (URL de connexion)
              </label>
              <input
                type="text"
                disabled
                value={formData.slug}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Lien de connexion personnalisé : <code className="text-slate-600">/login?agency={formData.slug}</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Nom d&apos;expéditeur des emails
              </label>
              <input
                type="text"
                required
                value={formData.senderName}
                onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Email de contact officiel
              </label>
              <input
                type="email"
                required
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-2">
              Thème graphique &amp; Palette de marque
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {BRAND_OPTIONS.map((opt) => {
                const isSelected = formData.brandKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFormData({ ...formData, brandKey: opt.key as AgencySettingsData["brandKey"] })}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className={`h-4 w-4 rounded-full border ${opt.class}`} />
                    <span className="text-xs font-semibold text-slate-800">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Section 2 : Règles Métier & Confidentialité */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Règles Métier &amp; Confidentialité
          </h2>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.anonymizeUntilInterest}
                onChange={(e) => setFormData({ ...formData, anonymizeUntilInterest: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900">
                  Anonymisation dynamique des profils en Shortlist (PRD V2 §6.2)
                </span>
                <p className="text-xs text-slate-500">
                  Masque le nom de famille (ex: *Jean D.*), le téléphone et l&apos;email des candidats présentés aux entreprises clientes
                  jusqu&apos;à ce que l&apos;entreprise clique sur &ldquo;Intéressé(e)&rdquo;.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.showScoreToCandidate}
                onChange={(e) => setFormData({ ...formData, showScoreToCandidate: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900">
                  Transparence des résultats aux candidats (Règle R3)
                </span>
                <p className="text-xs text-slate-500">
                  Permet aux candidats de visualiser leur score global et leurs sous-scores directement à l&apos;issue du test.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Section 3 : Rétention & Purge RGPD */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Conformité RGPD &amp; Délais de Rétention
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Rétention des candidats inactifs (en mois)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={formData.retentionMonths}
                onChange={(e) => setFormData({ ...formData, retentionMonths: parseInt(e.target.value, 10) || 24 })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Délai standard RGPD : 24 mois sans interaction ni candidature active.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Rétention des réponses détaillées aux tests (en mois)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                required
                value={formData.testRetentionMonths}
                onChange={(e) => setFormData({ ...formData, testRetentionMonths: parseInt(e.target.value, 10) || 12 })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Après ce délai, les réponses texte/QCM sont effacées, seuls les scores restent conservés.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      </form>

      {/* Section 4 : Outil de Purge Immédiate */}
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-red-950 flex items-center gap-2">
              <span>🧹</span> Purge de Rétention RGPD Automatisée
            </h3>
            <p className="mt-1 text-xs text-red-800">
              Exécute immédiatement le nettoyage des dossiers inactifs et des réponses de test expirées selon les règles ci-dessus.
              Toutes les suppressions de documents privés Cloudinary sont journalisées dans le journal d&apos;audit.
            </p>
          </div>

          <button
            type="button"
            disabled={purging}
            onClick={handleExecutePurge}
            className="rounded-lg bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition disabled:opacity-50 shrink-0"
          >
            {purging ? "Purge en cours..." : "Lancer la purge maintenant"}
          </button>
        </div>

        {purgeResult && (
          <div className="mt-4 rounded-xl border border-emerald-300 bg-white p-4 text-xs space-y-1">
            <div className="font-bold text-emerald-900">Rapport d&apos;exécution de la purge :</div>
            <div className="text-slate-600">• Réponses de tests expirées supprimées : <strong>{purgeResult.purgedAnswersCount}</strong></div>
            <div className="text-slate-600">• Candidats inactifs purgés : <strong>{purgeResult.purgedCandidatesCount}</strong></div>
            <div className="text-slate-600">• Fichiers privés Cloudinary nettoyés : <strong>{purgeResult.purgedDocumentsCount}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}
