/**
 * Idempotency.
 *
 * This is what makes the offline queue safe. A technician's phone can retry a
 * completion three times over flaky basement Wi-Fi and still produce exactly one
 * service record: the first request stores its response against the key, and
 * replays return that stored response rather than doing the work again.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}

export type IdempotentOutcome<T> =
  | { replayed: true; status: number; body: T }
  | { replayed: false; status: number; body: T };

export class IdempotencyConflict extends Error {
  constructor() {
    super("This idempotency key was already used with a different request body");
    this.name = "IdempotencyConflict";
  }
}

/**
 * Run `work` at most once for a given (actor, key).
 *
 * The unique constraint on (actorId, key) is the concurrency guard: two
 * simultaneous requests race to insert, the loser reads the winner's result.
 */
export async function withIdempotency<T>(
  params: { actorId: string; key: string | null; endpoint: string; body: unknown },
  work: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentOutcome<T>> {
  if (!params.key) {
    const result = await work();
    return { replayed: false, ...result };
  }

  const requestHash = hashRequest(params.body);
  const existing = await prisma.idempotencyKey.findUnique({
    where: { actorId_key: { actorId: params.actorId, key: params.key } },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) throw new IdempotencyConflict();
    if (existing.completedAt) {
      return { replayed: true, status: existing.statusCode, body: existing.responseBody as T };
    }
    // An in-flight duplicate: tell the client to retry rather than double-write.
    return { replayed: true, status: 409, body: { error: "Request already in progress" } as T };
  }

  try {
    await prisma.idempotencyKey.create({
      data: { actorId: params.actorId, key: params.key, endpoint: params.endpoint, requestHash },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Lost the race; the winner is doing the work.
      return { replayed: true, status: 409, body: { error: "Request already in progress" } as T };
    }
    throw error;
  }

  const result = await work();

  await prisma.idempotencyKey.update({
    where: { actorId_key: { actorId: params.actorId, key: params.key } },
    data: {
      responseBody: result.body as Prisma.InputJsonValue,
      statusCode: result.status,
      completedAt: new Date(),
    },
  });

  return { replayed: false, ...result };
}
