"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A panel that slides up over the page: a visit's details, a booking form.
 *
 * The schedule used to send every tap to another page, which is a long way to
 * go to move a visit by a day. A sheet keeps the calendar in place underneath,
 * so you can see where you were and carry on from it. On a wide screen it sits
 * in the middle as a dialog.
 *
 * Closes with ×, a tap outside it, Escape, or a downward drag on its top.
 */
export function Sheet({ title, subtitle, onClose, onBack, children }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Shown as "‹ Back" when this sheet was opened from another one. */
  onBack?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  // A drag down on the handle or the title closes it, as on any phone.
  const drag = useRef<{ y: number } | null>(null);
  function onTouchStart(event: React.TouchEvent) {
    drag.current = { y: event.touches[0].clientY };
  }
  function onTouchMove(event: React.TouchEvent) {
    if (!drag.current || !panel.current) return;
    const dy = Math.max(0, event.touches[0].clientY - drag.current.y);
    panel.current.style.transition = "none";
    panel.current.style.transform = `translateY(${dy}px)`;
  }
  function onTouchEnd(event: React.TouchEvent) {
    if (!drag.current || !panel.current) return;
    const dy = event.changedTouches[0].clientY - drag.current.y;
    drag.current = null;
    panel.current.style.transition = "transform 180ms ease-out";
    panel.current.style.transform = "";
    if (dy > 90) close.current();
  }

  return createPortal(
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="sheet-head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="sheet-grip" aria-hidden="true" />
          <div className="sheet-head-row">
            {onBack ? (
              <button type="button" className="sheet-back" onClick={onBack}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                Back
              </button>
            ) : null}
            <div className="sheet-titles">
              <h2 id={titleId} className="sheet-title">{title}</h2>
              {subtitle ? <div className="sheet-subtitle">{subtitle}</div> : null}
            </div>
            <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                   strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
