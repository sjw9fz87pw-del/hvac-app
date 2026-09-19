"use client";

import { useState } from "react";

/**
 * A link meant to be passed on by hand. Shown in full rather than hidden behind
 * a button, because the clipboard API needs a secure context and permission and
 * quietly does nothing when it does not have them — leaving someone convinced
 * they copied something they did not.
 */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Selecting the text below still works; say nothing rather than lie.
      setCopied(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line)",
          background: "var(--surface-2)", fontSize: 12.5, lineHeight: 1.5,
          wordBreak: "break-all", userSelect: "all", fontFamily: "ui-monospace, monospace",
        }}
      >
        {link}
      </div>
      <button
        type="button" onClick={copy}
        style={{
          marginTop: 8, padding: "10px 16px", borderRadius: 999, minHeight: 42,
          border: "1px solid var(--line)", background: "var(--surface-2)",
          color: copied ? "var(--good)" : "var(--accent)", fontWeight: 650,
          fontSize: 14, cursor: "pointer",
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
