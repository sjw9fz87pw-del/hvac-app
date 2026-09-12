import { NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { completeServiceSchema } from "@/lib/api/validation";
import { completeService, notifyServiceCompleted, ProofIncompleteError } from "@/lib/maintenance/completion";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ok, fail, route } from "@/lib/api/respond";

/**
 * Complete a service.
 *
 * Idempotent by design: the field app may retry this three times over a bad
 * connection and still produce exactly one immutable service record.
 */
export const POST = route(async (request: NextRequest) => {
  const actor = await requireCapability("service.complete");
  const body = await request.json();
  const input = completeServiceSchema.parse(body);

  try {
    const outcome = await withIdempotency(
      { actorId: actor.userId, key: request.headers.get("idempotency-key"), endpoint: "POST /services", body },
      async () => {
        const record = await completeService({ ...input, performedAt: new Date(input.performedAt) }, actor);
        return {
          status: 201,
          body: {
            id: record.id,
            equipmentId: record.equipmentId,
            performedAt: record.performedAt.toISOString(),
            nextDueAt: record.nextDueAt?.toISOString() ?? null,
            contentHash: record.contentHash,
          },
        };
      },
    );

    if (!outcome.replayed && outcome.status === 201) {
      // After the transaction, so a notification failure cannot roll back proof of service.
      await notifyServiceCompleted((outcome.body as { id: string }).id);
    }

    return ok(outcome.body, outcome.status);
  } catch (error) {
    // An incomplete task is refused, never quietly closed.
    if (error instanceof ProofIncompleteError) {
      return fail(422, "Service proof is incomplete", { missing: error.missing });
    }
    throw error;
  }
});
