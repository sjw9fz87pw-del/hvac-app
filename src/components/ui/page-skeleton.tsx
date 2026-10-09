/**
 * What shows between a tap and the next page: the shape of a page, so the
 * screen answers at once and nothing jumps when the content arrives.
 */
export function PageSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 26, width: "55%", borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 14, width: "35%", borderRadius: 6, marginTop: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 20 }}>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 66, borderRadius: "var(--radius-card)" }} />)}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton" style={{ height: 58, borderRadius: "var(--radius-card)", marginTop: 10 }} />
      ))}
    </main>
  );
}
