/**
 * Uniform API responses and error translation.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { TagOperationError } from "@/lib/nfc/service";
import { IdempotencyConflict } from "@/lib/sync/idempotency";

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(status: number, error: string, detail?: unknown) {
  return NextResponse.json({ error, ...(detail !== undefined ? { detail } : {}) }, { status });
}

/**
 * Translates thrown errors into responses. Out-of-scope tenant access surfaces
 * as 404 by construction (AuthError carries the status), never as a 403 that
 * would confirm the resource exists.
 */
export function handleError(error: unknown) {
  if (error instanceof AuthError) return fail(error.status, error.message);
  if (error instanceof ZodError) {
    return fail(422, "Validation failed", error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  if (error instanceof IdempotencyConflict) return fail(409, error.message);
  if (error instanceof TagOperationError) return fail(400, error.message, { code: error.code });
  console.error("[api] unhandled error", error);
  return fail(500, "Something went wrong");
}

/** Wraps a route handler so every path gets consistent error translation. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleError(error);
    }
  };
}
