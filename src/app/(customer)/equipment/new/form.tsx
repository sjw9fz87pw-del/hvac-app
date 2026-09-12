"use client";

import { useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { compressImage, uploadPhoto } from "@/lib/photos/client";

const TYPES = [
  { category: "REFRIGERATION", label: "Reach-in refrigerator" },
  { category: "REFRIGERATION", label: "Reach-in freezer" },
  { category: "REFRIGERATION", label: "Back bar cooler" },
  { category: "REFRIGERATION", label: "Prep table" },
  { category: "REFRIGERATION", label: "Walk-in cooler" },
  { category: "REFRIGERATION", label: "Walk-in freezer" },
  { category: "ICE_MACHINE", label: "Ice machine" },
  { category: "HVAC", label: "HVAC unit" },
  { category: "WATER_FILTRATION", label: "Water filtration" },
  { category: "OTHER", label: "Other" },
];

export function AddEquipmentForm({ locations }: {
  locations: { id: string; name: string; areas: { id: string; name: string }[] }[];
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [areaId, setAreaId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(TYPES[0]);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const location = locations.find((l) => l.id === locationId);

  async function addPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadPhoto(await compressImage(file), "equipment");
      setPhotoKeys((keys) => [...keys, result.blobKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/equipment", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        locationId, areaId: areaId || null, name,
        category: type.category, equipmentType: type.label,
        manufacturer: manufacturer || null, model: model || null, serialNumber: serial || null,
        photoBlobKeys: photoKeys, maintenance: [],
      }),
    });
    setBusy(false);
    if (response.ok) { setDone(true); return; }
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not save the equipment");
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "13px 14px", borderRadius: 12,
    border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 48,
  };

  if (done) {
    return (
      <main className="rise">
        <Card style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h1 style={{ fontSize: 21, marginTop: 8 }}>Equipment added</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 8, maxWidth: 380, marginInline: "auto" }}>
            It&rsquo;s marked <strong>Needs service setup</strong>. Our team has been notified and will confirm the details,
            set the maintenance schedule and attach a tag.
          </p>
          <div style={{ marginTop: 20, maxWidth: 260, marginInline: "auto" }}>
            <Button href="/equipment">Back to equipment</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="rise">
      <PageHeader title="Add equipment" subtitle="Tell us about a new unit and we'll set up its maintenance." />

      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <Card style={{ display: "grid", gap: 12 }}>
          {locations.length > 1 ? (
            <Label text="Location">
              <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setAreaId(""); }} style={field}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Label>
          ) : null}

          <Label text="Area">
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} style={field}>
              <option value="">Not sure / other</option>
              {location?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Label>

          <Label text="What is it?">
            <select
              value={type.label}
              onChange={(e) => setType(TYPES.find((t) => t.label === e.target.value) ?? TYPES[0])}
              style={field}
            >
              {TYPES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
            </select>
          </Label>

          <Label text="Name it">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Back Bar Cooler #2" style={field} />
          </Label>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 660, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Optional details
          </div>
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Manufacturer" style={field} />
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model number" style={field} />
          <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial number" style={field} />
        </Card>

        <label
          className="tap"
          style={{ display: "grid", placeItems: "center", padding: 24, borderRadius: 16, border: "1.5px dashed var(--line)", background: "var(--surface)", cursor: "pointer" }}
        >
          <input type="file" accept="image/*" capture="environment" onChange={addPhoto} style={{ display: "none" }} />
          <div style={{ fontSize: 26 }}>📷</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>
            {photoKeys.length > 0 ? `${photoKeys.length} photo${photoKeys.length === 1 ? "" : "s"} added` : "Add a photo"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-faint)" }}>Helps us identify the unit on our next visit</div>
        </label>

        {error ? <div style={{ color: "var(--bad)", fontSize: 13.5 }}>{error}</div> : null}

        <Button type="submit" size="lg" disabled={busy || !name}>{busy ? "Saving…" : "Add equipment"}</Button>
      </form>
      <div style={{ height: 24 }} />
    </main>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>{text}</span>
      {children}
    </label>
  );
}
