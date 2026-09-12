/**
 * `npm run db:seed` — local demo data.
 *
 * Uses a well-known development password on purpose, and refuses to run against
 * anything that looks like production. Deployed environments seed through the
 * guarded bootstrap endpoint, which generates a strong password instead.
 */
import { PrismaClient } from "@prisma/client";
import { seedDemoData } from "../src/lib/demo/seed";

const DEV_PASSWORD = "password123";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.NETLIFY) {
    throw new Error(
      "Refusing to seed a production environment with the development password. " +
      "Use POST /api/v1/jobs/bootstrap instead — it generates a strong one.",
    );
  }

  const prisma = new PrismaClient();
  console.log("Seeding…");
  try {
    const result = await seedDemoData(prisma, DEV_PASSWORD);
    console.log("Seeded:", result.counts);
    console.log(`\nSign in with any of these (password: ${DEV_PASSWORD}):`);
    for (const account of result.accounts) {
      console.log(`  ${account.email.padEnd(28)} ${account.role} — ${account.sees}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
