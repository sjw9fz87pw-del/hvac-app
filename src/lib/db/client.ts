import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./connection";

/**
 * A single client across hot reloads in development; Next would otherwise open a
 * new pool on every module reload and exhaust Postgres connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The datasource override is applied only when a URL actually resolves.
 *
 * Passing `{ url: undefined }` makes the Prisma constructor throw, and the
 * constructor runs at module load - which means it runs during `next build`
 * while collecting page data, where no database URL exists. Omitting the
 * override lets Prisma fall back to the schema's `env("DATABASE_URL")` and defer
 * any failure to an actual query, which is the correct time to fail.
 */
const databaseUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Resolved rather than read straight from the environment, so the same code
    // works locally and against Netlify's per-branch provisioned database.
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
