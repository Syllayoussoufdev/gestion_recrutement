import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  ArrowLeft,
  Kanban,
  FileText,
  Clock,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { forAgency } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import KanbanBoard from "@/components/admin/KanbanBoard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOfferPipelinePage({ params }: PageProps) {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "AGENCY_ADMIN" && session.role !== "CONSULTANT") ||
    !session.agencyId
  ) {
    redirect("/login");
  }

  const { id } = await params;
  const db = forAgency(session);

  let offer;

  try {
    offer = await db.jobOffer.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            city: true,
          },
        },
        applications: {
          orderBy: { updatedAt: "desc" },
          include: {
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                currentTitle: true,
                skills: true,
                cvPublicId: true,
                availableFrom: true,
                lastActivityAt: true,
              },
            },
            statusHistory: {
              orderBy: { changedAt: "desc" },
              take: 5,
            },
            _count: {
              select: {
                statusHistory: true,
                messages: true,
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Erreur chargement pipeline:", err);
  }

  if (!offer) {
    notFound();
  }

  // Adapter les dates en chaînes ISO pour le composant client
  const serializedOffer = {
    id: offer.id,
    title: offer.title,
    status: offer.status,
    company: offer.company,
    applications: offer.applications.map((app) => ({
      id: app.id,
      status: app.status,
      cvSharedClient: app.cvSharedClient,
      rejectionReason: app.rejectionReason,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      candidate: {
        id: app.candidate.id,
        firstName: app.candidate.firstName,
        lastName: app.candidate.lastName,
        email: app.candidate.email,
        phone: app.candidate.phone,
        currentTitle: app.candidate.currentTitle,
        skills: app.candidate.skills,
        cvPublicId: app.candidate.cvPublicId,
        availableFrom: app.candidate.availableFrom?.toISOString() || null,
        lastActivityAt: app.candidate.lastActivityAt.toISOString(),
      },
      _count: app._count,
    })),
  };

  return (
    <div className="space-y-6">
      {/* Barre de navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/offres/${offer.id}`}
            className="p-2 rounded-lg border bg-white hover:bg-slate-50 transition-colors text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Kanban className="h-6 w-6 text-primary" />
                Pipeline : {offer.title}
              </h1>
              <Badge variant="outline" className="text-xs">
                {offer.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-0.5">
              <Building2 className="h-3.5 w-3.5" />
              <span>{offer.company.name}</span>
              <span>•</span>
              <Link
                href={`/admin/offres/${offer.id}`}
                className="hover:text-primary underline flex items-center gap-0.5"
              >
                Fiche détaillée de l&apos;offre
                <ExternalLink className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/offres/${offer.id}`}>
              <FileText className="h-4 w-4 mr-1.5" />
              Voir le descriptif
            </Link>
          </Button>
        </div>
      </div>

      {/* Tableau Kanban interactif */}
      <KanbanBoard initialOffer={serializedOffer} />
    </div>
  );
}
