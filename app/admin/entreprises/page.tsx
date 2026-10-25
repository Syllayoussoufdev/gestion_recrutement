"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  Plus,
  Search,
  ExternalLink,
  Edit,
  Archive,
  ArchiveRestore,
  Briefcase,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CompanyListItem {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  siret: string | null;
  website: string | null;
  logoUrl: string | null;
  archived: boolean;
  createdAt: string;
  activeOffersCount: number;
  _count: {
    offers: number;
    contacts: number;
  };
}

export default function AdminEntreprisesPage() {
  const [data, setData] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [, startTransition] = useTransition();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        search: debouncedSearch,
        archived: showArchived ? "true" : "false",
      });
      const res = await fetch(`/api/admin/entreprises?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setTotalPages(json.pages);
        setTotalItems(json.total);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [page, debouncedSearch, showArchived]);

  async function toggleArchive(company: CompanyListItem) {
    const willArchive = !company.archived;
    if (
      !confirm(
        willArchive
          ? `Voulez-vous archiver l'entreprise "${company.name}" ?`
          : `Voulez-vous restaurer l'entreprise "${company.name}" ?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/entreprises/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: willArchive }),
      });
      if (res.ok) {
        startTransition(() => {
          loadData();
        });
      } else {
        alert("Impossible de modifier le statut de l'entreprise.");
      }
    } catch {
      alert("Erreur réseau.");
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Entreprises clientes
          </h1>
          <p className="text-sm text-slate-500">
            {totalItems} entreprise{totalItems > 1 ? "s" : ""}{" "}
            {showArchived ? "archivée(s)" : "active(s)"} dans votre cabinet
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/entreprises/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>Nouvelle entreprise</span>
          </Link>
        </Button>
      </div>

      {/* Barre de filtres & recherche */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par nom, secteur, ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span>Afficher les archivées</span>
          </label>
        </div>
      </div>

      {/* Tableau des entreprises */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Logo</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Secteur</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead className="text-center">Offres actives</TableHead>
              <TableHead className="text-center">Contacts</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  Chargement des entreprises...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  Aucune entreprise trouvée.
                </TableCell>
              </TableRow>
            ) : (
              data.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    {company.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={company.logoUrl}
                        alt={company.name}
                        className="h-9 w-9 rounded-md border border-slate-100 object-contain p-0.5"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                        <Building2 className="h-4 w-4" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/entreprises/${company.id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {company.name}
                    </Link>
                    {company.archived && (
                      <Badge variant="destructive" className="ml-2 text-[10px]">
                        Archivée
                      </Badge>
                    )}
                    {company.siret && (
                      <p className="text-xs text-slate-400">SIRET: {company.siret}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {company.sector || "—"}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {company.city || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                      <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                      {company.activeOffersCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-slate-600">
                    {company._count.contacts}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title="Voir la fiche"
                      >
                        <Link href={`/admin/entreprises/${company.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title="Modifier"
                      >
                        <Link href={`/admin/entreprises/${company.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleArchive(company)}
                        title={company.archived ? "Restaurer" : "Archiver"}
                      >
                        {company.archived ? (
                          <ArchiveRestore className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Archive className="h-4 w-4 text-slate-500 hover:text-red-600" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} sur {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Suivant
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
