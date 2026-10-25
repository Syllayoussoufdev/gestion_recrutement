"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlatformHeaderProps {
  userFirstName: string;
}

export default function PlatformHeader({ userFirstName }: PlatformHeaderProps) {
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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/platform"
            className="flex items-center gap-2 text-base font-bold text-slate-900"
          >
            <span>Console Plateforme</span>
            <Badge variant="default">PLATFORM_ADMIN</Badge>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
            <Link href="/platform" className="hover:text-slate-900">
              Cabinets
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {userFirstName}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Déconnexion..." : "Déconnexion"}
          </Button>
        </div>
      </div>
    </header>
  );
}
