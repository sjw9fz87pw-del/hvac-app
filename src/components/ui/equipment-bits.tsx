/** Shared bits used across equipment screens; re-exports the primitives so pages import from one place. */
export * from "./primitives";

export function photoThumb(blobKey: string | null, alt: string) {
  const size = 44;
  if (!blobKey) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: size, height: size, borderRadius: 10, background: "var(--canvas)",
          border: "1px solid var(--line)", display: "grid", placeItems: "center",
          color: "var(--ink-faint)", fontSize: 16, flexShrink: 0,
        }}
      >
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/v1/photos/${encodeURIComponent(blobKey)}`}
      alt={alt}
      style={{ width: size, height: size, borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)", flexShrink: 0 }}
    />
  );
}
