/**
 * Out-of-scope resources land here rather than on a 403, so the page never
 * confirms that another customer's record exists.
 */
export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ maxWidth: 400, textAlign: "center", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 30 }}>
        <h1 style={{ fontSize: 20 }}>Not found</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 8 }}>
          This page doesn&rsquo;t exist, or it isn&rsquo;t available to your account.
        </p>
        <a
          href="/"
          style={{ display: "inline-flex", alignItems: "center", marginTop: 20, padding: "11px 18px", borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 600 }}
        >
          Go home
        </a>
      </div>
    </main>
  );
}
