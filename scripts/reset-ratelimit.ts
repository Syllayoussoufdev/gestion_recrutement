import { prisma } from "../lib/prisma";

// Dev uniquement : remet à zéro les compteurs de limitation de débit.
async function main() {
  const { count } = await prisma.rateLimit.deleteMany({});
  console.log(`RateLimit réinitialisé (${count} entrée(s) supprimée(s)).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
