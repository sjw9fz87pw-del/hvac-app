/**
 * Local development seed.
 *
 * Installs the same dataset a deployed environment gets, so what you click
 * through locally matches production in shape. Uses a well-known development
 * password on purpose, and refuses to run against a deployed database — there
 * the guarded bootstrap endpoint generates a strong one instead.
 */
import { PrismaClient } from "@prisma/client";
import { installInitialData } from "../src/lib/setup/initial-data";

const DEV_PASSWORD = "password123";
const DEV_OWNER = "panteli@bruphilly.com";

async function main() {
  const prisma = new PrismaClient();
  try {
    if (process.env.NETLIFY || process.env.NODE_ENV === "production") {
      throw new Error(
        "Refusing to seed a production environment with the development password. " +
        "Use the guarded bootstrap endpoint instead.",
      );
    }
    const result = await installInitialData(prisma, DEV_PASSWORD, {
      ownerEmail: DEV_OWNER,
      ownerName: "Owner",
      // Local only, and guarded by the production check above: re-seeding a
      // development database is the entire point of this script.
      allowWipe: true,
    });
    console.log(`\nInstalled: ${JSON.stringify(result.counts)}`);
    console.log(`Sign in as ${result.ownerEmail} (password: ${DEV_PASSWORD})\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
