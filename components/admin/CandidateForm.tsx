"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, FileText, Upload, Trash2, Plus, ArrowLeft, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface CandidateFormData {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  currentTitle?: string | null;
  skills: string[];
  availableFrom?: string | null;
  source: "LINKEDIN" | "NETWORK" | "SPONTANEOUS" | "JOB_BOARD" | "OTHER";
  cvPublicId?: string | null;
  cvResourceType?: string | null;
  cvDeliveryType?: string | null;
  cvMimeType?: string | null;
  cvSizeBytes?: number | null;
}

interface CandidateFormProps {
  initialData?: CandidateFormData;
  isEdit?: boolean;
}

export default function CandidateForm({ initialData, isEdit = false }: CandidateFormProps) {
  const router = useRouter();

  const [firstName, setFirstName] = useState(initialData?.firstName || "");
  const [lastName, setLastName] = useState(initialData?.lastName || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [currentTitle, setCurrentTitle] = useState(initialData?.currentTitle || "");
  const [skills, setSkills] = useState<string[]>(initialData?.skills || []);
  const [skillInput, setSkillInput] = useState("");
  const [availableFrom, setAvailableFrom] = useState(
    initialData?.availableFrom ? new Date(initialData.availableFrom).toISOString().split("T")[0] : ""
  );
  const [source, setSource] = useState<CandidateFormData["source"]>(
    initialData?.source || "OTHER"
  );

  // CV privé Cloudinary
  const [cvPublicId, setCvPublicId] = useState(initialData?.cvPublicId || "");
  const [cvResourceType, setCvResourceType] = useState(initialData?.cvResourceType || "raw");
  const [cvDeliveryType, setCvDeliveryType] = useState(initialData?.cvDeliveryType || "authenticated");
  const [cvMimeType, setCvMimeType] = useState(initialData?.cvMimeType || "");
  const [cvSizeBytes, setCvSizeBytes] = useState<number | null>(initialData?.cvSizeBytes || null);
  const [cvFileName, setCvFileName] = useState<string | null>(
    initialData?.cvPublicId ? "CV enregistré (Cloudinary privé)" : null
  );

  const [uploadingCv, setUploadingCv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addSkill() {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  }

  function removeSkill(skillToRemove: string) {
    setSkills(skills.filter((s) => s !== skillToRemove));
  }

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx)$/i)) {
      setError("Format non supporté. Veuillez sélectionner un fichier PDF ou DOC/DOCX.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Le document ne doit pas dépasser 10 Mo.");
      return;
    }

    setUploadingCv(true);
    setError(null);

    try {
      // 1. Obtenir la signature serveur pour un document privé (authenticated)
      const sigRes = await fetch("/api/admin/cloudinary/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "cv", type: "authenticated" }),
      });

      if (!sigRes.ok) {
        throw new Error("Impossible d'obtenir la signature Cloudinary sécurisée.");
      }

      const sigData = await sigRes.json();

      // 2. Upload direct vers Cloudinary en mode 'authenticated'
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", sigData.apiKey);
      formData.append("timestamp", sigData.timestamp.toString());
      formData.append("signature", sigData.signature);
      formData.append("folder", sigData.folder);
      formData.append("type", "authenticated");

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigData.cloudName}/raw/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error("Cloudinary upload failed:", errText);
        throw new Error("Échec de l'envoi du CV vers Cloudinary.");
      }

      const uploadData = await uploadRes.json();

      setCvPublicId(uploadData.public_id);
      setCvResourceType("raw");
      setCvDeliveryType("authenticated");
      setCvMimeType(file.type || "application/pdf");
      setCvSizeBytes(uploadData.bytes || file.size);
      setCvFileName(file.name);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi du CV.");
    } finally {
      setUploadingCv(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Le prénom, le nom et l'adresse email sont obligatoires.");
      return;
    }

    setSaving(true);

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      currentTitle: currentTitle.trim() || null,
      skills,
      availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      source,
      cvPublicId: cvPublicId || null,
      cvResourceType,
      cvDeliveryType,
      cvMimeType: cvMimeType || null,
      cvSizeBytes,
    };

    try {
      const url = isEdit ? `/api/admin/candidats/${initialData?.id}` : "/api/admin/candidats";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Une erreur est survenue lors de l'enregistrement.");
      }

      router.push(`/admin/candidats/${data.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de communication avec le serveur.");
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

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Informations personnelles
          </CardTitle>
          <CardDescription>
            Identité et coordonnées du candidat. Ces informations sont protégées et isolées à votre cabinet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">
                Prénom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                placeholder="Ex: Jean-Eudes"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                placeholder="Ex: Kouamé"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">
                Adresse email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Ex: j.kouame@example.ci"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Numéro de téléphone</Label>
              <Input
                id="phone"
                placeholder="Ex: +225 07 00 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentTitle">Poste actuel / Intitulé cible</Label>
              <Input
                id="currentTitle"
                placeholder="Ex: Développeur Fullstack Senior"
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source d&apos;acquisition</Label>
              <select
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value as CandidateFormData["source"])}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="LINKEDIN">LinkedIn</option>
                <option value="NETWORK">Réseau personnel / Cooptation</option>
                <option value="SPONTANEOUS">Candidature spontanée</option>
                <option value="JOB_BOARD">Job Board</option>
                <option value="OTHER">Autre</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="availableFrom">Date de disponibilité</Label>
            <Input
              id="availableFrom"
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Compétences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compétences et Mots-clés</CardTitle>
          <CardDescription>
            Ajoutez les compétences clés pour faciliter les recherches et les filtres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ex: TypeScript, React, Docker..."
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addSkill}>
              <Plus className="h-4 w-4 mr-1" />
              Ajouter
            </Button>
          </div>

          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="hover:text-destructive focus:outline-none"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Curriculum Vitae (Cloudinary Privé - R4) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Curriculum Vitae (Stockage Privé)
          </CardTitle>
          <CardDescription>
            Conformément à la règle de sécurité R4, le CV est stocké en mode privé authentifié sur Cloudinary.
            Aucune URL publique n&apos;est divulguée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cvPublicId ? (
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/40">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">{cvFileName || "CV téléchargé"}</p>
                  <p className="text-xs text-muted-foreground">
                    Stocké en mode privé sécurisé (publicId: {cvPublicId.slice(0, 24)}...)
                    {cvSizeBytes ? ` • ${(cvSizeBytes / 1024).toFixed(0)} Ko` : ""}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCvPublicId("");
                  setCvFileName(null);
                  setCvSizeBytes(null);
                }}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remplacer
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <label
                htmlFor="cvUploadInput"
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  uploadingCv
                    ? "border-primary bg-primary/5 cursor-wait"
                    : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30"
                }`}
              >
                {uploadingCv ? (
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span className="text-sm font-medium">Chiffrement et envoi sécurisé en cours...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8" />
                    <span className="text-sm font-medium">Cliquez pour importer le CV (PDF, DOC, DOCX)</span>
                    <span className="text-xs">Taille maximale : 10 Mo • Chiffrement au repos</span>
                  </div>
                )}
                <input
                  id="cvUploadInput"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleCvUpload}
                  disabled={uploadingCv}
                />
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={saving || uploadingCv}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Annuler
        </Button>
        <Button type="submit" disabled={saving || uploadingCv}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enregistrement...
            </>
          ) : isEdit ? (
            "Enregistrer les modifications"
          ) : (
            "Créer le profil candidat"
          )}
        </Button>
      </div>
    </form>
  );
}
