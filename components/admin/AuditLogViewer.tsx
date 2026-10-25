"use client";

import { useState } from "react";

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  actorUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
}

interface AuditLogViewerProps {
  initialLogs: AuditLogEntry[];
  totalCount: number;
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  DOCUMENT_VIEW: { label: "Consultation Document", color: "bg-blue-100 text-blue-800", icon: "📄" },
  CSV_EXPORT: { label: "Export CSV", color: "bg-purple-100 text-purple-800", icon: "📊" },
  RETENTION_PURGE: { label: "Purge Rétention RGPD", color: "bg-red-100 text-red-800", icon: "🔒" },
  SHORTLIST_CREATE: { label: "Création Shortlist", color: "bg-amber-100 text-amber-800", icon: "📋" },
  SHORTLIST_SENT: { label: "Shortlist Envoyée", color: "bg-emerald-100 text-emerald-800", icon: "🚀" },
  CLIENT_SHORTLIST_DECISION: { label: "Décision Client", color: "bg-indigo-100 text-indigo-800", icon: "🎯" },
  INTERVIEW_PROPOSAL_CREATE: { label: "Proposition Entretien", color: "bg-sky-100 text-sky-800", icon: "⏳" },
  INTERVIEW_CONFIRMED: { label: "Entretien Confirmé", color: "bg-emerald-100 text-emerald-800", icon: "📅" },
  INTERVIEW_STATUS_UPDATE: { label: "Mise à jour Entretien", color: "bg-slate-100 text-slate-800", icon: "✏️" },
  AGENCY_SETTINGS_UPDATE: { label: "Paramètres Cabinet", color: "bg-orange-100 text-orange-800", icon: "⚙️" },
};

export default function AuditLogViewer({ initialLogs, totalCount }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFilterChange(action: string) {
    setActionFilter(action);
    setLoading(true);
    try {
      const url = action === "ALL" ? `/api/admin/journal` : `/api/admin/journal?action=${action}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtres rapides */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase text-slate-500">Filtrer par action :</span>
          <select
            value={actionFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">Toutes les actions</option>
            <option value="DOCUMENT_VIEW">Consultations de documents (CV)</option>
            <option value="CSV_EXPORT">Exports CSV</option>
            <option value="RETENTION_PURGE">Purges RGPD & Rétention</option>
            <option value="SHORTLIST_SENT">Envois de shortlists</option>
            <option value="CLIENT_SHORTLIST_DECISION">Décisions des entreprises clientes</option>
            <option value="INTERVIEW_CONFIRMED">Confirmations d&apos;entretiens</option>
            <option value="AGENCY_SETTINGS_UPDATE">Modifications de paramètres</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          <strong>{logs.length}</strong> événement(s) affiché(s) sur un total de <strong>{totalCount}</strong>
        </div>
      </div>

      {/* Tableau du journal d'audit */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Chargement du journal d&apos;audit...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">Aucun événement enregistré pour ce filtre.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3">Date &amp; Heure</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Auteur / Acteur</th>
                  <th className="px-4 py-3">Cible</th>
                  <th className="px-4 py-3">Adresse IP</th>
                  <th className="px-4 py-3 text-right">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const meta = ACTION_LABELS[log.action] || {
                    label: log.action,
                    color: "bg-slate-100 text-slate-800",
                    icon: "📌",
                  };
                  const isExpanded = expandedLogId === log.id;
                  const date = new Date(log.createdAt);

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        <div>{date.toLocaleDateString("fr-FR")}</div>
                        <div className="text-[11px] text-slate-400">{date.toLocaleTimeString("fr-FR")}</div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.color}`}>
                          <span>{meta.icon}</span>
                          {meta.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.actorUser ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {log.actorUser.firstName} {log.actorUser.lastName}
                            </div>
                            <div className="text-[11px] text-slate-500">{log.actorUser.role}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Système / Candidat public</span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        <span className="font-medium">{log.targetType}</span>
                        {log.targetId && (
                          <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                            {log.targetId}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {log.ipAddress || "—"}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        {log.metadata ? (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                          >
                            {isExpanded ? "Masquer" : "Voir métadonnées"}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Détail métadonnées étendu */}
      {expandedLogId && (
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-xs font-mono text-emerald-400 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
            <span>Métadonnées d&apos;audit — Log ID : {expandedLogId}</span>
            <button onClick={() => setExpandedLogId(null)} className="hover:text-white">✕ Fermer</button>
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(logs.find((l) => l.id === expandedLogId)?.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
