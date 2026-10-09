import Link from "next/link";
import type { SetupStep } from "@/lib/api/setup-progress";
import { Card } from "./primitives";

/**
 * The getting-started list on the dashboard.
 *
 * One step is "next" at a time, so there is always a single obvious thing to
 * do. Finished steps fold into the count and the bar, so the card stays as
 * short as what is left — and is gone once nothing is.
 */
export function SetupGuide({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)?.key;

  return (
    <Card style={{ padding: 0, marginBottom: 18, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 680, fontSize: 15.5 }}>Get set up</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", fontWeight: 600 }}>{done} of {steps.length} done</div>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "var(--surface-2)", marginTop: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(done / steps.length) * 100}%`, background: "var(--accent)", borderRadius: 99 }} />
        </div>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((step, index) => {
          if (step.done) return null;
          const isNext = step.key === next;
          return (
            <li key={step.key}>
              <Link
                href={step.href} prefetch={false} className="tap"
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", minHeight: 56,
                  borderTop: "1px solid var(--line)",
                  background: isNext ? "var(--accent-soft)" : undefined,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 26, height: 26, borderRadius: 99, flexShrink: 0,
                    display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 750,
                    background: isNext ? "var(--accent)" : "var(--surface-2)",
                    color: isNext ? "#1a0f04" : "var(--ink-faint)",
                    border: isNext ? "1px solid transparent" : "1px solid var(--line)",
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: isNext ? 680 : 600, fontSize: 14.5 }}>{step.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-faint)", marginTop: 1 }}>{step.detail}</span>
                </span>
                <span style={{ color: isNext ? "var(--accent)" : "var(--ink-faint)", fontWeight: 650, fontSize: 13.5, flexShrink: 0 }}>
                  {isNext ? "Start ›" : "›"}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
