"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Briefcase,
  Users,
  ClipboardCheck,
  Calendar,
  Mail,
  Settings,
  ShieldAlert,
  LayoutDashboard,
  Menu,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface AdminSidebarProps {
  agencyName: string;
  agencyLogoUrl: string | null;
  brandKey?: string;
  userFirstName: string;
  userLastName: string;
  userRole: "AGENCY_ADMIN" | "CONSULTANT";
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/entreprises", label: "Entreprises", icon: Building2 },
  { href: "/admin/offres", label: "Offres", icon: Briefcase },
  { href: "/admin/candidats", label: "Candidats", icon: Users },
  { href: "/admin/evaluations", label: "Évaluations", icon: ClipboardCheck },
  { href: "/admin/rendez-vous", label: "Rendez-vous", icon: Calendar },
  { href: "/admin/invitations", label: "Invitations", icon: Mail },
  {
    href: "/admin/parametres",
    label: "Paramètres",
    icon: Settings,
    adminOnly: true,
  },
  {
    href: "/admin/journal",
    label: "Journal d'audit",
    icon: ShieldAlert,
    adminOnly: true,
  },
];

const BRAND_ACTIVE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
  blue: "bg-blue-600 text-white hover:bg-blue-700",
  indigo: "bg-indigo-600 text-white hover:bg-indigo-700",
  slate: "bg-slate-900 text-white hover:bg-slate-800",
};

const BRAND_BADGE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-600 text-white",
  blue: "bg-blue-600 text-white",
  indigo: "bg-indigo-600 text-white",
  slate: "bg-slate-900 text-white",
};

export default function AdminSidebar({
  agencyName,
  agencyLogoUrl,
  brandKey = "slate",
  userFirstName,
  userLastName,
  userRole,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeLinkClass = BRAND_ACTIVE_CLASSES[brandKey] || BRAND_ACTIVE_CLASSES.slate;
  const brandBadgeClass = BRAND_BADGE_CLASSES[brandKey] || BRAND_BADGE_CLASSES.slate;

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || userRole === "AGENCY_ADMIN"
  );

  function isActiveLink(href: string): boolean {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const navContent = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Navigation cabinet">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const active = isActiveLink(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? activeLinkClass
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Sidebar Desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
          {agencyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agencyLogoUrl}
              alt={agencyName}
              className="h-8 w-8 rounded-md object-contain"
            />
          ) : (
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold", brandBadgeClass)}>
              {agencyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">
              {agencyName}
            </p>
            <p className="text-xs text-slate-500">Espace Cabinet</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between p-4">
          {navContent}

          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="mb-3 flex items-center justify-between gap-2 px-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {userFirstName} {userLastName}
                </p>
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  {userRole === "AGENCY_ADMIN" ? "Admin Cabinet" : "Consultant"}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" />
              <span>{loggingOut ? "Déconnexion..." : "Déconnexion"}</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Topbar Mobile + Header Desktop */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-slate-900 lg:hidden">
            {agencyName}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-slate-600 sm:inline">
            Bonjour, <strong className="text-slate-900">{userFirstName}</strong>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        </div>
      </header>

      {/* Sheet Mobile */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-200 pb-4">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold", brandBadgeClass)}>
            {agencyName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{agencyName}</p>
            <p className="text-xs text-slate-500">{userFirstName}</p>
          </div>
        </div>
        {navContent}
      </Sheet>
    </>
  );
}
