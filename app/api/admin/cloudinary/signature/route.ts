import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { generateUploadSignature } from "@/lib/cloudinary";

const signatureSchema = z.object({
  folder: z.string().optional(),
  publicId: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = await requireRole(request, ["AGENCY_ADMIN", "CONSULTANT"]);
  if (!auth.ok) {
    return auth.response;
  }

  const { session } = auth;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Body optionnel
  }

  const parsed = signatureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const agencySlug = session.agencySlug || session.agencyId || "default";
  const defaultFolder = `stratos/${agencySlug}/logos`;
  const folder = parsed.data.folder || defaultFolder;

  try {
    const signatureData = generateUploadSignature({
      folder,
      publicId: parsed.data.publicId,
    });
    return NextResponse.json(signatureData, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur de configuration Cloudinary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
