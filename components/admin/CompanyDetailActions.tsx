"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Edit, Archive, ArchiveRestore, Plus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompanyDetailActionsProps {
  companyId: string;
  companyName: string;
  archived: boolean;
}

export default function CompanyDetailActions({
  companyId,
  companyName,
  archived,
}: CompanyDetailActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleToggleArchive() {
    const willArchive = !archived;
    if (
      !confirm(
        willArchive
          ? `Voulez-vous archiver l'entreprise "${companyName}" ?`
          : `Voulez-vous restaurer l'entreprise "${companyName}" ?`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/entreprises/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: willArchive }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Erreur lors de la modification du statut.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" asChild size="sm">
        <Link href={`/admin/offres/new?companyId=${companyId}`}>
          <Plus className="h-4 w-4 mr-1.5" />
          <span>Créer une offre</span>
        </Link>
      </Button>
      <Button variant="outline" asChild size="sm">
        <Link href={`/admin/entreprises/${companyId}/edit`}>
          <Edit className="h-4 w-4 mr-1.5" />
          <span>Modifier</span>
        </Link>
      </Button>
      <Button
        variant={archived ? "default" : "outline"}
        size="sm"
        onClick={handleToggleArchive}
        disabled={loading}
      >
        {archived ? (
          <>
            <ArchiveRestore className="h-4 w-4 mr-1.5" />
            <span>Restaurer</span>
          </>
        ) : (
          <>
            <Archive className="h-4 w-4 mr-1.5 text-red-600" />
            <span className="text-red-600">Archiver</span>
          </>
        )}
      </Button>
    </div>
  );
}
