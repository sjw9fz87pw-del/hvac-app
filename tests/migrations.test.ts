/**
 * The migrations must build exactly the schema the code expects.
 *
 * Production is never `db push`ed: Netlify applies the SQL files under
 * netlify/database/migrations, in order, and nothing else. So a change to
 * prisma/schema.prisma without a matching migration passes every other test
 * here — they run against a database built from the schema — and then fails in
 * production on the first query that touches the new column.
 *
 * This replays what production does: apply each migration to an empty
 * database, then ask Prisma whether anything is left to change. Anything left
 * means a migration is missing, and the diff printed is the SQL to put in it.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const ROOT = join(__dirname, "..");
const MIGRATIONS = join(ROOT, "netlify/database/migrations");
const PRISMA = join(ROOT, "node_modules/.bin/prisma");

const admin = new PrismaClient();
const scratchName = `migcheck_${process.pid}_${Date.now()}`;
const scratchUrl = (() => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${scratchName}`;
  url.search = "";
  return url.toString();
})();

function prisma(args: string[]) {
  return execFileSync(PRISMA, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
});

afterAll(async () => {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
  await admin.$disconnect();
});

describe("database migrations", () => {
  it("build exactly the schema the code expects", () => {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(folders.length).toBeGreaterThan(0);

    for (const folder of folders) {
      prisma(["db", "execute", "--url", scratchUrl, "--file", join(MIGRATIONS, folder, "migration.sql")]);
    }

    let missing = "";
    try {
      prisma([
        "migrate", "diff",
        "--from-url", scratchUrl,
        "--to-schema-datamodel", "prisma/schema.prisma",
        "--exit-code",
      ]);
    } catch (error) {
      // Exit code 2 means "there are differences"; print them as the SQL to add.
      missing = prisma([
        "migrate", "diff",
        "--from-url", scratchUrl,
        "--to-schema-datamodel", "prisma/schema.prisma",
        "--script",
      ]).trim() || String((error as { stderr?: string }).stderr ?? error);
    }

    expect(missing, `schema.prisma has changes no migration applies. Add a migration with:\n\n${missing}`).toBe("");
  }, 60_000);
});
