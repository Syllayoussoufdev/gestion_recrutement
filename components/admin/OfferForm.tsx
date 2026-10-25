"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  ArrowLeft,
  Loader2,
  Check,
  X,
  Eye,
  Edit3,
} from "lucide-react";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ContractType, OfferStatus } from "@prisma/client";

export interface CompanyOption {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export interface OfferFormData {
  id?: string;
  companyId: string;
  title: string;
  description: string;
  skills: string[];
  contractType: ContractType;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  status: OfferStatus;
}

interface OfferFormProps {
  companies: CompanyOption[];
  initialData?: OfferFormData;
  defaultCompanyId?: string;
  isEdit?: boolean;
}

export default function OfferForm({
  companies,
  initialData,
  defaultCompanyId,
  isEdit = false,
}: OfferFormProps) {
  const router = useRouter();

  const [companyId, setCompanyId] = useState(
    initialData?.companyId || defaultCompanyId || (companies[0]?.id || "")
  );
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(
    initialData?.description ||
      "## Contexte de la mission\n\nPrésentation de l'environnement et de l'équipe.\n\n### Vos missions principales\n- Mission 1\n- Mission 2\n\n### Profil recherché\n- Compétence clé 1\n- Compétence clé 2"
  );
  const [skills, setSkills] = useState<string[]>(initialData?.skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [contractType, setContractType] = useState<ContractType>(
    initialData?.contractType || ContractType.CDI
  );
  const [location, setLocation] = useState(initialData?.location || "");
  const [salaryMin, setSalaryMin] = useState<string>(
    initialData?.salaryMin != null ? initialData.salaryMin.toString() : ""
  );
  const [salaryMax, setSalaryMax] = useState<string>(
    initialData?.salaryMax != null ? initialData.salaryMax.toString() : ""
  );
  const [status, setStatus] = useState<OfferStatus>(
    initialData?.status || OfferStatus.OPEN
  );

  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSkill(value: string) {
    const trimmed = value.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  }

  function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(skillInput);
    }
  }

  function removeSkill(index: number) {
    setSkills(skills.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyId) {
      setError("Veuillez sélectionner une entreprise cliente.");
      return;
    }

    if (!title.trim()) {
      setError("Le titre de l'offre est obligatoire.");
      return;
    }

    if (!description.trim()) {
      setError("La description de l'offre est requise.");
      return;
    }

    const minNum = salaryMin ? parseInt(salaryMin, 10) : null;
    const maxNum = salaryMax ? parseInt(salaryMax, 10) : null;

    if (minNum != null && maxNum != null && minNum > maxNum) {
      setError("Le salaire minimum ne peut pas dépasser le salaire maximum.");
      return;
    }

    setSaving(true);

    const payload = {
      companyId,
      title: title.trim(),
      description: description.trim(),
      skills,
      contractType,
      location: location.trim() || null,
      salaryMin: minNum,
      salaryMax: maxNum,
      status,
    };

    try {
      const url = isEdit
        ? `/api/admin/offres/${initialData?.id}`
        : "/api/admin/offres";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Une erreur est survenue lors de l'enregistrement de l'offre.");
        setSaving(false);
        return;
      }

      router.push(`/admin/offres/${json.id}`);
      router.refresh();
    } catch {
      setError("Erreur réseau. Impossible de contacter le serveur.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header & Back */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild type="button">
          <Link href="/admin/offres">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isEdit ? "Modifier l'offre d'emploi" : "Nouvelle offre d'emploi"}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit
              ? "Mettez à jour les critères et la description du poste."
              : "Créez une nouvelle offre liée à une entreprise cliente."}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Critères principaux */}
      <Card>
        <CardHeader>
          <CardTitle>Détails du poste</CardTitle>
          <CardDescription>
            Entreprise, intitulé, type de contrat et localisation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyId">Entreprise cliente *</Label>
              <select
                id="companyId"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <option value="" disabled>
                  Sélectionnez une entreprise
                </option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offerTitle">Intitulé du poste *</Label>
              <Input
                id="offerTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Chef de Projet Digital"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="contractType">Type de contrat *</Label>
              <select
                id="contractType"
                value={contractType}
                onChange={(e) => setContractType(e.target.value as ContractType)}
                required
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <option value={ContractType.CDI}>CDI</option>
                <option value={ContractType.CDD}>CDD</option>
                <option value={ContractType.FREELANCE}>Freelance</option>
                <option value={ContractType.STAGE}>Stage</option>
                <option value={ContractType.ALTERNANCE}>Alternance</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Localisation</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Abidjan (Plateau) ou Hybride"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offerStatus">Statut de l&apos;offre *</Label>
              <select
                id="offerStatus"
                value={status}
                onChange={(e) => setStatus(e.target.value as OfferStatus)}
                required
                className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <option value={OfferStatus.OPEN}>Ouverte (En recrutement)</option>
                <option value={OfferStatus.DRAFT}>Brouillon</option>
                <option value={OfferStatus.CLOSED}>Clôturée</option>
              </select>
            </div>
          </div>

          {/* Rémunération */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="salaryMin">Rémunération minimum (annuelle brute)</Label>
              <Input
                id="salaryMin"
                type="number"
                min="0"
                step="1000"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="Ex: 35000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salaryMax">Rémunération maximum (annuelle brute)</Label>
              <Input
                id="salaryMax"
                type="number"
                min="0"
                step="1000"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="Ex: 50000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compétences requises (Tags) */}
      <Card>
        <CardHeader>
          <CardTitle>Compétences requises (Tags)</CardTitle>
          <CardDescription>
            Ajoutez les mots-clés et compétences recherchées (Entrée ou virgule pour valider chaque tag).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {skills.map((skill, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1.5 px-3 py-1 text-xs"
              >
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => removeSkill(index)}
                  className="rounded-full hover:bg-slate-200 p-0.5"
                  aria-label={`Supprimer ${skill}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              placeholder="Ex: React, TypeScript, Gestion de projet, Excel..."
              className="max-w-md"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addSkill(skillInput)}
            >
              Ajouter tag
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Description du poste (Markdown) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Description de l&apos;offre (Markdown)</CardTitle>
            <CardDescription>
              Détaillez les missions, le profil et les avantages du poste.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreviewMarkdown(!previewMarkdown)}
            className="flex items-center gap-1.5"
          >
            {previewMarkdown ? (
              <>
                <Edit3 className="h-4 w-4" />
                <span>Éditer</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                <span>Aperçu HTML</span>
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {previewMarkdown ? (
            <div
              className="min-h-[260px] rounded-md border border-slate-200 bg-white p-4 prose prose-slate max-w-none text-sm"
              dangerouslySetInnerHTML={{
                __html: marked.parse(description || "*Aucune description saisie.*") as string,
              }}
            />
          ) : (
            <textarea
              rows={12}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900"
              placeholder="Rédigez la description en Markdown..."
            />
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" asChild type="button">
          <Link href="/admin/offres">Annuler</Link>
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Enregistrement...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              <span>{isEdit ? "Enregistrer les modifications" : "Publier l'offre"}</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
