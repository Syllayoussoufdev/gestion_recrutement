"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit,
  UserPlus,
  Loader2,
  Check,
  X,
  Search,
  Kanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OfferStatus } from "@prisma/client";

interface CandidateOption {
  id: string;
  firstName: string;
  lastName: string;
  currentTitle?: string | null;
  skills: string[];
}

interface OfferDetailActionsProps {
  offerId: string;
  currentStatus: OfferStatus;
  availableCandidates: CandidateOption[];
}

export default function OfferDetailActions({
  offerId,
  currentStatus,
  availableCandidates,
}: OfferDetailActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<OfferStatus>(currentStatus);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStatusChange(newStatus: OfferStatus) {
    if (newStatus === status) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/offres/${offerId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
        router.refresh();
      } else {
        alert("Impossible de modifier le statut de l'offre.");
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAssignCandidate() {
    if (!selectedCandidateId) return;
    setAssigning(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/offres/${offerId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: selectedCandidateId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'assignation.");
        setAssigning(false);
        return;
      }

      setModalOpen(false);
      setSelectedCandidateId("");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setAssigning(false);
    }
  }

  const filteredCandidates = availableCandidates.filter((c) => {
    const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
    const query = search.toLowerCase();
    return (
      fullName.includes(query) ||
      (c.currentTitle && c.currentTitle.toLowerCase().includes(query)) ||
      c.skills.some((s) => s.toLowerCase().includes(query))
    );
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Sélecteur de statut rapide */}
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as OfferStatus)}
          disabled={updatingStatus}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-xs focus:border-slate-900 focus:outline-hidden"
        >
          <option value={OfferStatus.OPEN}>Ouverte (En cours)</option>
          <option value={OfferStatus.DRAFT}>Brouillon</option>
          <option value={OfferStatus.CLOSED}>Clôturée</option>
        </select>

        {/* Bouton Vue Kanban Pipeline */}
        <Button variant="default" size="sm" asChild>
          <Link href={`/admin/offres/${offerId}/pipeline`} className="flex items-center gap-1.5">
            <Kanban className="h-4 w-4" />
            <span>Vue Pipeline</span>
          </Link>
        </Button>

        {/* Bouton Shortlists Client */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/offres/${offerId}/shortlists`} className="flex items-center gap-1.5">
            <span>📋 Shortlists Client</span>
          </Link>
        </Button>

        {/* Bouton Assigner Candidat */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setModalOpen(true);
            setError(null);
          }}
          className="flex items-center gap-1.5"
        >
          <UserPlus className="h-4 w-4" />
          <span>Assigner un candidat</span>
        </Button>

        {/* Bouton Modifier */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/offres/${offerId}/edit`} className="flex items-center gap-1.5">
            <Edit className="h-4 w-4" />
            <span>Modifier l&apos;offre</span>
          </Link>
        </Button>
      </div>

      {/* Modal d'assignation candidat */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Assigner un candidat à l&apos;offre
                </h3>
                <p className="text-xs text-slate-500">
                  Le candidat sera placé dans la colonne &quot;Identifié&quot; du pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-sm p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Rechercher par nom, titre, compétences..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-100 rounded-lg p-1">
              {filteredCandidates.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  Aucun candidat disponible trouvé.
                </p>
              ) : (
                filteredCandidates.map((c) => {
                  const isSelected = selectedCandidateId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCandidateId(c.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-md p-2.5 text-xs transition ${
                        isSelected
                          ? "bg-slate-900 text-white"
                          : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div>
                        <p className="font-semibold">
                          {c.firstName} {c.lastName}
                        </p>
                        {c.currentTitle && (
                          <p className={isSelected ? "text-slate-300" : "text-slate-500"}>
                            {c.currentTitle}
                          </p>
                        )}
                        {c.skills.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.skills.slice(0, 3).map((s, idx) => (
                              <span
                                key={idx}
                                className={`rounded px-1.5 py-0.2 text-[10px] ${
                                  isSelected
                                    ? "bg-slate-800 text-slate-200"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={!selectedCandidateId || assigning}
                onClick={handleAssignCandidate}
              >
                {assigning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    <span>Assignation...</span>
                  </>
                ) : (
                  <span>Confirmer l&apos;assignation</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
