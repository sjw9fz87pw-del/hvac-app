"use client";

import { useState } from "react";
import { Card, Pill, formatDate } from "@/components/ui/primitives";
import type { CustomerServiceRecordView } from "@/lib/api/serializers";

/** Service history in chronological order, with before/after photos inline. */
export function ServiceHistory({ history }: { history: CustomerServiceRecordView[] }) {
  const [expanded, setExpanded] = useState<string | null>(history[0]?.id ?? null);

  if (history.length === 0) {
    return (
      <Card style={{ textAlign: "center", padding: "32px 20px", color: "var(--ink-soft)" }}>
        No service recorded yet. Once we service this unit, every visit appears here with photos.
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {history.map((record) => {
        const open = expanded === record.id;
        const before = record.photos.filter((p) => p.kind === "BEFORE");
        const after = record.photos.filter((p) => p.kind === "AFTER");
        return (
          <Card key={record.id} style={{ padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => setExpanded(open ? null : record.id)}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 16, cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 640 }}>{record.serviceType}</div>
                <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
                  {formatDate(record.performedAt)} · {record.technicianName}
                </div>
              </div>
              {record.verified ? <Pill tone="good">Verified on site</Pill> : null}
              <span style={{ color: "var(--ink-faint)", transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms ease" }}>›</span>
            </button>

            {open ? (
              <div style={{ padding: "0 16px 16px" }}>
                {record.checklist.length > 0 ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "grid", gap: 6 }}>
                    {record.checklist.map((item) => (
                      <li key={item.label} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                        <span style={{ color: item.completed ? "var(--good)" : "var(--ink-faint)", fontWeight: 700 }}>
                          {item.completed ? "✓" : "○"}
                        </span>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {before.length + after.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <PhotoColumn label="Before" photos={before} />
                    <PhotoColumn label="After" photos={after} />
                  </div>
                ) : null}

                {record.notes ? (
                  <p style={{ marginTop: 12, fontSize: 14, color: "var(--ink-soft)", background: "var(--canvas)", padding: 12, borderRadius: 10 }}>
                    {record.notes}
                  </p>
                ) : null}

                {record.nextDueAt ? (
                  <div style={{ marginTop: 12, fontSize: 13.5, color: "var(--ink-faint)" }}>
                    Next service due {formatDate(record.nextDueAt)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function PhotoColumn({ label, photos }: { label: string; photos: { id: string; url: string }[] }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 660, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      {photos.length === 0 ? (
        <div style={{ height: 110, borderRadius: 10, background: "var(--canvas)", border: "1px dashed var(--line)", display: "grid", placeItems: "center", color: "var(--ink-faint)", fontSize: 13 }}>
          None
        </div>
      ) : (
        photos.map((photo) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={photo.id} src={photo.url} alt={label} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)", marginBottom: 6 }} />
        ))
      )}
    </div>
  );
}
