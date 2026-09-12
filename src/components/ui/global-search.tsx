"use client";

import { useEffect, useRef, useState } from "react";

interface Result { type: string; id: string; title: string; subtitle: string; href: string }

/**
 * One search box across restaurant, customer, equipment name, model, serial,
 * asset id and tag - because internal staff know one of those, not which filter
 * it belongs under. Cmd/Ctrl-K opens it.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((o) => !o);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
      if (response.ok) setResults((await response.json()).results);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  if (!open) {
    return (
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "14px 20px 0" }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%", textAlign: "left", padding: "11px 15px", borderRadius: 12,
            border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-faint)",
            cursor: "pointer", fontSize: 14.5, display: "flex", justifyContent: "space-between",
          }}
        >
          <span>Search restaurants, equipment, model, serial, asset id, tag…</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>⌘K</span>
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgb(0 0 0 / 0.35)", padding: "10vh 20px", backdropFilter: "blur(2px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620, margin: "0 auto", background: "var(--surface)", borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden", boxShadow: "0 20px 60px rgb(0 0 0 / 0.3)" }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          style={{ width: "100%", padding: "17px 19px", border: "none", outline: "none", background: "transparent", fontSize: 16 }}
        />
        {results.length > 0 ? (
          <div style={{ maxHeight: "50vh", overflowY: "auto", borderTop: "1px solid var(--line)" }}>
            {results.map((result) => (
              <a
                key={`${result.type}-${result.id}`}
                href={result.href}
                style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 19px", borderBottom: "1px solid var(--line)" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)", width: 68, flexShrink: 0 }}>
                  {result.type}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{result.title}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--ink-soft)" }}>{result.subtitle}</span>
                </span>
              </a>
            ))}
          </div>
        ) : query.length >= 2 ? (
          <div style={{ padding: "17px 19px", color: "var(--ink-faint)", fontSize: 14, borderTop: "1px solid var(--line)" }}>
            No matches
          </div>
        ) : null}
      </div>
    </div>
  );
}
