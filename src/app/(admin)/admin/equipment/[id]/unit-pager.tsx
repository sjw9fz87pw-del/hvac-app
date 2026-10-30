"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** `label` is the name without the area in front: "Refrigerator 3", not "Kitchen Refrigerator 3". */
interface Neighbour { id: string; name: string; label: string }

const SLIDE_KEY = "unit-slide";
/** Start a swipe this far in from an edge, or the phone's own back gesture wins. */
const EDGE = 24;

/**
 * Previous and next unit in the same area, by button or by swiping.
 *
 * Going through a kitchen one fridge at a time used to mean Back, scroll,
 * tap, for every unit. Now the bar sits at the top while you scroll, and a
 * sideways swipe anywhere on the page does the same.
 *
 * Each move replaces the page in history rather than adding to it, so Back
 * still means "back to the restaurant", however many units were visited.
 */
export function UnitPager({ prev, next, position, total, areaName }: {
  prev: Neighbour | null;
  next: Neighbour | null;
  position: number;
  total: number;
  areaName: string;
}) {
  const router = useRouter();
  const prevLink = useRef<HTMLAnchorElement>(null);
  const nextLink = useRef<HTMLAnchorElement>(null);

  // Arriving from a swipe or a tap on the bar: slide in from that side.
  useEffect(() => {
    let direction: string | null = null;
    try { direction = sessionStorage.getItem(SLIDE_KEY); sessionStorage.removeItem(SLIDE_KEY); } catch { /* private mode */ }
    const page = document.querySelector<HTMLElement>("main[data-unit-page]");
    if (page && (direction === "next" || direction === "prev")) {
      page.classList.add(direction === "next" ? "unit-enter-next" : "unit-enter-prev");
    }
    if (prev) router.prefetch(`/admin/equipment/${prev.id}`);
    if (next) router.prefetch(`/admin/equipment/${next.id}`);
  }, [prev, next, router]);

  useEffect(() => {
    const page = document.querySelector<HTMLElement>("main[data-unit-page]");
    if (!page) return;
    let start: { x: number; y: number; t: number } | null = null;
    let sideways = false;

    function go(direction: "prev" | "next") {
      const link = direction === "next" ? nextLink.current : prevLink.current;
      if (!link) return false;
      try { sessionStorage.setItem(SLIDE_KEY, direction); } catch { /* private mode */ }
      // A real tap on the link, so the progress bar and scroll-to-top apply.
      link.click();
      return true;
    }

    function blocked(target: EventTarget | null): boolean {
      for (let el = target as HTMLElement | null; el && el !== page; el = el.parentElement) {
        if (el.matches("input, textarea, select, [contenteditable], [data-no-swipe]")) return true;
        // A sheet or dialog floating over the page owns its own gestures.
        if (getComputedStyle(el).position === "fixed") return true;
      }
      return false;
    }

    function onStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE || blocked(event.target)) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY, t: Date.now() };
      sideways = false;
    }

    function onMove(event: TouchEvent) {
      if (!start || !page) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!sideways) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start = null; return; } // a scroll
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        sideways = true;
      }
      // Follow the finger a little; barely at all when there is nothing that way.
      const hasTarget = dx < 0 ? Boolean(next) : Boolean(prev);
      page.style.transition = "none";
      page.style.transform = `translateX(${dx * (hasTarget ? 0.35 : 0.08)}px)`;
    }

    function onEnd(event: TouchEvent) {
      if (!start || !page) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      const quick = Date.now() - start.t < 700;
      start = null;
      if (!sideways) return;
      const direction = dx < 0 ? "next" : "prev";
      const far = Math.abs(dx) > 70 || (quick && Math.abs(dx) > 45);
      if (far && Math.abs(dx) > Math.abs(dy) * 1.5 && (direction === "next" ? next : prev)) {
        page.style.transition = "transform 150ms ease-out, opacity 150ms ease-out";
        page.style.transform = `translateX(${direction === "next" ? -48 : 48}px)`;
        page.style.opacity = "0.35";
        go(direction);
      } else {
        page.style.transition = "transform 180ms ease-out";
        page.style.transform = "";
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowRight" && go("next")) event.preventDefault();
      if (event.key === "ArrowLeft" && go("prev")) event.preventDefault();
    }

    page.addEventListener("touchstart", onStart, { passive: true });
    page.addEventListener("touchmove", onMove, { passive: true });
    page.addEventListener("touchend", onEnd, { passive: true });
    page.addEventListener("touchcancel", onEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      page.removeEventListener("touchstart", onStart);
      page.removeEventListener("touchmove", onMove);
      page.removeEventListener("touchend", onEnd);
      page.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [prev, next]);

  const remember = (direction: "prev" | "next") => () => {
    try { sessionStorage.setItem(SLIDE_KEY, direction); } catch { /* private mode */ }
  };

  return (
    <nav className="unit-pager" aria-label={`Units in ${areaName}`}>
      {prev ? (
        <Link ref={prevLink} href={`/admin/equipment/${prev.id}`} replace onClick={remember("prev")} className="unit-pager-link" aria-label={`Previous: ${prev.name}`}>
          <Chevron flip />
          <span className="unit-pager-name">{prev.label}</span>
        </Link>
      ) : <span className="unit-pager-link is-empty" />}

      <span className="unit-pager-count">
        {position} of {total}
        <span className="unit-pager-area">{areaName}</span>
      </span>

      {next ? (
        <Link ref={nextLink} href={`/admin/equipment/${next.id}`} replace onClick={remember("next")} className="unit-pager-link is-next" aria-label={`Next: ${next.name}`}>
          <span className="unit-pager-name">{next.label}</span>
          <Chevron />
        </Link>
      ) : <span className="unit-pager-link is-empty" />}
    </nav>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={flip ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
