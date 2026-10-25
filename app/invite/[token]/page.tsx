import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";
import AcceptInviteForm from "./AcceptInviteForm";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      agency: {
        select: {
          name: true,
          status: true,
        },
      },
    },
  });

  const isInvalid =
    !invitation ||
    Boolean(invitation.usedAt) ||
    invitation.expiresAt <= new Date() ||
    invitation.agency.status === "SUSPENDED";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-xs">
        {isInvalid ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              Invitation invalide ou expirée
            </h1>
            <p className="text-sm text-slate-600">
              Ce lien d&apos;invitation n&apos;est plus valide. Veuillez contacter votre
              consultant pour recevoir une nouvelle invitation.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-6 text-center">
              <h1 className="text-xl font-bold text-slate-900">
                 Activer votre compte — {invitation.agency.name}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Compte associé à <strong>{invitation.email}</strong>
              </p>
            </div>
            <AcceptInviteForm token={token} />
          </div>
        )}
      </div>
    </main>
  );
}
