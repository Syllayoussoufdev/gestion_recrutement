"use client";

import { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";

export interface AdminShellProps {
  agencyName: string;
  agencyLogoUrl: string | null;
  brandKey?: string;
  userFirstName: string;
  userLastName: string;
  userRole: "AGENCY_ADMIN" | "CONSULTANT";
  children: React.ReactNode;
}

export default function AdminShell({
  agencyName,
  agencyLogoUrl,
  brandKey = "slate",
  userFirstName,
  userLastName,
  userRole,
  children,
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* 1. Barre Latérale Desktop & Mobile */}
      <AdminSidebar
        agencyName={agencyName}
        agencyLogoUrl={agencyLogoUrl}
        brandKey={brandKey}
        userFirstName={userFirstName}
        userLastName={userLastName}
        userRole={userRole}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* 2. Zone Principale : Topbar pleine largeur + Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          agencyName={agencyName}
          agencyLogoUrl={agencyLogoUrl}
          brandKey={brandKey}
          userFirstName={userFirstName}
          userLastName={userLastName}
          userRole={userRole}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
