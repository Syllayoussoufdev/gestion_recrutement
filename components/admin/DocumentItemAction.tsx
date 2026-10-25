"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentItemActionProps {
  documentId: string;
  label: string;
}

export default function DocumentItemAction({ documentId, label }: DocumentItemActionProps) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleOpen() {
    setOpening(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/url`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur d'accès");
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setOpening(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le document "${label}" ?`)) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur de suppression");
      }

      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        disabled={opening || deleting}
        className="flex items-center gap-1.5"
      >
        {opening ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5" />
        )}
        Consulter
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDelete}
        disabled={opening || deleting}
        className="text-destructive hover:bg-destructive/10"
        title="Supprimer le document"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
