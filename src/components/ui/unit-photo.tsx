"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { compressImage, uploadPhoto } from "@/lib/photos/client";

/**
 * A unit's photo: on its row and at the top of its page.
 *
 * Tapping a photo shows it large. The camera only opens from that view's
 * Retake button, or from the empty frame of a unit with no photo yet: when
 * the thumbnail itself was the camera button, a tap meant to look at the
 * unit opened the camera instead.
 *
 * `capture="environment"` asks a phone for the back camera directly rather
 * than the photo library, because the common case is standing in front of the
 * unit. It stays a normal file input, so a laptop can still pick a file. The
 * input is made on demand at the end of the page, not beside the photo: on a
 * row the photo sits inside the link to the unit, and a click on an input
 * there reached the link too, opening the unit behind the camera.
 *
 * Compression happens on the phone before anything is sent — a 4MB capture
 * becomes roughly 200KB, which is the difference between this working and not
 * working on restaurant Wi-Fi.
 */
export function UnitPhoto({ equipmentId, blobKey, name, canEdit, size = 60 }: {
  equipmentId: string;
  blobKey: string | null;
  name: string;
  canEdit: boolean;
  /** 60 on a row; larger at the top of the unit's page. */
  size?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [viewing, setViewing] = useState(false);
  // Shown straight away so the row updates before the round trip finishes.
  const [preview, setPreview] = useState<string | null>(null);

  async function save(file: File) {
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
  const large = size >= 80;

  const frame: React.CSSProperties = {
    width: size, height: size, borderRadius: large ? 16 : 12, flexShrink: 0,
    display: "grid", placeItems: "center", alignContent: "center", gap: 4, overflow: "hidden",
    background: "var(--canvas)",
    border: `1px ${shown ? "solid" : "dashed"} ${error ? "var(--bad)" : shown ? "var(--line)" : "var(--line-strong)"}`,
    opacity: busy ? 0.55 : 1,
    // The row is a link; this must not start dragging or opening it.
    touchAction: "manipulation",
    padding: 0,
    color: error ? "var(--bad)" : "var(--ink-faint)",
  };

  const content = shown ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shown} alt={name} width={size} height={size}
         style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <>
      <CameraIcon size={large ? 26 : 21} />
      {large && canEdit ? <span style={{ fontSize: 12, fontWeight: 650 }}>Add photo</span> : null}
    </>
  );

  const openCamera = () => {
    document.querySelectorAll("input[data-unit-photo-picker]").forEach((old) => old.remove());
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.setAttribute("capture", "environment");
    picker.setAttribute("data-unit-photo-picker", "");
    picker.style.display = "none";
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      picker.remove();
      if (file) void save(file);
    });
    document.body.appendChild(picker);
    picker.click();
  };
  // On a row, the photo sits inside the link to the unit: a tap on it is for
  // the photo, not the unit.
  const own = (action: () => void) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  if (shown) {
    return (
      <>
        <button
          type="button"
          aria-label={`View photo of ${name}`}
          disabled={busy}
          onClick={own(() => setViewing(true))}
          className="unit-photo"
          style={{ ...frame, cursor: busy ? "wait" : "zoom-in" }}
        >
          {content}
        </button>
        {viewing ? (
          <PhotoViewer
            src={shown}
            name={name}
            onClose={() => setViewing(false)}
            onRetake={canEdit ? () => { setViewing(false); openCamera(); } : undefined}
          />
        ) : null}
      </>
    );
  }

  if (!canEdit) return <div style={frame} aria-hidden="true">{content}</div>;

  return (
    <>
      <button
        type="button"
        aria-label={`Add a photo of ${name}`}
        disabled={busy}
        onClick={own(openCamera)}
        className="unit-photo"
        style={{ ...frame, cursor: busy ? "wait" : "pointer" }}
      >
        {content}
      </button>
    </>
  );
}

/** The photo filling the screen, with Retake when the person can change it. */
function PhotoViewer({ src, name, onClose, onRetake }: {
  src: string;
  name: string;
  onClose: () => void;
  onRetake?: () => void;
}) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A portal still passes clicks up to the row's link in React's tree, which
  // would open the unit behind the photo; everything stops here.
  const contain = (event: React.MouseEvent) => event.stopPropagation();

  return createPortal(
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={contain}>
      <div className="photo-viewer-top">
        <span className="photo-viewer-name">{name}</span>
        <button type="button" className="photo-viewer-close" onClick={onClose} aria-label="Close" autoFocus>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
               strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="photo-viewer-stage" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} />
      </div>
      {onRetake ? (
        <div className="photo-viewer-actions">
          <button type="button" onClick={onRetake}>
            <CameraIcon size={20} />
            Retake photo
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

function CameraIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </svg>
  );
}
