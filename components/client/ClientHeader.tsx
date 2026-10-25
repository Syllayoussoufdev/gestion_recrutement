"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export interface ClientHeaderProps {
  agencyName: string;
  agencyLogoUrl: string | null;
  companyName: string;
  userFirstName: string;
}

const CLIENT_LINKS = [
  { href: "/client", label: "Tableau de bord" },
  { href: "/client/offres", label: "Mes offres" },
  { href: "/client/rendez-vous", label: "Mes rendez-vous" },
];

/**
 * Règle 9 : Aucun composant shadcn/ui dans /client (Tailwind CSS pur).
 */
export default function ClientHeader({
  agencyName,
  agencyLogoUrl,
  companyName,
  userFirstName,
}: ClientHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          {agencyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agencyLogoUrl}
              alt={agencyName}
              className="h-8 w-8 rounded-md object-contain"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
              {agencyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                {agencyName}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                Portail Entreprise
              </span>
            </div>
            <p className="text-xs text-slate-500">{companyName}</p>
          </div>
        </div>

        <nav
          className="flex items-center gap-1 sm:gap-2"
          aria-label="Navigation entreprise"
        >
          {CLIENT_LINKS.map((link) => {
            const active =
              link.href === "/client"
                ? pathname === "/client"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 md:inline">
            {userFirstName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loggingOut ? "Déconnexion..." : "Déconnexion"}
          </button>
        </div>
      </div>
    </header>
  );
}
