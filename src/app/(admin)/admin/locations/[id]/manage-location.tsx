"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Pill, SectionTitle } from "@/components/ui/primitives";

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

export function ManageLocation({ id, name, active, equipment }: {
  id: string; name: string; active: boolean; equipment: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    const response = await fetch(`/api/v1/locations/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "That did not work");
      return;
    }
    setRenaming(false);
    setConfirmArchive(false);
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const response = await fetch(`/api/v1/locations/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setConfirmDelete(false);
      setError(body.error ?? "Could not delete this restaurant");
      return;
    }
    router.push("/admin/locations");
    router.refresh();
  }

  return (
    <>
      <SectionTitle>Manage this restaurant</SectionTitle>

      {error ? (
        <p style={{ color: "var(--warn)", fontSize: 14, marginBottom: 12, lineHeight: 1.55 }} role="alert">{error}</p>
      ) : null}

      <Card>
        {!renaming ? (
          <Button variant="secondary" disabled={busy !== null} onClick={() => setRenaming(true)}>Rename</Button>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <input style={field} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <Button disabled={busy !== null || !newName.trim()} onClick={() => act("rename", { name: newName.trim() })}>
              {busy === "rename" ? "Saving…" : "Save name"}
            </Button>
            <Button variant="secondary" onClick={() => { setRenaming(false); setNewName(name); }}>Cancel</Button>
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        {active ? (
          <>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6 }}>
              Archiving takes it out of the restaurants list and stops it being scheduled.
              Everything recorded here is kept, and you can bring it back any time.
            </p>
            {!confirmArchive ? (
              <div style={{ marginTop: 14 }}>
                <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmArchive(true)}>Archive</Button>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 620 }}>Archive {name}?</p>
                <Button disabled={busy !== null} onClick={() => act("archive")}>
                  {busy === "archive" ? "Archiving…" : "Yes, archive"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmArchive(false)}>Cancel</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <Pill tone="warn">Archived</Pill>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.6 }}>
              Hidden from the restaurants list and not being scheduled.
            </p>
            <div style={{ marginTop: 14 }}>
              <Button disabled={busy !== null} onClick={() => act("restore")}>
                {busy === "restore" ? "Restoring…" : "Restore"}
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6 }}>
          Or delete it entirely. Only possible while nothing has been recorded here — once
          a unit has been serviced, the record names this restaurant and it stays.
          {equipment > 0 ? ` Its ${equipment} unit${equipment === 1 ? "" : "s"} would go too.` : ""}
        </p>
        {!confirmDelete ? (
          <div style={{ marginTop: 14 }}>
            <Button variant="secondary" disabled={busy !== null} onClick={() => { setError(null); setConfirmDelete(true); }}>
              Delete permanently
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 620 }}>
              Delete {name}{equipment > 0 ? ` and its ${equipment} unit${equipment === 1 ? "" : "s"}` : ""}? This cannot be undone.
            </p>
            <Button disabled={busy !== null} onClick={remove}>
              {busy === "delete" ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        )}
      </Card>
    </>
  );
}
