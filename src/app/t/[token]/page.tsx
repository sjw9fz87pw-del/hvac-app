import { redirect } from "next/navigation";
import { currentActor, requestMeta } from "@/lib/auth/session";
import { resolveTap } from "@/lib/nfc/service";
import { prisma } from "@/lib/db/client";
import { denialMessage } from "@pmops/nfc-core";
import { Card, Button } from "@/components/ui/primitives";

/**
 * Where a tapped tag or scanned QR code lands.
 *
 * Signed out, the token is preserved through sign-in so the tap resumes rather
 * than being lost. Signed in, resolution decides everything: tag state, tenant
 * binding, and whether this particular person may see this particular asset.
 * Technicians with an open task on the unit go straight to the task.
 */
export default async function TagLanding({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const actor = await currentActor();

  if (!actor) redirect(`/signin?next=${encodeURIComponent(`/t/${token}`)}`);

  const meta = await requestMeta();
  const outcome = await resolveTap(token, { actor, ...meta });

  if (!outcome.ok) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
        <Card style={{ maxWidth: 420, textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: 34 }}>🏷️</div>
          <h1 style={{ fontSize: 20, marginTop: 10 }}>Tag not available</h1>
          {/* One generic message for every denial — otherwise valid tags could be enumerated. */}
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 8 }}>
            {denialMessage(outcome.reason)}
          </p>
          <div style={{ marginTop: 20 }}><Button href="/">Go to your dashboard</Button></div>
        </Card>
      </main>
    );
  }

  if (actor.internal) {
    const openTask = await prisma.visitTask.findFirst({
      where: {
        equipmentId: outcome.equipmentId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        visit: {
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          ...(actor.roles.includes("TECHNICIAN") ? { technicianId: actor.userId } : {}),
        },
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    // Tap the tag, land on the work. That is the entire point of the tag.
    if (openTask) redirect(`/tech/task/${openTask.id}`);
  }

  redirect(`/equipment/${outcome.equipmentId}`);
}
