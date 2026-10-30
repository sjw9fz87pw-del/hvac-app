"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";

export interface UnitDetails {
  name: string;
  areaId: string | null;
  equipmentType: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  technicianNotes: string | null;
}

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 44,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12.5, fontWeight: 620, color: "var(--ink-soft)", marginBottom: 5,
};

/**
 * The unit's details, and correcting them in place.
 *
 * Make, model and serial were only ever settable when a unit was created,
 * which is before anyone has looked at the plate on the back. They show as
 * "Not recorded" until someone fills them in, so a gap is visible rather than
 * silently missing.
 */
export function EditDetails({ equipmentId, details, areas, extra, canEdit }: {
  equipmentId: string;
  details: UnitDetails;
  areas: { id: string; name: string }[];
  /** Read-only lines shown under the editable ones (criticality, filter, warranty). */
  extra: { label: string; value: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(details);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What was just saved, shown at once; the page's own refresh replaces it.
  const [saved, setSaved] = useState<UnitDetails | null>(null);
  const fresh = JSON.stringify(details);
  useEffect(() => { setSaved(null); }, [fresh]);
  const shown = saved ?? details;

  const set = (key: keyof UnitDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [key]: key === "areaId" ? (e.target.value || null) : e.target.value }));

  async function save() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/v1/equipment/${equipmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).error ?? "That did not save");
      return;
    }
    setSaved({ ...draft, areaId: draft.areaId || null });
    setEditing(false);
    router.refresh();
  }

  const area = areas.find((a) => a.id === shown.areaId)?.name ?? "No area";

  if (!editing) {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontWeight: 640 }}>Details</div>
          {canEdit ? (
            <button type="button" className="text-button" onClick={() => { setDraft(shown); setEditing(true); }}>Edit</button>
          ) : null}
        </div>
        <Line label="Type" value={shown.equipmentType} />
        <Line label="Area" value={area} />
        <Line label="Make" value={shown.manufacturer || null} />
        <Line label="Model" value={shown.model || null} />
        <Line label="Serial" value={shown.serialNumber || null} />
        {extra.map((line) => <Line key={line.label} label={line.label} value={line.value} />)}
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontWeight: 640, marginBottom: 12 }}>Edit details</div>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={labelStyle} htmlFor="unit-name">Name</label>
          <input id="unit-name" value={draft.name} onChange={set("name")} style={field} maxLength={80} />
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={labelStyle} htmlFor="unit-type">Type</label>
            <input id="unit-type" value={draft.equipmentType} onChange={set("equipmentType")} style={field} maxLength={60} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="unit-area">Area</label>
            <select id="unit-area" value={draft.areaId ?? ""} onChange={set("areaId")} style={field}>
              <option value="">No area</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={labelStyle} htmlFor="unit-make">Make</label>
            <input id="unit-make" value={draft.manufacturer ?? ""} onChange={set("manufacturer")} style={field} maxLength={80} placeholder="e.g. True" />
          </div>
          <div>
            <label style={labelStyle} htmlFor="unit-model">Model</label>
            <input id="unit-model" value={draft.model ?? ""} onChange={set("model")} style={field} maxLength={80} />
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-serial">Serial number</label>
          <input id="unit-serial" value={draft.serialNumber ?? ""} onChange={set("serialNumber")} style={field} maxLength={80} autoCapitalize="characters" />
        </div>
        <div>
          <label style={labelStyle} htmlFor="unit-notes">Internal notes <span style={{ fontWeight: 500, color: "var(--ink-faint)" }}>· only your team sees these</span></label>
          <textarea id="unit-notes" value={draft.technicianNotes ?? ""} onChange={set("technicianNotes")} rows={3} maxLength={2000}
            style={{ ...field, minHeight: 80, resize: "vertical" }} />
        </div>
      </div>

      {error ? <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <div style={{ flex: 1 }}><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
        <div style={{ flex: 1 }}><Button variant="secondary" onClick={() => { setEditing(false); setError(null); }} disabled={busy}>Cancel</Button></div>
      </div>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", fontSize: 14.5, borderTop: "1px solid var(--line)" }}>
      <div style={{ color: "var(--ink-faint)", width: 92, flexShrink: 0 }}>{label}</div>
      <div style={{ fontWeight: value ? 560 : 400, color: value ? "var(--ink)" : "var(--ink-faint)", minWidth: 0, overflowWrap: "anywhere" }}>
        {value ?? "Not recorded"}
      </div>
    </div>
  );
}
