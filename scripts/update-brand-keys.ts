import { prisma } from "../lib/prisma";

async function main() {
  await prisma.agency.update({
    where: { slug: "cabinet-demo" },
    data: { brandKey: "emerald" },
  });
  await prisma.agency.update({
    where: { slug: "stratos-conseil" },
    data: { brandKey: "blue" },
  });
  console.log("✔ Marques blanches configurées : Cabinet Démo = emerald (vert), Stratos Conseil = blue (bleu).");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
