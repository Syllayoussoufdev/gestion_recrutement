"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Plus,
  Search,
  ExternalLink,
  Edit,
  Building2,
  Users,
  ChevronLeft,
  ChevronRight,
  Filter,
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
import { ContractType, OfferStatus } from "@prisma/client";

interface JobOfferItem {
  id: string;
  title: string;
  contractType: ContractType;
  location: string | null;
  status: OfferStatus;
  createdAt: string;
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  _count: {
    applications: number;
  };
}

interface CompanyFilterOption {
  id: string;
  name: string;
}

export default function AdminOffresPage() {
  const [data, setData] = useState<JobOfferItem[]>([]);
  const [companies, setCompanies] = useState<CompanyFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [companyFilter, setCompanyFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Charger la liste des entreprises pour le sélecteur de filtre
  useEffect(() => {
    async function fetchCompanies() {
      try {
        const res = await fetch("/api/admin/entreprises?limit=100");
        if (res.ok) {
          const json = await res.json();
          setCompanies(json.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch {
        // Ignorer erreur
      }
    }
    fetchCompanies();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        search: debouncedSearch,
      });

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      if (companyFilter !== "ALL") {
        params.set("companyId", companyFilter);
      }

      const res = await fetch(`/api/admin/offres?${params}`);
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
  }, [page, debouncedSearch, statusFilter, companyFilter]);

  function getStatusBadge(st: OfferStatus) {
    switch (st) {
      case "OPEN":
        return <Badge variant="success">Ouverte</Badge>;
      case "DRAFT":
        return <Badge variant="warning">Brouillon</Badge>;
      case "CLOSED":
        return <Badge variant="secondary">Clôturée</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Offres d&apos;emploi
          </h1>
          <p className="text-sm text-slate-500">
            {totalItems} offre{totalItems > 1 ? "s" : ""} gérée{totalItems > 1 ? "s" : ""} dans votre cabinet
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/offres/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>Nouvelle offre</span>
          </Link>
        </Button>
      </div>

      {/* Barre de filtres */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher par titre de poste..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Filtres :</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="OPEN">Ouvertes</option>
            <option value="DRAFT">Brouillons</option>
            <option value="CLOSED">Clôturées</option>
          </select>

          <select
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 max-w-[200px] truncate rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-900 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <option value="ALL">Toutes les entreprises</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tableau des offres */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titre du poste</TableHead>
              <TableHead>Entreprise cliente</TableHead>
              <TableHead>Contrat</TableHead>
              <TableHead>Localisation</TableHead>
              <TableHead className="text-center">Statut</TableHead>
              <TableHead className="text-center">Candidats</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  Chargement des offres...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  Aucune offre d&apos;emploi trouvée.
                </TableCell>
              </TableRow>
            ) : (
              data.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/offres/${offer.id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {offer.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/entreprises/${offer.company.id}`}
                      className="flex items-center gap-2 text-slate-700 hover:text-slate-900"
                    >
                      {offer.company.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={offer.company.logoUrl}
                          alt={offer.company.name}
                          className="h-5 w-5 rounded object-contain"
                        />
                      ) : (
                        <Building2 className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="truncate max-w-[160px]">
                        {offer.company.name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{offer.contractType}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {offer.location || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {getStatusBadge(offer.status)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      {offer._count.applications}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title="Voir la fiche"
                      >
                        <Link href={`/admin/offres/${offer.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title="Modifier"
                      >
                        <Link href={`/admin/offres/${offer.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
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
