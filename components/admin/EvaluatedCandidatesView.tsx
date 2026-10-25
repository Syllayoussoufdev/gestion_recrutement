"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  Edit,
  Loader2,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreSuggestion } from "@prisma/client";

interface EvaluatedCandidateItem {
  applicationId: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    currentTitle: string | null;
    skills: string[];
    availableFrom: string | null;
    cvPublicId: string | null;
  };
  status: string;
  attempt: {
    id: string;
    status: string;
    percent: number | null;
    autoPoints: number;
    manualPoints: number | null;
    maxPoints: number;
    suggestion: ScoreSuggestion | null;
    submittedAt: string | null;
    gradedAt: string | null;
    gradedBy: { firstName: string; lastName: string } | null;
  };
  skillsCoverage: {
    covered: number;
    total: number;
    ratioText: string;
  };
}

interface EvaluatedCandidatesViewProps {
  offerId: string;
  offerTitle: string;
  assessmentTitle: string;
  initialItems: EvaluatedCandidateItem[];
}

export default function EvaluatedCandidatesView({
  offerId,
  offerTitle,
  assessmentTitle,
  initialItems,
}: EvaluatedCandidatesViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<EvaluatedCandidateItem[]>(initialItems);
  const [filterSuggestion, setFilterSuggestion] = useState<string>("ALL");

  // Modal notation manuelle
  const [gradingAttemptId, setGradingAttemptId] = useState<string | null>(null);
  const [gradingCandidateName, setGradingCandidateName] = useState("");
  const [loadingAttemptDetails, setLoadingAttemptDetails] = useState(false);
  const [textQuestionsToGrade, setTextQuestionsToGrade] = useState<
    Array<{
      questionId: string;
      prompt: string;
      points: number;
      rubric: string | null;
      candidateAnswer: string;
      manualPoints: number;
      comment: string;
    }>
  >([]);
  const [savingGrades, setSavingGrades] = useState(false);

  // Filtrage
  const filtered = items.filter((item) => {
    if (filterSuggestion === "ALL") return true;
    return item.attempt.suggestion === filterSuggestion;
  });

  // Ouvrir modal de notation manuelle
  async function handleOpenGrading(attemptId: string, candidateName: string, applicationId: string) {
    setGradingAttemptId(attemptId);
    setGradingCandidateName(candidateName);
    setLoadingAttemptDetails(true);

    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/assessment`);
      const data = await res.json();

      if (res.ok) {
        // Filtrer les questions ouvertes
        const textQs = data.assessment.questions
          .filter((q: any) => q.type === "SHORT_TEXT" || q.type === "LONG_TEXT")
          .map((q: any) => {
            const answer = data.answers.find((a: any) => a.questionId === q.id);
            return {
              questionId: q.id,
              prompt: q.prompt,
              points: q.points,
              rubric: q.rubric,
              candidateAnswer: (answer?.answer as string) || "(Aucune réponse)",
              manualPoints: answer?.manualPoints ?? 0,
              comment: answer?.comment || "",
            };
          });

        setTextQuestionsToGrade(textQs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAttemptDetails(false);
    }
  }

  // Soumettre les notes manuelles
  async function handleSaveGrades(e: React.FormEvent) {
    e.preventDefault();
    if (!gradingAttemptId) return;

    setSavingGrades(true);
    try {
      const payload = {
        grades: textQuestionsToGrade.map((q) => ({
          questionId: q.questionId,
          manualPoints: Number(q.manualPoints),
          comment: q.comment.trim() || undefined,
        })),
      };

      const res = await fetch(`/api/admin/attempts/${gradingAttemptId}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la notation.");
      }

      setGradingAttemptId(null);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingGrades(false);
    }
  }

  // Action rapide : passer à VALIDATED
  async function handleValidate(applicationId: string) {
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: "VALIDATED",
          note: "Validé par le consultant suite à l'évaluation technique.",
        }),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.applicationId === applicationId ? { ...i, status: "VALIDATED" } : i))
        );
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Barre de filtres */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Suggestion déterministe :</span>
          <select
            value={filterSuggestion}
            onChange={(e) => setFilterSuggestion(e.target.value)}
            className="h-8 text-xs border rounded-md px-2 bg-background"
          >
            <option value="ALL">Toutes les suggestions</option>
            <option value="RECOMMEND_VALIDATE">Recommandé pour validation</option>
            <option value="TO_REVIEW">À revoir</option>
            <option value="BELOW_THRESHOLD">En dessous du seuil</option>
          </select>
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>{filtered.length}</strong> candidat(s) évalué(s)
        </div>
      </div>

      {/* Tableau des candidats évalués (PRD V2 §5) */}
      <div className="bg-white rounded-xl border shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidat</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Score & Points</TableHead>
              <TableHead>Compétences couvertes</TableHead>
              <TableHead>Suggestion (R3)</TableHead>
              <TableHead>Notation</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Aucun candidat évalué pour cette offre.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const isComplete = item.attempt.status === "GRADED";
                const percent = item.attempt.percent ?? 0;

                return (
                  <TableRow key={item.applicationId} className="hover:bg-slate-50">
                    <TableCell>
                      <Link
                        href={`/admin/candidats/${item.candidate.id}`}
                        className="font-medium text-slate-900 hover:text-primary transition-colors flex items-center gap-1.5"
                      >
                        {item.candidate.firstName} {item.candidate.lastName}
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Link>
                      <span className="text-xs text-muted-foreground block">
                        {item.candidate.currentTitle || "Sans titre"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-xs font-medium">
                        {item.status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{percent}%</span>
                        <span className="text-xs text-muted-foreground">
                          ({(item.attempt.autoPoints + (item.attempt.manualPoints || 0)).toFixed(1)} / {item.attempt.maxPoints} pts)
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                        {item.skillsCoverage.ratioText}
                      </span>
                    </TableCell>

                    <TableCell>
                      {item.attempt.suggestion === "RECOMMEND_VALIDATE" && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          <CheckCircle2 className="h-3 w-3" />
                          Recommandé
                        </span>
                      )}
                      {item.attempt.suggestion === "TO_REVIEW" && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          <AlertTriangle className="h-3 w-3" />
                          À revoir
                        </span>
                      )}
                      {item.attempt.suggestion === "BELOW_THRESHOLD" && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                          <XCircle className="h-3 w-3" />
                          En dessous
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {isComplete ? (
                        <span className="text-xs text-emerald-700 font-medium">Complète</span>
                      ) : (
                        <span className="text-xs text-amber-700 font-medium">À noter</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleOpenGrading(
                              item.attempt.id,
                              `${item.candidate.firstName} ${item.candidate.lastName}`,
                              item.applicationId
                            )
                          }
                          className="h-7 text-xs"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Noter
                        </Button>

                        {item.status !== "VALIDATED" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleValidate(item.applicationId)}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          >
                            Valider
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Notation Manuelle des questions texte (PRD V2 §4.2) */}
      {gradingAttemptId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Edit className="h-5 w-5 text-primary" />
                  Notation manuelle — {gradingCandidateName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Attribuez les points aux questions ouvertes selon les consignes du barème.
                </p>
              </div>
              <button
                onClick={() => setGradingAttemptId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingAttemptDetails ? (
              <div className="py-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Chargement des réponses...
              </div>
            ) : textQuestionsToGrade.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-4 text-center">
                Ce test ne comporte aucune question texte nécessitant une notation manuelle.
              </p>
            ) : (
              <form onSubmit={handleSaveGrades} className="space-y-4">
                {textQuestionsToGrade.map((q, idx) => (
                  <div key={q.questionId} className="p-4 rounded-lg border bg-slate-50/50 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{q.prompt}</p>
                      <span className="text-xs text-muted-foreground shrink-0 font-medium">
                        Max : {q.points} pt(s)
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded border text-xs text-slate-800 whitespace-pre-wrap">
                      <span className="font-semibold text-slate-500 block mb-1">
                        Réponse du candidat :
                      </span>
                      {q.candidateAnswer}
                    </div>

                    {q.rubric && (
                      <p className="text-xs text-slate-500 bg-amber-50/50 p-2 rounded border border-amber-200/50">
                        <strong>Consigne :</strong> {q.rubric}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-xs font-medium text-slate-700 block mb-1">
                          Points attribués (0 à {q.points}) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={q.points}
                          step="0.5"
                          value={q.manualPoints}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setTextQuestionsToGrade((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, manualPoints: val } : item
                              )
                            );
                          }}
                          className="w-full h-8 px-2 text-xs border rounded bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-700 block mb-1">
                          Commentaire pour l&apos;audit
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Bonnes notions, arguments solides..."
                          value={q.comment}
                          onChange={(e) => {
                            const text = e.target.value;
                            setTextQuestionsToGrade((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, comment: text } : item
                              )
                            );
                          }}
                          className="w-full h-8 px-2 text-xs border rounded bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setGradingAttemptId(null)}
                    disabled={savingGrades}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={savingGrades}>
                    {savingGrades ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Calcul et enregistrement...
                      </>
                    ) : (
                      "Enregistrer les notes"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
