"use client";

import { useEffect, useState } from "react";
import { Card, Button, Pill, formatDate } from "@/components/ui/primitives";
import { photoThumb } from "@/components/ui/equipment-bits";
import { compressImage, uploadPhoto, captureTimestamp } from "@/lib/photos/client";
import { submitOrQueue } from "@/lib/sync/queue";
import { isNfcSupported, readTagOnce } from "@/lib/nfc/web-nfc";

interface Props {
  task: { id: string; status: string; visitId: string; locationName: string };
  equipment: {
    id: string; name: string; areaName: string; model: string | null; internalAssetId: string;
    photoBlobKey: string | null; hasTag: boolean;
    lastService: { performedAt: string; technician: string } | null;
  };
  serviceType: {
    id: string; name: string;
    requirements: { nfc: boolean; beforePhoto: boolean; afterPhoto: boolean; checklist: boolean; note: boolean };
    checklist: { id: string; label: string; required: boolean }[];
  };
  nextTask: { id: string; equipmentName: string } | null;
}

interface Photo { kind: "BEFORE" | "AFTER"; blobKey: string; capturedAt: string; preview: string }

/**
 * The service task.
 *
 * Typing is minimised to almost nothing: tap the tag, tap the checklist, take
 * two photos, tap Complete. Notes are optional unless the service type demands
 * one. The Complete button will not close a task that is missing required
 * proof - the server refuses it too, so this is a courtesy, not the control.
 */
export function ServiceTask({ task, equipment, serviceType, nextTask }: Props) {
  const [verification, setVerification] = useState<"NFC" | "QR" | "MANUAL" | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [flagIssue, setFlagIssue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"synced" | "queued" | null>(null);
  const [nfcAvailable, setNfcAvailable] = useState(false);

  useEffect(() => setNfcAvailable(isNfcSupported()), []);

  const missing: string[] = [];
  if (serviceType.requirements.nfc && !verification) missing.push("Verify the tag");
  if (serviceType.requirements.beforePhoto && !photos.some((p) => p.kind === "BEFORE")) missing.push("Before photo");
  if (serviceType.requirements.afterPhoto && !photos.some((p) => p.kind === "AFTER")) missing.push("After photo");
  if (serviceType.requirements.checklist) {
    for (const item of serviceType.checklist.filter((c) => c.required)) {
      if (!checked[item.id]) missing.push(item.label);
    }
  }
  if (serviceType.requirements.note && !notes.trim()) missing.push("Technician note");

  async function verifyByTag() {
    setError(null);
    try {
      const payload = await readTagOnce();
      const response = await fetch("/api/v1/tags/resolve", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Tag could not be verified"); return; }
      // A tag that resolves to a different asset must not verify this one.
      if (body.equipment.id !== equipment.id) {
        setError(`That tag belongs to ${body.equipment.name}, not ${equipment.name}.`);
        return;
      }
      setVerification("NFC");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tag read failed");
    }
  }

  async function addPhoto(kind: "BEFORE" | "AFTER", event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const capturedAt = captureTimestamp();
    const preview = URL.createObjectURL(file);
    try {
      const compressed = await compressImage(file);
      const result = await uploadPhoto(compressed, "service", { capturedAt });
      setPhotos((current) => [...current, { kind, blobKey: result.blobKey, capturedAt, preview }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed — check your connection");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    setError(null);

    const payload = {
      visitTaskId: task.id,
      equipmentId: equipment.id,
      serviceTypeId: serviceType.id,
      performedAt: new Date().toISOString(),
      technicianNotes: notes || null,
      customerVisibleNotes: customerNotes || null,
      verificationMethod: verification ?? "MANUAL",
      checklist: serviceType.checklist.map((item) => ({
        templateId: item.id, label: item.label, completed: Boolean(checked[item.id]),
      })),
      photos: photos.map((p) => ({ kind: p.kind, blobKey: p.blobKey, capturedAt: p.capturedAt })),
      issues: flagIssue && issueNote.trim()
        ? [{ category: "OTHER", title: `Found during service — ${equipment.name}`, description: issueNote, severity: "MEDIUM" as const }]
        : [],
    };

    const outcome = await submitOrQueue("SERVICE_COMPLETED", "/api/v1/services", payload);
    setBusy(false);

    if (outcome.error) { setError(outcome.error); return; }
    setResult(outcome.synced ? "synced" : "queued");
  }

  if (result) {
    return (
      <main className="rise">
        <Card style={{ textAlign: "center", padding: 34 }}>
          <div style={{ fontSize: 42, color: "var(--good)" }}>✓</div>
          <h1 style={{ fontSize: 21, marginTop: 8 }}>{serviceType.name} complete</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 8 }}>
            {equipment.name}
            {result === "queued" ? " — saved on this device and will sync when you have signal." : " — recorded with photos and next service date."}
          </p>

          <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
            {nextTask ? (
              <Button href={`/tech/task/${nextTask.id}`} size="lg">Next: {nextTask.equipmentName}</Button>
            ) : (
              <Button href={`/tech/visits/${task.visitId}`} size="lg">Finish visit</Button>
            )}
            <Button href={`/tech/visits/${task.visitId}`} variant="ghost">Back to visit</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="rise">
      <a href={`/tech/visits/${task.visitId}`} style={{ fontSize: 14, color: "var(--ink-soft)", fontWeight: 600 }}>← Visit</a>

      <Card style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        {photoThumb(equipment.photoBlobKey, equipment.name)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 660, fontSize: 17 }}>{equipment.name}</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
            {equipment.areaName}{equipment.model ? ` · ${equipment.model}` : ""}
          </div>
          {equipment.lastService ? (
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 2 }}>
              Last: {formatDate(equipment.lastService.performedAt)} by {equipment.lastService.technician}
            </div>
          ) : null}
        </div>
      </Card>

      <h1 style={{ fontSize: 22, margin: "20px 0 12px" }}>{serviceType.name}</h1>

      {serviceType.requirements.nfc ? (
        <Card style={{ marginBottom: 12, borderColor: verification ? "var(--good)" : "var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 620 }}>Verify equipment</div>
              <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                {verification ? "Confirmed on site" : "Tap the tag to confirm you're at the right unit"}
              </div>
            </div>
            {verification ? <Pill tone="good">Verified</Pill> : null}
          </div>
          {!verification ? (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {nfcAvailable && equipment.hasTag ? <Button onClick={verifyByTag}>Tap tag</Button> : null}
              <Button variant="secondary" onClick={() => setVerification("QR")}>
                {equipment.hasTag ? "Scanned the QR code instead" : "No tag on this unit"}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {serviceType.requirements.checklist ? (
        <Card style={{ marginBottom: 12, padding: 0 }}>
          {serviceType.checklist.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "15px 16px",
                background: "none", border: "none", borderTop: index > 0 ? "1px solid var(--line)" : "none",
                cursor: "pointer", textAlign: "left", minHeight: 56,
              }}
            >
              <span
                style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
                  border: `2px solid ${checked[item.id] ? "var(--good)" : "var(--line)"}`,
                  background: checked[item.id] ? "var(--good)" : "transparent",
                  color: "#fff", fontSize: 15, fontWeight: 700,
                }}
              >
                {checked[item.id] ? "✓" : ""}
              </span>
              <span style={{ flex: 1, fontWeight: 560, fontSize: 15 }}>{item.label}</span>
              {!item.required ? <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>Optional</span> : null}
            </button>
          ))}
        </Card>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <PhotoSlot kind="BEFORE" label="Before" required={serviceType.requirements.beforePhoto} photos={photos} onAdd={addPhoto} />
        <PhotoSlot kind="AFTER" label="After" required={serviceType.requirements.afterPhoto} photos={photos} onAdd={addPhoto} />
      </div>

      <Card style={{ marginBottom: 12 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={serviceType.requirements.note ? "Technician note (required) — internal only" : "Technician note (optional) — internal only"}
          rows={2}
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--canvas)", resize: "vertical" }}
        />
        <textarea
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          placeholder="Note for the customer (optional) — this one is visible to them"
          rows={2}
          style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--canvas)", resize: "vertical" }}
        />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <button
          onClick={() => setFlagIssue((f) => !f)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          <span style={{ fontSize: 18 }}>{flagIssue ? "⚠️" : "＋"}</span>
          <span style={{ fontWeight: 620 }}>Flag something for follow-up</span>
        </button>
        {flagIssue ? (
          <textarea
            value={issueNote}
            onChange={(e) => setIssueNote(e.target.value)}
            placeholder="e.g. unusual compressor noise — recommend a refrigeration contractor look at it"
            rows={2}
            style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--canvas)", resize: "vertical" }}
          />
        ) : null}
      </Card>

      {error ? (
        <Card style={{ marginBottom: 12, background: "var(--bad-soft)", borderColor: "transparent", color: "var(--bad)", fontSize: 14 }}>
          {error}
        </Card>
      ) : null}

      {missing.length > 0 ? (
        <Card style={{ marginBottom: 12, background: "var(--warn-soft)", borderColor: "transparent" }}>
          <div style={{ fontWeight: 620, color: "var(--warn)", fontSize: 14 }}>Still needed to complete</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13.5, color: "var(--ink-soft)" }}>
            {missing.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Card>
      ) : null}

      <div style={{ marginBottom: 28 }}>
        <Button size="lg" onClick={complete} disabled={busy || missing.length > 0}>
          {busy ? "Saving…" : "Complete service"}
        </Button>
      </div>
    </main>
  );
}

function PhotoSlot({ kind, label, required, photos, onAdd }: {
  kind: "BEFORE" | "AFTER"; label: string; required: boolean; photos: Photo[];
  onAdd: (kind: "BEFORE" | "AFTER", event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const taken = photos.filter((p) => p.kind === kind);
  return (
    <label
      className="tap"
      style={{
        display: "grid", placeItems: "center", padding: taken.length ? 0 : 20, borderRadius: 14, cursor: "pointer",
        border: `1.5px ${taken.length ? "solid" : "dashed"} ${taken.length ? "var(--good)" : "var(--line)"}`,
        background: "var(--surface)", overflow: "hidden", minHeight: 128, position: "relative",
      }}
    >
      <input type="file" accept="image/*" capture="environment" onChange={(e) => onAdd(kind, e)} style={{ display: "none" }} />
      {taken.length > 0 ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={taken[taken.length - 1].preview} alt={label} style={{ width: "100%", height: 128, objectFit: "cover" }} />
          <span style={{ position: "absolute", bottom: 8, left: 8, background: "var(--good)", color: "#fff", fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999 }}>
            {label} ✓
          </span>
        </>
      ) : (
        <>
          <span style={{ fontSize: 26 }}>📷</span>
          <span style={{ fontWeight: 620, marginTop: 6, fontSize: 14 }}>{label}</span>
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{required ? "Required" : "Optional"}</span>
        </>
      )}
    </label>
  );
}
