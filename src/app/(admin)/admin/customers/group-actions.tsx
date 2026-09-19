"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";

export interface GroupRow {
  id: string; name: string; restaurants: number; people: number; isBucket: boolean;
}

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

/**
 * Rename or remove a group, from the list of groups.
 *
 * Removing is deliberately not called deleting: the restaurants inside are
 * kept and returned to the ungrouped list, because a group is an arrangement
 * of restaurants rather than a thing that owns them.
 */
export function GroupActions({ group }: { group: GroupRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/groups/${group.id}`, {
      method,
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "That did not work");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button" onClick={() => { setName(group.name); setError(null); setOpen(true); }}
        aria-label={`Manage ${group.name}`}
        style={{
          background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)",
          padding: "8px 2px 8px 10px", minHeight: 40, fontSize: 18, lineHeight: 1, flexShrink: 0,
        }}
      >
        ⋯
      </button>

      {open ? (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 95, display: "grid", placeItems: "center",
            background: "rgba(0,0,0,.55)", padding: 18,
          }}
          onClick={() => setOpen(false)}
        >
          <div style={{ width: "100%", maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <Card>
              <h2 style={{ fontSize: 19 }}>{group.name}</h2>
              <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                {group.restaurants} restaurant{group.restaurants === 1 ? "" : "s"}
                {group.people > 0 ? ` · ${group.people} ${group.people === 1 ? "person has" : "people have"} access through it` : ""}
              </p>

              <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, marginTop: 14 }} />

              {error ? (
                <p style={{ color: "var(--warn)", fontSize: 13.5, marginTop: 10, lineHeight: 1.5 }} role="alert">{error}</p>
              ) : null}

              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <Button disabled={busy || !name.trim() || name.trim() === group.name}
                        onClick={() => run("PATCH", { name: name.trim() })}>
                  {busy ? "Saving…" : "Rename group"}
                </Button>

                <Button variant="secondary" disabled={busy} onClick={() => run("DELETE")}>
                  {group.isBucket ? "Remove this empty list" : "Remove group"}
                </Button>

                <p style={{ color: "var(--ink-faint)", fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                  {group.isBucket
                    ? "This is where restaurants sit before they are grouped. It comes back on its own when something needs it."
                    : "Every restaurant in it is kept — they go back to the ungrouped list. Nothing recorded is lost."}
                </p>

                <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
