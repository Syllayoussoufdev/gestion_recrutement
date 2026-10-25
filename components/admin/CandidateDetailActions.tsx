"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Download,
  Archive,
  RotateCcw,
  Pencil,
  Plus,
  Loader2,
  ExternalLink,
  MessageSquarePlus,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CandidateDetailActionsProps {
  candidateId: string;
  hasCv: boolean;
  isArchived: boolean;
}

export default function CandidateDetailActions({
  candidateId,
  hasCv,
  isArchived,
}: CandidateDetailActionsProps) {
  const router = useRouter();

  // État consultation CV signé
  const [openingCv, setOpeningCv] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  // État archivage
  const [togglingArchive, setTogglingArchive] = useState(false);

  // Modal Note
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteTag, setNoteTag] = useState<"INTERNAL" | "CLIENT_FEEDBACK">("INTERNAL");
  const [submittingNote, setSubmittingNote] = useState(false);

  // Modal Document
  const [showDocModal, setShowDocModal] = useState(false);
  const [docLabel, setDocLabel] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // 1. Consulter le CV via URL signée temporaire (R4)
  async function handleViewCv() {
    if (!hasCv) return;
    setOpeningCv(true);
    setCvError(null);

    try {
      const res = await fetch(`/api/documents/${candidateId}/url`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Impossible d'accéder au document sécurisé.");
      }

      // Ouvrir l'URL signée dans un nouvel onglet
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setCvError(err instanceof Error ? err.message : "Erreur lors de l'accès au CV");
    } finally {
      setOpeningCv(false);
    }
  }

  // 2. Toggle Archivage
  async function handleToggleArchive() {
    setTogglingArchive(true);
    try {
      const res = await fetch(`/api/admin/candidats/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !isArchived }),
      });

      if (!res.ok) {
        throw new Error("Échec du changement de statut d'archivage");
      }

      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'archivage du candidat.");
    } finally {
      setTogglingArchive(false);
    }
  }

  // 3. Soumission Note
  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;

    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/admin/candidats/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent.trim(),
          tag: noteTag,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de l'enregistrement de la note.");
      }

      setNoteContent("");
      setShowNoteModal(false);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmittingNote(false);
    }
  }

  // 4. Soumission Document annexe
  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docLabel.trim() || !docFile) return;

    setUploadingDoc(true);
    setDocError(null);

    try {
      // a. Obtenir la signature Cloudinary
      const sigRes = await fetch("/api/admin/cloudinary/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "document", type: "authenticated" }),
      });

      if (!sigRes.ok) {
        throw new Error("Impossible d'obtenir la signature Cloudinary.");
      }
      const sigData = await sigRes.json();

      // b. Upload direct vers Cloudinary
      const formData = new FormData();
      formData.append("file", docFile);
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
        throw new Error("Échec de l'upload du document.");
      }
      const uploadData = await uploadRes.json();

      // c. Enregistrer en base
      const createRes = await fetch(`/api/admin/candidats/${candidateId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: docLabel.trim(),
          publicId: uploadData.public_id,
          resourceType: "raw",
          mimeType: docFile.type || "application/octet-stream",
          sizeBytes: uploadData.bytes || docFile.size,
        }),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json();
        throw new Error(errJson.error || "Erreur d'enregistrement.");
      }

      setDocLabel("");
      setDocFile(null);
      setShowDocModal(false);
      router.refresh();
    } catch (err: unknown) {
      setDocError(err instanceof Error ? err.message : "Erreur lors de l'upload.");
    } finally {
      setUploadingDoc(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Bouton Voir le CV */}
        {hasCv ? (
          <Button
            variant="default"
            size="sm"
            onClick={handleViewCv}
            disabled={openingCv}
            className="flex items-center gap-2"
          >
            {openingCv ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Consulter le CV (Signé)
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled className="text-muted-foreground">
            <FileText className="h-4 w-4 mr-2" />
            Aucun CV attaché
          </Button>
        )}

        {/* Bouton Ajouter une note */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNoteModal(true)}
          className="flex items-center gap-2"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Ajouter une note
        </Button>

        {/* Bouton Ajouter un document */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDocModal(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Ajouter un document
        </Button>

        {/* Bouton Modifier */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/candidats/${candidateId}/edit`} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Modifier
          </Link>
        </Button>

        {/* Bouton Archiver / Restaurer */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleArchive}
          disabled={togglingArchive}
          className={
            isArchived
              ? "text-emerald-600 hover:bg-emerald-50"
              : "text-amber-600 hover:bg-amber-50"
          }
        >
          {togglingArchive ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isArchived ? (
            <>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Restaurer
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 mr-1.5" />
              Archiver
            </>
          )}
        </Button>
      </div>

      {cvError && (
        <p className="text-xs text-destructive mt-1">
          {cvError}
        </p>
      )}

      {/* Modal Ajout Note */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquarePlus className="h-5 w-5 text-primary" />
                Ajouter une note de suivi
              </h3>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="noteTag">Type de note</Label>
                <select
                  id="noteTag"
                  value={noteTag}
                  onChange={(e) => setNoteTag(e.target.value as "INTERNAL" | "CLIENT_FEEDBACK")}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="INTERNAL">Note interne (Consultants uniquement)</option>
                  <option value="CLIENT_FEEDBACK">Retour client</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="noteContent">Contenu de la note</Label>
                <textarea
                  id="noteContent"
                  rows={4}
                  placeholder="Ex: Candidat très dynamique lors de l'échange téléphonique. Prétentions salariales alignées..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full p-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNoteModal(false)}
                  disabled={submittingNote}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={submittingNote}>
                  {submittingNote ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    "Enregistrer la note"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajout Document Annexe */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                Ajouter un document privé
              </h3>
              <button
                onClick={() => setShowDocModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {docError && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {docError}
              </div>
            )}

            <form onSubmit={handleAddDocument} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="docLabel">Libellé du document *</Label>
                <Input
                  id="docLabel"
                  placeholder="Ex: Diplôme d'ingénieur, Certification AWS, Lettre..."
                  value={docLabel}
                  onChange={(e) => setDocLabel(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="docFileInput">Fichier (PDF, image, doc) *</Label>
                <Input
                  id="docFileInput"
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Stocké de façon sécurisée en mode Cloudinary authenticated (R4).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDocModal(false)}
                  disabled={uploadingDoc}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={uploadingDoc || !docFile || !docLabel.trim()}>
                  {uploadingDoc ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi sécurisé...
                    </>
                  ) : (
                    "Uploader le document"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
