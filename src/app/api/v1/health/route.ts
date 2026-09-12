import { prisma } from "@/lib/db/client";
import { ok, route } from "@/lib/api/respond";

/**
 * Readiness check.
 *
 * Reports whether the database is reachable and whether each required piece of
 * configuration is present — as booleans only. No value, no prefix, no length
 * of any secret is ever returned, so this is safe to leave unauthenticated: it
 * tells an operator what is missing without telling anyone else what it is.
 *
 * This exists because "the app is deployed" and "the app is configured" are
 * different questions, and the second one is otherwise invisible until a
 * technician is standing in a walk-in wondering why a tag will not resolve.
 */
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  let database: "ok" | "unreachable" = "unreachable";
  let schema = false;
  try {
    // Cheap query that also proves the schema exists, not just the connection.
    await prisma.serviceCompany.count();
    database = "ok";
    schema = true;
  } catch {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "ok"; // connected, but migrations have not run
    } catch {
      database = "unreachable";
    }
  }

  const tagSecret = process.env.NFC_TAG_SECRET;
  const configured = {
    // A too-short secret is as good as missing, so check usability not presence.
    nfcTagSecret: Boolean(tagSecret && tagSecret.length >= 32),
    jobToken: Boolean(process.env.JOB_TOKEN),
    // Not secret, so the resolved value is useful to see: a wrong base URL
    // silently bakes the wrong address into every tag written.
    appBaseUrl: process.env.APP_BASE_URL ?? process.env.URL ?? null,
    databaseUrlSource: process.env.DATABASE_URL
      ? "DATABASE_URL"
      : process.env.NETLIFY_DATABASE_URL
        ? "NETLIFY_DATABASE_URL"
        : "resolved at runtime",
  };

  const seeded = schema ? (await prisma.serviceCompany.count()) > 0 : false;

  const ready = database === "ok" && schema && configured.nfcTagSecret && configured.jobToken;

  return ok({
    ready,
    database,
    schema,
    seeded,
    configured,
    missing: [
      ...(configured.nfcTagSecret ? [] : ["NFC_TAG_SECRET"]),
      ...(configured.jobToken ? [] : ["JOB_TOKEN"]),
      ...(schema ? [] : ["database migrations"]),
    ],
  });
});
