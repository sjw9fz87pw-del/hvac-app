"use client";

/**
 * A permission or lookup failure in a server component should read as an
 * explanation, not a stack trace. The message itself is never the raw error -
 * that could leak whether another tenant's resource exists.
 */
export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ maxWidth: 420, textAlign: "center", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 30 }}>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <h1 style={{ fontSize: 20, marginTop: 10 }}>Something went wrong</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginTop: 8 }}>
          This page could not be loaded. It may not exist, or your account may not have access to it.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{ padding: "11px 18px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{ padding: "11px 18px", borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 600, display: "inline-flex", alignItems: "center" }}
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
