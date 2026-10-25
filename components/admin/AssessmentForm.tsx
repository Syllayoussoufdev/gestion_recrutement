"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  HelpCircle,
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuestionType } from "@prisma/client";

export interface OptionDraft {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDraft {
  id?: string;
  order: number;
  type: QuestionType;
  prompt: string;
  points: number;
  skillTag: string;
  rubric: string;
  required: boolean;
  options: OptionDraft[];
}

export interface AssessmentFormData {
  id?: string;
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number | "";
  passPercent: number;
  reviewPercent: number;
  shuffleQuestions: boolean;
  questions: QuestionDraft[];
}

interface AssessmentFormProps {
  initialData?: AssessmentFormData;
  isEdit?: boolean;
}

export default function AssessmentForm({ initialData, isEdit = false }: AssessmentFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [instructions, setInstructions] = useState(initialData?.instructions || "");
  const [durationMinutes, setDurationMinutes] = useState<number | "">(
    initialData?.durationMinutes ?? 30
  );
  const [passPercent, setPassPercent] = useState<number>(initialData?.passPercent ?? 70);
  const [reviewPercent, setReviewPercent] = useState<number>(initialData?.reviewPercent ?? 50);
  const [shuffleQuestions, setShuffleQuestions] = useState(initialData?.shuffleQuestions ?? false);

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialData?.questions && initialData.questions.length > 0
      ? initialData.questions
      : [
          {
            order: 0,
            type: QuestionType.MCQ_SINGLE,
            prompt: "Quelle est la principale différence entre React et Angular ?",
            points: 2,
            skillTag: "Frontend",
            rubric: "",
            required: true,
            options: [
              { id: "opt-1", text: "React est une bibliothèque, Angular est un framework complet", isCorrect: true },
              { id: "opt-2", text: "Angular n'utilise pas TypeScript", isCorrect: false },
              { id: "opt-3", text: "React ne supporte pas le rendu côté serveur", isCorrect: false },
            ],
          },
        ]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addQuestion(type: QuestionType = QuestionType.MCQ_SINGLE) {
    const newQ: QuestionDraft = {
      order: questions.length,
      type,
      prompt: "",
      points: 1,
      skillTag: "",
      rubric: "",
      required: true,
      options:
        type === QuestionType.MCQ_SINGLE || type === QuestionType.MCQ_MULTI
          ? [
              { id: `opt-${Date.now()}-1`, text: "", isCorrect: true },
              { id: `opt-${Date.now()}-2`, text: "", isCorrect: false },
            ]
          : [],
    };
    setQuestions([...questions, newQ]);
  }

  function removeQuestion(index: number) {
    if (questions.length <= 1) {
      alert("Un questionnaire doit comporter au moins une question.");
      return;
    }
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function updateQuestion(index: number, field: keyof QuestionDraft, value: any) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const updated = { ...q, [field]: value };
        // Si changement de type vers QCM et options vides, en ajouter par défaut
        if (
          (field === "type" &&
            (value === QuestionType.MCQ_SINGLE || value === QuestionType.MCQ_MULTI) &&
            updated.options.length === 0)
        ) {
          updated.options = [
            { id: `opt-${Date.now()}-1`, text: "", isCorrect: true },
            { id: `opt-${Date.now()}-2`, text: "", isCorrect: false },
          ];
        }
        return updated;
      })
    );
  }

  function addOption(qIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return {
          ...q,
          options: [
            ...q.options,
            { id: `opt-${Date.now()}-${q.options.length + 1}`, text: "", isCorrect: false },
          ],
        };
      })
    );
  }

  function removeOption(qIndex: number, optIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        if (q.options.length <= 2) {
          alert("Une question QCM doit avoir au moins 2 options.");
          return q;
        }
        return {
          ...q,
          options: q.options.filter((_, oi) => oi !== optIndex),
        };
      })
    );
  }

  function updateOptionText(qIndex: number, optIndex: number, text: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return {
          ...q,
          options: q.options.map((opt, oi) => (oi === optIndex ? { ...opt, text } : opt)),
        };
      })
    );
  }

  function toggleOptionCorrect(qIndex: number, optIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        if (q.type === QuestionType.MCQ_SINGLE) {
          // Une seule réponse correcte
          return {
            ...q,
            options: q.options.map((opt, oi) => ({ ...opt, isCorrect: oi === optIndex })),
          };
        } else {
          // Choix multiples
          return {
            ...q,
            options: q.options.map((opt, oi) =>
              oi === optIndex ? { ...opt, isCorrect: !opt.isCorrect } : opt
            ),
          };
        }
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Le titre du questionnaire est obligatoire.");
      return;
    }

    // Valider les questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) {
        setError(`L'énoncé de la question ${i + 1} est obligatoire.`);
        return;
      }
      if (q.type === QuestionType.MCQ_SINGLE || q.type === QuestionType.MCQ_MULTI) {
        if (q.options.some((o) => !o.text.trim())) {
          setError(`Toutes les options de la question ${i + 1} doivent être renseignées.`);
          return;
        }
        if (!q.options.some((o) => o.isCorrect)) {
          setError(`Au moins une option correcte doit être cochée pour la question ${i + 1}.`);
          return;
        }
      }
    }

    setSaving(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      durationMinutes: durationMinutes === "" ? null : Number(durationMinutes),
      passPercent,
      reviewPercent,
      shuffleQuestions,
      questions: questions.map((q, idx) => ({
        order: idx,
        type: q.type,
        prompt: q.prompt.trim(),
        points: Number(q.points) || 1.0,
        skillTag: q.skillTag.trim() || null,
        rubric: q.rubric.trim() || null,
        required: q.required,
        options:
          q.type === QuestionType.MCQ_SINGLE || q.type === QuestionType.MCQ_MULTI
            ? q.options.map((opt) => ({
                id: opt.id,
                text: opt.text.trim(),
                isCorrect: opt.isCorrect,
              }))
            : null,
      })),
    };

    try {
      const url = isEdit ? `/api/admin/assessments/${initialData?.id}` : "/api/admin/assessments";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Erreur lors de l'enregistrement");
      }

      router.push(`/admin/evaluations/${resData.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de communication");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Paramètres généraux */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Paramètres du Questionnaire
          </CardTitle>
          <CardDescription>
            Configuration générale, durée et seuils de validation déterministe (R3).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Titre du questionnaire <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Ex: Évaluation Technique Fullstack (React & Node.js)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description courte</Label>
              <Input
                id="description"
                placeholder="Ex: Test pour développeurs confirmés (séniorité 3+ ans)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Durée limite (minutes, optionnel)</Label>
              <Input
                id="duration"
                type="number"
                min="5"
                max="180"
                placeholder="Ex: 30 (laisser vide pour temps libre)"
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Consignes affichées au candidat</Label>
            <textarea
              id="instructions"
              rows={2}
              placeholder="Ex: Prenez le temps de bien lire chaque question. Certaines questions comportent plusieurs bonnes réponses."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full p-2.5 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="passPercent">Seuil de validation suggérée (%)</Label>
              <Input
                id="passPercent"
                type="number"
                min="0"
                max="100"
                value={passPercent}
                onChange={(e) => setPassPercent(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Score au-dessus duquel la validation est recommandée (défaut 70%).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reviewPercent">Seuil &quot;À revoir&quot; (%)</Label>
              <Input
                id="reviewPercent"
                type="number"
                min="0"
                max="100"
                value={reviewPercent}
                onChange={(e) => setReviewPercent(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">
                Score sous lequel le candidat est classé &quot;En dessous du seuil&quot; (défaut 50%).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Constructeur de questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Questions du test ({questions.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Total points barème :{" "}
              <strong>{questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0)} pts</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion(QuestionType.MCQ_SINGLE)}>
              <Plus className="h-4 w-4 mr-1" />
              QCM Unique
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion(QuestionType.MCQ_MULTI)}>
              <Plus className="h-4 w-4 mr-1" />
              QCM Multiples
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => addQuestion(QuestionType.LONG_TEXT)}>
              <Plus className="h-4 w-4 mr-1" />
              Question Texte
            </Button>
          </div>
        </div>

        {questions.map((q, qIndex) => (
          <Card key={qIndex} className="border-l-4 border-l-primary/70">
            <CardHeader className="py-3 px-5 bg-slate-50/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs bg-primary text-white rounded-full h-5 w-5 flex items-center justify-center">
                  {qIndex + 1}
                </span>
                <span className="text-xs font-semibold text-slate-700">
                  {q.type === QuestionType.MCQ_SINGLE && "QCM à choix unique"}
                  {q.type === QuestionType.MCQ_MULTI && "QCM à choix multiples"}
                  {q.type === QuestionType.SHORT_TEXT && "Texte court (notation manuelle)"}
                  {q.type === QuestionType.LONG_TEXT && "Question ouverte (notation manuelle)"}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeQuestion(qIndex)}
                className="text-destructive hover:bg-destructive/10 h-7 w-7"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3 space-y-1.5">
                  <Label>Énoncé de la question *</Label>
                  <Input
                    placeholder="Posez votre question clairement..."
                    value={q.prompt}
                    onChange={(e) => updateQuestion(qIndex, "prompt", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Points</Label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={q.points}
                    onChange={(e) => updateQuestion(qIndex, "points", Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Compétence associée (tag libre)</Label>
                  <Input
                    placeholder="Ex: React, Base de données, Gestion de projet..."
                    value={q.skillTag}
                    onChange={(e) => updateQuestion(qIndex, "skillTag", e.target.value)}
                  />
                </div>
                {(q.type === QuestionType.SHORT_TEXT || q.type === QuestionType.LONG_TEXT) && (
                  <div className="space-y-1.5">
                    <Label>Consigne de notation (barème consultant)</Label>
                    <Input
                      placeholder="Ex: 2 pts si cite ACID, 1 pt si cite transactions..."
                      value={q.rubric}
                      onChange={(e) => updateQuestion(qIndex, "rubric", e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Options pour QCM */}
              {(q.type === QuestionType.MCQ_SINGLE || q.type === QuestionType.MCQ_MULTI) && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs font-semibold text-slate-700">
                    Options de réponse (Cochez la ou les bonnes réponses)
                  </Label>

                  {q.options.map((opt, optIndex) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleOptionCorrect(qIndex, optIndex)}
                        className={`h-5 w-5 rounded flex items-center justify-center border transition-colors ${
                          opt.isCorrect
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "border-slate-300 hover:border-slate-400"
                        }`}
                        title={opt.isCorrect ? "Bonne réponse" : "Cliquer pour marquer comme bonne réponse"}
                      >
                        {opt.isCorrect && <CheckCircle2 className="h-4 w-4" />}
                      </button>

                      <Input
                        placeholder={`Option ${optIndex + 1}...`}
                        value={opt.text}
                        onChange={(e) => updateOptionText(qIndex, optIndex, e.target.value)}
                        className="flex-1 h-9 text-xs"
                        required
                      />

                      <button
                        type="button"
                        onClick={() => removeOption(qIndex, optIndex)}
                        className="text-muted-foreground hover:text-destructive p-1"
                        title="Supprimer l'option"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addOption(qIndex)}
                    className="text-xs text-primary"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Ajouter une option
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Barre d'action finale */}
      <div className="flex items-center justify-between pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enregistrement...
            </>
          ) : isEdit ? (
            "Enregistrer les modifications"
          ) : (
            "Créer le questionnaire"
          )}
        </Button>
      </div>
    </form>
  );
}
