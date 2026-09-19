import { NextRequest } from "next/server";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { installInitialData } from "@/lib/setup/initial-data";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * One-shot setup for a deployed environment.
 *
 * Two things this must not do, both of which are easy to get wrong:
 *
 *   1. Put a well-known password on a public URL. It generates a strong one
 *      instead and returns it exactly once, in this response. Nothing logs it.
 *   2. Wipe real data by accident. It refuses if the database already holds a
 *      service company, unless `reset: true` is sent deliberately.
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
  const ownerEmail = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim() : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim() : undefined;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    return fail(422, "ownerEmail is required and must be an email address");
  }

  const existing = await prisma.serviceCompany.count();
  if (existing > 0 && !reset) {
    return fail(409, "Already set up", {
      hint: "Send { \"reset\": true } to wipe and reinstall. This destroys all data.",
    });
  }

  const password = generatePassword();
  const result = await installInitialData(prisma, password, { ownerEmail, ownerName });

  return ok({
    installed: result.counts,
    owner: { email: result.ownerEmail, role: "SUPER_ADMIN" },
    // Returned once. There is no way to read it back afterwards.
    password,
    warning: "This password is shown only once. Store it now, then change it from Account.",
  }, 201);
});
