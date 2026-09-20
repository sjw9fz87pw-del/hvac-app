"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, uploadPhoto } from "@/lib/photos/client";

const SIZE = 46;

/**
 * The photo on a unit row: a thumbnail once there is one, a camera button
 * before that.
 *
 * `capture="environment"` asks a phone for the back camera directly rather
 * than the photo library, because the common case is standing in front of the
 * unit. It stays a normal file input, so a laptop can still pick a file.
 *
 * Compression happens on the phone before anything is sent — a 4MB capture
 * becomes roughly 200KB, which is the difference between this working and not
 * working on restaurant Wi-Fi.
 */
export function UnitPhoto({ equipmentId, blobKey, name, canEdit }: {
  equipmentId: string;
  blobKey: string | null;
  name: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // Shown straight away so the row updates before the round trip finishes.
  const [preview, setPreview] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(false);
    setPreview(URL.createObjectURL(file));
    try {
      const compressed = await compressImage(file);
      const uploaded = await uploadPhoto(compressed, "equipment");
      const response = await fetch(`/api/v1/equipment/${equipmentId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blobKey: uploaded.blobKey,
          kind: "IDENTIFICATION",
          capturedAt: uploaded.capturedAt,
          bytes: uploaded.bytes,
        }),
      });
      if (!response.ok) throw new Error("attach failed");
      router.refresh();
    } catch {
      setError(true);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? (blobKey ? `/api/v1/photos/${encodeURIComponent(blobKey)}` : null);

  const frame: React.CSSProperties = {
    width: SIZE, height: SIZE, borderRadius: 11, flexShrink: 0,
    display: "grid", placeItems: "center", overflow: "hidden",
    background: "var(--canvas)",
    border: `1px ${shown ? "solid" : "dashed"} ${error ? "var(--bad)" : "var(--line)"}`,
    opacity: busy ? 0.55 : 1,
    // The row is a link; this must not start dragging or opening it.
    touchAction: "manipulation",
  };

  const content = shown ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shown} alt={name} width={SIZE} height={SIZE}
         style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         style={{ color: error ? "var(--bad)" : "var(--ink-faint)" }} aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );

  if (!canEdit) return <div style={frame} aria-hidden={!shown}>{content}</div>;

  return (
    <>
      <button
        type="button"
        aria-label={shown ? `Replace photo of ${name}` : `Add a photo of ${name}`}
        disabled={busy}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); input.current?.click(); }}
        style={{ ...frame, padding: 0, cursor: busy ? "wait" : "pointer" }}
      >
        {content}
      </button>
      <input
        ref={input} type="file" accept="image/*" capture="environment"
        onChange={onPick} style={{ display: "none" }} tabIndex={-1}
      />
    </>
  );
}
