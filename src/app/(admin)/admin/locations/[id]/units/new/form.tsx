"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui/primitives";

interface UnitType {
  label: string;
  category: string;
  /** Which service type this kind of unit is normally put on. */
  serviceKey: string;
}

const UNIT_TYPES: UnitType[] = [
  { label: "Refrigerator", category: "REFRIGERATION", serviceKey: "CONDENSER_CLEANING" },
  { label: "Freezer", category: "REFRIGERATION", serviceKey: "CONDENSER_CLEANING" },
  { label: "Back Bar Cooler", category: "REFRIGERATION", serviceKey: "CONDENSER_CLEANING" },
  { label: "Prep Table", category: "REFRIGERATION", serviceKey: "CONDENSER_CLEANING" },
  { label: "Walk-In Cooler", category: "REFRIGERATION", serviceKey: "CONDENSER_CLEANING" },
  { label: "Walk-In Freezer", category: "REFRIGERATION", serviceKey: "CONDENSER_CLEANING" },
  { label: "Ice Machine", category: "ICE_MACHINE", serviceKey: "ICE_MACHINE_CLEANING" },
  { label: "HVAC Unit", category: "HVAC", serviceKey: "HVAC_FILTER" },
  { label: "Water Filtration", category: "WATER_FILTRATION", serviceKey: "WATER_FILTER" },
  { label: "Other", category: "OTHER", serviceKey: "" },
];

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 620,
  color: "var(--ink-soft)", marginBottom: 6,
};

const NEW_AREA = "__new__";

export function AddUnitsForm({ locationId, locationName, areas, serviceTypes }: {
  locationId: string;
  locationName: string;
  areas: { id: string; name: string }[];
  serviceTypes: { id: string; key: string; name: string; defaultIntervalDays: number }[];
}) {
  const router = useRouter();
  const [type, setType] = useState(UNIT_TYPES[0]);
  const [areaId, setAreaId] = useState(areas[0]?.id ?? NEW_AREA);
  const [newAreaName, setNewAreaName] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const serviceType = serviceTypes.find((s) => s.key === type.serviceKey) ?? null;

  // What the units will actually be called, so there is no surprise on save.
  const preview = (() => {
    const base = name.trim() || type.label;
    if (quantity <= 1) return base;
    return `${base} 1 … ${base} ${quantity}`;
  })();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (areaId === NEW_AREA && !newAreaName.trim()) { setError("Name the new area"); return; }
    setBusy(true);
    setError(null);
    setProgress(0);

    const base = name.trim() || type.label;

    for (let index = 0; index < quantity; index++) {
      const unitName = quantity > 1 ? `${base} ${index + 1}` : base;
      const response = await fetch("/api/v1/equipment", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          locationId,
          areaId: areaId === NEW_AREA ? null : areaId,
          newAreaName: areaId === NEW_AREA ? newAreaName.trim() : null,
          name: unitName,
          category: type.category,
          equipmentType: type.label,
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          photoBlobKeys: [],
          maintenance: serviceType ? [{ serviceTypeId: serviceType.id }] : [],
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setBusy(false);
        setError(
          index === 0
            ? body.error ?? "Could not save the unit"
            : `Saved ${index} of ${quantity}, then: ${body.error ?? "save failed"}`,
        );
        router.refresh();
        return;
      }

      setProgress(index + 1);
    }

    router.push(`/admin/locations/${locationId}`);
    router.refresh();
  }

  return (
    <main className="rise">
      <PageHeader title="Add units" subtitle={locationName} />

      <form onSubmit={submit}>
        <Card>
          <div style={{ marginBottom: 18 }}>
            <span style={label}>What kind of unit?</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {UNIT_TYPES.map((option) => {
                const on = option.label === type.label;
                return (
                  <button
                    key={option.label} type="button" onClick={() => setType(option)}
                    aria-pressed={on}
                    style={{
                      padding: "9px 14px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                      minHeight: 40, cursor: "pointer",
                      border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                      background: on ? "var(--accent)" : "var(--surface-2)",
                      color: on ? "#1a0f04" : "var(--ink-soft)",
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="area">Where is it?</label>
            <select id="area" style={field} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              <option value={NEW_AREA}>+ New area…</option>
            </select>
          </div>

          {areaId === NEW_AREA ? (
            <div style={{ marginBottom: 16 }}>
              <label style={label} htmlFor="newArea">New area name</label>
              <input id="newArea" style={field} value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)}
                     placeholder="e.g. Upstairs Bar" autoComplete="off" />
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 2 }}>
              <label style={label} htmlFor="name">Name <span style={{ fontWeight: 400 }}>· defaults to the type</span></label>
              <input id="name" style={field} value={name} onChange={(e) => setName(e.target.value)}
                     placeholder={type.label} autoComplete="off" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label} htmlFor="qty">How many?</label>
              <input id="qty" style={field} type="number" min={1} max={50} inputMode="numeric"
                     value={quantity}
                     onChange={(e) => setQuantity(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
          </div>

          <p style={{ color: "var(--ink-faint)", fontSize: 13, margin: "0 0 18px" }}>
            Will be added as <strong style={{ color: "var(--ink-soft)" }}>{preview}</strong>
            {serviceType ? ` · ${serviceType.name} every ${serviceType.defaultIntervalDays} days` : " · no maintenance schedule"}
          </p>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={label} htmlFor="make">Make <span style={{ fontWeight: 400 }}>· optional</span></label>
              <input id="make" style={field} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} autoComplete="off" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label} htmlFor="model">Model <span style={{ fontWeight: 400 }}>· optional</span></label>
              <input id="model" style={field} value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 10 }}>
            Leave these blank if you don&rsquo;t know them — they can be filled in from the unit&rsquo;s
            data plate on the next visit.
          </p>
        </Card>

        {error ? (
          <p style={{ color: "var(--bad)", fontSize: 14, marginTop: 14 }} role="alert">{error}</p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <Button type="submit" disabled={busy}>
            {busy
              ? quantity > 1 ? `Adding ${progress} of ${quantity}…` : "Adding…"
              : quantity > 1 ? `Add ${quantity} units` : "Add unit"}
          </Button>
        </div>
      </form>
    </main>
  );
}
