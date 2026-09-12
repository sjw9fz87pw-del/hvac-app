import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./connection";

/**
 * A single client across hot reloads in development; Next would otherwise open a
 * new pool on every module reload and exhaust Postgres connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Resolved rather than read straight from the environment, so the same code
    // works locally and against Netlify's per-branch provisioned database.
    datasources: { db: { url: resolveDatabaseUrl() } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
