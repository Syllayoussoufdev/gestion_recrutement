"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Search,
  ExternalLink,
  Edit,
  FileText,
  Calendar,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Archive,
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

interface CandidateItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  currentTitle: string | null;
  skills: string[];
  availableFrom: string | null;
  source: string;
  cvPublicId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    applications: number;
    documents: number;
  };
}

export default function AdminCandidatsPage() {
  const [data, setData] = useState<CandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [archivedFilter, setArchivedFilter] = useState(false);
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

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        search: debouncedSearch,
        archived: archivedFilter ? "true" : "false",
      });

      const res = await fetch(`/api/admin/candidats?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.items || []);
        setTotalPages(json.totalPages || 1);
        setTotalItems(json.total || 0);
      }
    } catch (err) {
      console.error("Erreur chargement candidats:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [debouncedSearch, archivedFilter, page]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Vivier de Candidats
          </h1>
          <p className="text-sm text-slate-600">
            Gestion du vivier candidat, CVthèque sécurisée et suivi des compétences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/api/admin/candidats/export" download className="flex items-center gap-1.5">
              <span>📊</span>
              <span>Exporter CSV</span>
            </a>
          </Button>
          <Button asChild className="shrink-0">
            <Link href="/admin/candidats/new">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau candidat
            </Link>
          </Button>
        </div>
      </div>

      {/* Barre de filtres */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg border shadow-xs">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, email, titre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <Button
            variant={archivedFilter ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setArchivedFilter(!archivedFilter);
              setPage(1);
            }}
            className="flex items-center gap-2"
          >
            <Archive className="h-4 w-4" />
            {archivedFilter ? "Afficher les actifs" : "Afficher les archivés"}
          </Button>
        </div>
      </div>

      {/* Tableau des candidats */}
      <div className="bg-white rounded-lg border shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidat</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Compétences</TableHead>
              <TableHead>Disponibilité</TableHead>
              <TableHead>CV</TableHead>
              <TableHead className="text-center">Candidatures</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Chargement des candidats...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  Aucun candidat trouvé pour ces critères.
                </TableCell>
              </TableRow>
            ) : (
              data.map((candidat) => {
                return (
                  <TableRow key={candidat.id} className="hover:bg-slate-50/80">
                    <TableCell>
                      <Link
                        href={`/admin/candidats/${candidat.id}`}
                        className="font-medium text-slate-900 hover:text-primary transition-colors block"
                      >
                        {candidat.firstName} {candidat.lastName}
                      </Link>
                      <span className="text-xs text-muted-foreground block">
                        {candidat.currentTitle || "Sans titre renseigné"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">{candidat.email}</div>
                      {candidat.phone && (
                        <div className="text-xs text-muted-foreground">{candidat.phone}</div>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {candidat.skills && candidat.skills.length > 0 ? (
                          candidat.skills.slice(0, 3).map((skill) => (
                            <span
                              key={skill}
                              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">-</span>
                        )}
                        {candidat.skills && candidat.skills.length > 3 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">
                            +{candidat.skills.length - 3}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {candidat.availableFrom ? (
                        <div className="flex items-center text-xs text-slate-600">
                          <Calendar className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                          {new Date(candidat.availableFrom).toLocaleDateString("fr-FR")}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                          Immédiate
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {candidat.cvPublicId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          <FileText className="h-3 w-3" />
                          Attaché
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                        {candidat._count.applications}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" asChild title="Voir la fiche">
                          <Link href={`/admin/candidats/${candidat.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="Modifier">
                          <Link href={`/admin/candidats/${candidat.id}/edit`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50 text-sm text-slate-600">
          <div>
            Total : <span className="font-semibold">{totalItems}</span> candidat(s)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Précédent
            </Button>
            <span className="text-xs font-medium">
              Page {page} sur {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Suivant
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
