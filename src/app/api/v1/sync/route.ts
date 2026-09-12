import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireActor, assertCapability } from "@/lib/auth/session";
import { completeServiceSchema, reportIssueSchema } from "@/lib/api/validation";
import { completeService, notifyServiceCompleted, ProofIncompleteError } from "@/lib/maintenance/completion";
import { withIdempotency } from "@/lib/sync/idempotency";
import { ISSUE_CATEGORY_LABELS } from "@/lib/api/validation";
import { recordAudit } from "@/lib/audit/log";
import { ok, route } from "@/lib/api/respond";

/**
 * Offline replay.
 *
 * The field app queues events locally when the restaurant Wi-Fi gives out and
 * posts the whole batch when it comes back. Each event carries a client-generated
 * id used as its idempotency key, so replaying a batch that was half-applied
 * before the connection dropped is safe: already-applied events come back as
 * duplicates rather than being written twice.
 */
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SERVICE_COMPLETED"), clientEventId: z.string().min(1), payload: completeServiceSchema }),
  z.object({ type: z.literal("ISSUE_REPORTED"), clientEventId: z.string().min(1), payload: reportIssueSchema }),
]);

const schema = z.object({
  clientId: z.string().min(1),
  events: z.array(eventSchema).max(100),
});

export const POST = route(async (request: NextRequest) => {
  const actor = await requireActor();
  const input = schema.parse(await request.json());

  const results: { clientEventId: string; status: "applied" | "duplicate" | "failed"; id?: string; error?: string }[] = [];
  let applied = 0, duplicates = 0, failed = 0;

  for (const event of input.events) {
    try {
      if (event.type === "SERVICE_COMPLETED") {
        assertCapability(actor, "service.complete");
        const outcome = await withIdempotency(
          { actorId: actor.userId, key: event.clientEventId, endpoint: "sync:SERVICE_COMPLETED", body: event.payload },
          async () => {
            const record = await completeService(
              { ...event.payload, performedAt: new Date(event.payload.performedAt) },
              actor,
            );
            return { status: 201, body: { id: record.id } };
          },
        );
        const id = (outcome.body as { id?: string }).id;
        if (outcome.replayed) { duplicates++; results.push({ clientEventId: event.clientEventId, status: "duplicate", id }); }
        else {
          applied++;
          if (id) await notifyServiceCompleted(id);
          results.push({ clientEventId: event.clientEventId, status: "applied", id });
        }
      } else {
        assertCapability(actor, "issue.create");
        const outcome = await withIdempotency(
          { actorId: actor.userId, key: event.clientEventId, endpoint: "sync:ISSUE_REPORTED", body: event.payload },
          async () => {
            const equipment = await prisma.equipment.findUniqueOrThrow({ where: { id: event.payload.equipmentId } });
            const issue = await prisma.issue.create({
              data: {
                organizationId: equipment.organizationId,
                locationId: equipment.locationId,
                equipmentId: equipment.id,
                source: actor.internal ? "TECHNICIAN" : "CUSTOMER",
                category: event.payload.category,
                severity: event.payload.severity,
                title: `${ISSUE_CATEGORY_LABELS[event.payload.category] ?? event.payload.category} — ${equipment.name}`,
                description: event.payload.description ?? null,
                reportedById: actor.userId,
                events: { create: { actorId: actor.userId, type: "CREATED" } },
              },
            });
            await recordAudit({
              action: "issue.created", entityType: "Issue", entityId: issue.id,
              actorId: actor.userId, organizationId: equipment.organizationId,
            });
            return { status: 201, body: { id: issue.id } };
          },
        );
        const id = (outcome.body as { id?: string }).id;
        if (outcome.replayed) { duplicates++; results.push({ clientEventId: event.clientEventId, status: "duplicate", id }); }
        else { applied++; results.push({ clientEventId: event.clientEventId, status: "applied", id }); }
      }
    } catch (error) {
      failed++;
      const message = error instanceof ProofIncompleteError
        ? `Incomplete proof: ${error.missing.join(", ")}`
        : error instanceof Error ? error.message : "Unknown error";
      results.push({ clientEventId: event.clientEventId, status: "failed", error: message });
    }
  }

  await prisma.syncBatch.create({
    data: {
      actorId: actor.userId, clientId: input.clientId, eventCount: input.events.length,
      appliedCount: applied, duplicateCount: duplicates, failedCount: failed,
      detail: { results },
    },
  });

  return ok({ applied, duplicates, failed, results });
});
