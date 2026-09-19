"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui/primitives";

export interface Requirements {
  requiresNfcVerification: boolean;
  requiresBeforePhoto: boolean;
  requiresAfterPhoto: boolean;
  requiresChecklist: boolean;
  requiresTechnicianNote: boolean;
}

const GATES: { key: keyof Requirements; label: string; hint: string }[] = [
  { key: "requiresNfcVerification", label: "Tag scan", hint: "Proves the technician stood at the unit" },
  { key: "requiresBeforePhoto", label: "Before photo", hint: "" },
  { key: "requiresAfterPhoto", label: "After photo", hint: "" },
  { key: "requiresChecklist", label: "Checklist", hint: "" },
  { key: "requiresTechnicianNote", label: "Written note", hint: "" },
];

/**
 * Proof gates, editable. Turning one off is a real decision — it is what a
 * completed service record will and will not be able to evidence afterwards —
 * so the consequence is spelled out rather than left to a bare toggle.
 */
export function RequirementsEditor({ serviceTypeId, initial }: {
  serviceTypeId: string;
  initial: Requirements;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: keyof Requirements) {
    const next = { ...value, [key]: !value[key] };
    setValue(next);
    setBusy(key);
    setError(null);

    const response = await fetch(`/api/v1/service-types/${serviceTypeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: next[key] }),
    });

    setBusy(null);
    if (!response.ok) {
      setValue(value); // put it back — the server is the source of truth
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not save");
      return;
    }
    router.refresh();
  }

  const required = GATES.filter((g) => value[g.key]);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        {GATES.map((gate) => {
          const on = value[gate.key];
          return (
            <button
              key={gate.key} type="button" onClick={() => toggle(gate.key)}
              disabled={busy !== null} aria-pressed={on}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 12px", borderRadius: 11, cursor: busy ? "wait" : "pointer",
                textAlign: "left", background: "var(--surface-2)",
                border: `1px solid ${on ? "var(--accent-line, var(--accent))" : "var(--line)"}`,
                opacity: busy === gate.key ? 0.55 : 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 34, height: 20, borderRadius: 999, flexShrink: 0, position: "relative",
                  background: on ? "var(--accent)" : "var(--line)", transition: "background 140ms ease",
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16,
                  borderRadius: 999, background: "#fff", transition: "left 140ms ease",
                }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 620 }}>{gate.label}</span>
                {gate.hint ? (
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-faint)" }}>{gate.hint}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {required.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 10, lineHeight: 1.5 }}>
          Nothing is required. A completed record will carry the technician, the unit and
          the time — no evidence of the work itself.
        </p>
      ) : null}

      {error ? (
        <p style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }} role="alert">{error}</p>
      ) : null}
    </div>
  );
}

export function RequirementPills({ value }: { value: Requirements }) {
  const on = GATES.filter((g) => value[g.key]);
  if (on.length === 0) return <Pill tone="warn">No proof required</Pill>;
  return <>{on.map((g) => <Pill key={g.key} tone="info">{g.label}</Pill>)}</>;
}
