"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface AdminHeaderProps {
  agencyName: string;
  agencyLogoUrl: string | null;
  brandKey?: string;
  userFirstName: string;
  userLastName: string;
  userRole: "AGENCY_ADMIN" | "CONSULTANT";
  onOpenMobile: () => void;
}

const BRAND_ACCENT_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-600 text-white",
  blue: "bg-blue-600 text-white",
  indigo: "bg-indigo-600 text-white",
  slate: "bg-slate-900 text-white",
};

export default function AdminHeader({
  agencyName,
  agencyLogoUrl,
  brandKey = "slate",
  userFirstName,
  userLastName,
  userRole,
  onOpenMobile,
}: AdminHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const brandAccentClass =
    BRAND_ACCENT_CLASSES[brandKey] || BRAND_ACCENT_CLASSES.slate;

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

  const initials = `${userFirstName.charAt(0)}${userLastName.charAt(0)}`.toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
      {/* Côté Gauche : Bouton menu mobile & Contexte */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenMobile}
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu className="h-5 w-5 text-slate-700" />
        </Button>

        {/* Logo/Nom sur mobile */}
        <div className="flex items-center gap-2 lg:hidden">
          {agencyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agencyLogoUrl}
              alt={agencyName}
              className="h-7 w-7 rounded object-contain"
            />
          ) : (
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded text-xs font-bold",
                brandAccentClass
              )}
            >
              {agencyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="truncate text-sm font-semibold text-slate-900">
            {agencyName}
          </span>
        </div>

        {/* Contexte discret sur desktop */}
        <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
          <span className="font-medium text-slate-700">Plateforme Recrutement</span>
          <span>•</span>
          <span className="font-semibold text-slate-900">{agencyName}</span>
        </div>
      </div>

      {/* Côté Droit : Profil utilisateur & Déconnexion */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Badge profil utilisateur */}
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50/80 py-1 pl-1 pr-3">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-sm",
              brandAccentClass
            )}
            title={`${userFirstName} ${userLastName}`}
          >
            {initials || <User className="h-4 w-4" />}
          </div>
          <div className="hidden flex-col text-left sm:flex">
            <span className="text-xs font-semibold leading-tight text-slate-900">
              {userFirstName} {userLastName}
            </span>
            <span className="text-[10px] leading-tight text-slate-500">
              {userRole === "AGENCY_ADMIN" ? "Admin Cabinet" : "Consultant"}
            </span>
          </div>
        </div>

        {/* Bouton de déconnexion */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          title="Se déconnecter de la session"
        >
          <LogOut className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">
            {loggingOut ? "Déconnexion..." : "Déconnexion"}
          </span>
        </Button>
      </div>
    </header>
  );
}
