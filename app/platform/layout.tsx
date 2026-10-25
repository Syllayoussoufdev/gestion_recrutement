import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import PlatformHeader from "@/components/platform/PlatformHeader";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "PLATFORM_ADMIN") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PlatformHeader userFirstName={session.firstName} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
