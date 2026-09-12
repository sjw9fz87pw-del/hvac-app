"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { compressImage } from "@/lib/photos/client";

const CATEGORIES = [
  { key: "NOT_COOLING", label: "Not cooling", icon: "❄" },
  { key: "MAKING_NOISE", label: "Making noise", icon: "♪" },
  { key: "LEAKING", label: "Leaking", icon: "💧" },
  { key: "DOOR_PROBLEM", label: "Door problem", icon: "🚪" },
  { key: "ICE_BUILDUP", label: "Ice build-up", icon: "🧊" },
  { key: "NEEDS_CLEANING", label: "Needs cleaning", icon: "🧽" },
  { key: "OTHER", label: "Other", icon: "…" },
];

/**
 * Reporting starts from the asset, so the restaurant, area, model, serial number
 * and full service history are already attached. The customer picks a symptom
 * and optionally adds a photo - nothing else to fill in.
 */
export function ReportProblem({ equipmentId, equipmentName }: { equipmentId: string; equipmentName: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed, "issue.jpg");
      form.append("prefix", "issue");
      const response = await fetch("/api/v1/photos", { method: "POST", body: form });
      const body = await response.json();
      if (response.ok) setPhotoKeys((keys) => [...keys, body.blobKey]);
      else setError(body.error ?? "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!category) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/issues", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ equipmentId, category, description: description || null, photoBlobKeys: photoKeys }),
    });
    setBusy(false);
    if (response.ok) { setDone(true); return; }
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not submit the report");
  }

  if (done) {
    return (
      <Card style={{ background: "var(--good-soft)", borderColor: "transparent", textAlign: "center" }}>
        <div style={{ fontWeight: 660, color: "var(--good)" }}>Problem reported</div>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginTop: 5 }}>
          Our team has the equipment details and service history. We&rsquo;ll be in touch.
        </p>
      </Card>
    );
  }

  if (!open) {
    return <Button variant="secondary" size="lg" onClick={() => setOpen(true)}>Report a problem</Button>;
  }

  return (
    <Card>
      <div style={{ fontWeight: 660, marginBottom: 3 }}>What&rsquo;s wrong with {equipmentName}?</div>
      <p style={{ fontSize: 13.5, color: "var(--ink-faint)", marginBottom: 14 }}>
        We already have the model, serial number and service history.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            onClick={() => setCategory(item.key)}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "13px 14px", borderRadius: 12, cursor: "pointer",
              textAlign: "left", fontWeight: 600, fontSize: 14, minHeight: 50,
              border: `1.5px solid ${category === item.key ? "var(--accent)" : "var(--line)"}`,
              background: category === item.key ? "var(--accent-soft)" : "var(--surface)",
              color: category === item.key ? "var(--accent)" : "var(--ink)",
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Anything else we should know? (optional)"
        rows={3}
        style={{ width: "100%", marginTop: 12, padding: 13, borderRadius: 12, border: "1px solid var(--line)", background: "var(--canvas)", resize: "vertical" }}
      />

      <label
        className="tap"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, padding: 13, borderRadius: 12, border: "1px dashed var(--line)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}
      >
        <input type="file" accept="image/*" capture="environment" onChange={addPhoto} style={{ display: "none" }} />
        {photoKeys.length > 0 ? `${photoKeys.length} photo${photoKeys.length === 1 ? "" : "s"} attached` : "Add a photo"}
      </label>

      {error ? <div style={{ marginTop: 10, color: "var(--bad)", fontSize: 13.5 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button onClick={submit} disabled={!category || busy}>{busy ? "Sending…" : "Send report"}</Button>
      </div>
    </Card>
  );
}
