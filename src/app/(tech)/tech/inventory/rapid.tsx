"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Button, Pill } from "@/components/ui/primitives";
import { compressImage, uploadPhoto } from "@/lib/photos/client";
import { isNfcSupported, writeTag, readTagOnce } from "@/lib/nfc/web-nfc";

interface LocationOption {
  id: string; name: string; organizationId: string; organizationName: string;
  areas: { id: string; name: string }[];
}
interface ServiceTypeOption { id: string; name: string; category: string; defaultIntervalDays: number }

const EQUIPMENT_TYPES = [
  { label: "Back bar cooler", category: "REFRIGERATION" },
  { label: "Reach-in refrigerator", category: "REFRIGERATION" },
  { label: "Reach-in freezer", category: "REFRIGERATION" },
  { label: "Prep table", category: "REFRIGERATION" },
  { label: "Walk-in cooler", category: "REFRIGERATION" },
  { label: "Walk-in freezer", category: "REFRIGERATION" },
  { label: "Ice machine", category: "ICE_MACHINE" },
  { label: "HVAC unit", category: "HVAC" },
  { label: "Water filtration", category: "WATER_FILTRATION" },
  { label: "Other", category: "OTHER" },
];

const INTERVALS = [30, 60, 90, 180];

type Phase = "capture" | "tagging" | "done";

/**
 * One screen, one unit, then straight on to the next. State that carries over
 * between units - the area and the frequency - is preserved deliberately,
 * because a technician inventories a whole bar before moving to the kitchen.
 */
export function RapidInventory({ locations, selectedLocationId, existingCount, serviceTypes }: {
  locations: LocationOption[];
  selectedLocationId: string | null;
  existingCount: number;
  serviceTypes: ServiceTypeOption[];
  nfcCapable?: boolean;
}) {
  const [locationId, setLocationId] = useState(selectedLocationId ?? locations[0]?.id ?? "");
  const location = useMemo(() => locations.find((l) => l.id === locationId), [locations, locationId]);

  // Sticky between units.
  const [areaId, setAreaId] = useState("");
  const [newArea, setNewArea] = useState("");
  const [intervalDays, setIntervalDays] = useState(30);
  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id ?? "");

  // Per unit.
  const [phase, setPhase] = useState<Phase>("capture");
  const [name, setName] = useState("");
  const [type, setType] = useState(EQUIPMENT_TYPES[0]);
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdAssetId, setCreatedAssetId] = useState<string | null>(null);
  const [tagState, setTagState] = useState<"idle" | "writing" | "verifying" | "paired" | "failed">("idle");
  const [tagMessage, setTagMessage] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [nfcAvailable, setNfcAvailable] = useState(false);

  useEffect(() => setNfcAvailable(isNfcSupported()), []);

  const field: React.CSSProperties = {
    width: "100%", padding: "12px 13px", borderRadius: 11,
    border: "1px solid var(--line)", background: "var(--canvas)", minHeight: 46,
  };

  async function capturePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(URL.createObjectURL(file));
    try {
      const result = await uploadPhoto(await compressImage(file), "equipment");
      setPhotoKey(result.blobKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function createAsset() {
    if (!location) return;
    setBusy(true);
    setError(null);

    const response = await fetch("/api/v1/equipment", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        locationId: location.id,
        areaId: areaId || null,
        newAreaName: !areaId && newArea ? newArea : null,
        name: name || type.label,
        category: type.category,
        equipmentType: type.label,
        model: model || null,
        serialNumber: serial || null,
        photoBlobKeys: photoKey ? [photoKey] : [],
        maintenance: serviceTypeId ? [{ serviceTypeId, intervalDays }] : [],
      }),
    });

    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "Could not create the asset"); return; }

    setCreatedId(body.id);
    setCreatedAssetId(body.internalAssetId);
    setSessionCount((c) => c + 1);
    setPhase("tagging");
  }

  /**
   * Mint, write, read back, verify, then pair. Pairing only happens after the
   * read-back matches - an unverified write would leave a tag in the field that
   * resolves to nothing.
   */
  async function assignTag() {
    if (!createdId || !location) return;
    setTagState("writing");
    setTagMessage(null);
    try {
      const mint = await fetch("/api/v1/tags/mint", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: location.organizationId }),
      });
      const minted = await mint.json();
      if (!mint.ok) throw new Error(minted.error ?? "Could not mint a tag");

      await writeTag(minted.url);

      setTagState("verifying");
      const readBack = await readTagOnce(15_000);

      const verify = await fetch("/api/v1/tags/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagId: minted.tagId, readBackPayload: readBack.split("/t/").pop() ?? readBack }),
      });
      const verified = await verify.json();
      if (!verified.verified) throw new Error(verified.reason ?? "The tag did not verify");

      const pair = await fetch("/api/v1/tags/pair", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ tagId: minted.tagId, equipmentId: createdId, verified: true }),
      });
      if (!pair.ok) throw new Error((await pair.json()).error ?? "Pairing failed");

      setTagState("paired");
    } catch (e) {
      setTagState("failed");
      setTagMessage(e instanceof Error ? e.message : "Tag assignment failed");
    }
  }

  function nextUnit() {
    // Area and frequency stay; everything unit-specific resets.
    setPhase("capture");
    setName(""); setModel(""); setSerial("");
    setPhotoKey(null); setPreview(null);
    setCreatedId(null); setCreatedAssetId(null);
    setTagState("idle"); setTagMessage(null); setError(null);
  }

  if (phase === "tagging") {
    return (
      <main className="rise">
        <Card style={{ textAlign: "center", padding: 28 }}>
          <Pill tone="good">Asset created · {createdAssetId}</Pill>
          <h1 style={{ fontSize: 21, marginTop: 12 }}>{name || type.label}</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 6 }}>
            {tagState === "idle" ? "Hold a blank tag against the phone and assign it."
              : tagState === "writing" ? "Writing the secure identifier…"
              : tagState === "verifying" ? "Reading the tag back to verify the write…"
              : tagState === "paired" ? "Tag written, verified and paired."
              : "The tag was not paired."}
          </p>

          {tagState === "paired" ? (
            <div style={{ fontSize: 40, marginTop: 14, color: "var(--good)" }}>✓</div>
          ) : null}

          {tagMessage ? (
            <div style={{ marginTop: 14, background: "var(--bad-soft)", color: "var(--bad)", padding: 12, borderRadius: 10, fontSize: 13.5 }}>
              {tagMessage}
            </div>
          ) : null}

          <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
            {tagState !== "paired" ? (
              nfcAvailable ? (
                <Button size="lg" onClick={assignTag} disabled={tagState === "writing" || tagState === "verifying"}>
                  {tagState === "failed" ? "Try again" : "Assign NFC tag"}
                </Button>
              ) : (
                <Card style={{ background: "var(--warn-soft)", borderColor: "transparent", fontSize: 13.5, textAlign: "left" }}>
                  This browser cannot write NFC tags. The asset is saved and will appear in
                  <strong> Assets without tags</strong> for tagging on a supported device — its QR code works in the meantime.
                </Card>
              )
            ) : null}
            <Button size="lg" variant={tagState === "paired" ? "primary" : "secondary"} onClick={nextUnit}>
              Next unit →
            </Button>
            <Button variant="ghost" href="/tech">Finish survey ({sessionCount} added)</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="rise">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 23 }}>Rapid inventory</h1>
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            {location?.name} · {existingCount + sessionCount} assets
          </div>
        </div>
        <Pill tone="accent">{sessionCount} this session</Pill>
      </div>

      {locations.length > 1 ? (
        <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setAreaId(""); }} style={{ ...field, marginBottom: 10 }}>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.organizationName} — {l.name}</option>)}
        </select>
      ) : null}

      <Card style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 660, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Area · stays selected between units
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {location?.areas.map((area) => (
            <button
              key={area.id}
              onClick={() => { setAreaId(area.id); setNewArea(""); }}
              style={{
                padding: "9px 14px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 42,
                border: `1px solid ${areaId === area.id ? "transparent" : "var(--line)"}`,
                background: areaId === area.id ? "var(--accent)" : "var(--canvas)",
                color: areaId === area.id ? "#fff" : "var(--ink-soft)",
              }}
            >
              {area.name}
            </button>
          ))}
        </div>
        <input
          value={newArea}
          onChange={(e) => { setNewArea(e.target.value); setAreaId(""); }}
          placeholder="or type a new area"
          style={{ ...field, marginTop: 9 }}
        />
      </Card>

      <label
        className="tap"
        style={{
          display: "grid", placeItems: "center", borderRadius: 16, cursor: "pointer", overflow: "hidden",
          border: `1.5px ${preview ? "solid" : "dashed"} ${preview ? "var(--good)" : "var(--line)"}`,
          background: "var(--surface)", minHeight: preview ? 0 : 140, marginBottom: 10, position: "relative",
        }}
      >
        <input type="file" accept="image/*" capture="environment" onChange={capturePhoto} style={{ display: "none" }} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Equipment" style={{ width: "100%", height: 180, objectFit: "cover" }} />
        ) : (
          <>
            <span style={{ fontSize: 30 }}>📷</span>
            <span style={{ fontWeight: 620, marginTop: 6 }}>Photograph the unit</span>
          </>
        )}
      </label>

      <Card style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
          {EQUIPMENT_TYPES.map((item) => (
            <button
              key={item.label}
              onClick={() => { setType(item); if (!name) setName(item.label); }}
              style={{
                padding: "9px 13px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: "pointer", minHeight: 40,
                border: `1px solid ${type.label === item.label ? "transparent" : "var(--line)"}`,
                background: type.label === item.label ? "var(--accent)" : "var(--canvas)",
                color: type.label === item.label ? "#fff" : "var(--ink-soft)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Back Bar Cooler #2" style={field} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (optional)" style={field} />
          <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial (optional)" style={field} />
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 660, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Maintenance
        </div>
        <select value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)} style={field}>
          {serviceTypes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
          {INTERVALS.map((days) => (
            <button
              key={days}
              onClick={() => setIntervalDays(days)}
              style={{
                flex: 1, padding: "11px 4px", borderRadius: 11, fontSize: 14, fontWeight: 620, cursor: "pointer", minHeight: 44,
                border: `1px solid ${intervalDays === days ? "transparent" : "var(--line)"}`,
                background: intervalDays === days ? "var(--accent)" : "var(--canvas)",
                color: intervalDays === days ? "#fff" : "var(--ink-soft)",
              }}
            >
              {days}d
            </button>
          ))}
        </div>
      </Card>

      {error ? <div style={{ color: "var(--bad)", fontSize: 13.5, marginBottom: 10 }}>{error}</div> : null}

      <div style={{ marginBottom: 26 }}>
        <Button size="lg" onClick={createAsset} disabled={busy || (!areaId && !newArea)}>
          {busy ? "Saving…" : "Create & assign tag →"}
        </Button>
      </div>
    </main>
  );
}
