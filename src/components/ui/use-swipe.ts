"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Start a swipe this far in from an edge, or the phone's own back gesture wins. */
const EDGE = 24;

/**
 * A sideways swipe on one element: left for next, right for previous.
 *
 * The element follows the finger a little, and on a change slides in from
 * the side it came from. Inputs and anything marked data-no-swipe are left
 * alone, as is anything that scrolls sideways itself.
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, handlers: { prev: () => void; next: () => void }) {
  const latest = useRef(handlers);
  useEffect(() => { latest.current = handlers; });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number; t: number } | null = null;
    let sideways = false;

    function blocked(target: EventTarget | null): boolean {
      for (let node = target as HTMLElement | null; node && node !== el; node = node.parentElement) {
        if (node.matches("input, textarea, select, [contenteditable], [data-no-swipe]")) return true;
        const style = getComputedStyle(node);
        if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) return true;
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
      if (!start || !el) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!sideways) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start = null; return; } // a scroll
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        sideways = true;
      }
      el.style.transition = "none";
      el.style.transform = `translateX(${dx * 0.3}px)`;
    }

    function onEnd(event: TouchEvent) {
      if (!start || !el) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      const quick = Date.now() - start.t < 700;
      start = null;
      if (!sideways) return;
      const far = Math.abs(dx) > 70 || (quick && Math.abs(dx) > 45);
      if (far && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const next = dx < 0;
        (next ? latest.current.next : latest.current.prev)();
        // Slide the new content in from the side it is coming from.
        el.style.transition = "none";
        el.style.transform = `translateX(${next ? 36 : -36}px)`;
        el.style.opacity = "0.5";
        requestAnimationFrame(() => {
          el.style.transition = "transform 200ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity 200ms ease-out";
          el.style.transform = "";
          el.style.opacity = "";
        });
      } else {
        el.style.transition = "transform 180ms ease-out";
        el.style.transform = "";
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);
}
