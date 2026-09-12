import { NextRequest } from "next/server";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { seedDemoData } from "@/lib/demo/seed";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * One-shot demo seeding for a deployed environment.
 *
 * Two things this must not do, both of which are easy to get wrong:
 *
 *   1. Put the well-known development password on a public URL. It generates a
 *      strong password instead and returns it exactly once, in this response.
 *      Nothing writes it to a log.
 *   2. Wipe real data. It refuses if the database already holds a service
 *      company, unless `reset: true` is sent deliberately.
 *
 * Authenticated by the same shared token as the nightly job — there is no user
 * behind this call, and it has to work before any user exists.
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.JOB_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get("x-job-token") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Readable enough to type on a phone, with ~62 bits of entropy. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(24);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return [chars.slice(0, 6), chars.slice(6, 12), chars.slice(12, 18)]
    .map((group) => group.join(""))
    .join("-");
}

export const POST = route(async (request: NextRequest) => {
  if (!authorized(request)) return fail(401, "Unauthorized");

  const body = await request.json().catch(() => ({}));
  const reset = body?.reset === true;

  const existing = await prisma.serviceCompany.count();
  if (existing > 0 && !reset) {
    return fail(409, "Already bootstrapped", {
      hint: "Send { \"reset\": true } to wipe and reseed. This destroys all data.",
    });
  }

  const password = generatePassword();
  const result = await seedDemoData(prisma, password);

  return ok({
    seeded: result.counts,
    // Returned once. There is no way to read it back afterwards.
    password,
    accounts: result.accounts,
    warning:
      "This password is shown only once and is shared by all five demo accounts. " +
      "Store it now. Rotate or delete the demo data before using this deployment for anything real.",
  }, 201);
});
