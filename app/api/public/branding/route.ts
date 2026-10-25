import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agencySlug = url.searchParams.get("agency")?.trim();

  try {
    if (agencySlug) {
      const agency = await prisma.agency.findUnique({
        where: { slug: agencySlug },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          brandKey: true,
          senderName: true,
        },
      });

      if (agency) {
        return NextResponse.json(agency);
      }
    }

    // Si aucun slug fourni ou non trouvé, renvoyer la liste des cabinets actifs pour le sélecteur
    const agencies = await prisma.agency.findMany({
      where: { status: { in: ["PILOT", "ACTIVE"] } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        brandKey: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ agencies });
  } catch (error) {
    console.error("Erreur lecture branding:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
