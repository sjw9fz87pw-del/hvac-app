"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SCROLLER = ".app-scroll";

/**
 * Navigation feedback, and where a page opens.
 *
 * A tap that changes nothing for half a second reads as a missed tap, and
 * people tap again — so a thin bar starts on the tap itself, before the server
 * has answered, and goes when the new address is showing.
 *
 * The page scrolls inside the shell, not the window, which the router's own
 * scroll handling does not know about: a unit opened from the bottom of a long
 * list opened part-way down. A tapped link now opens at the top, and Back
 * returns to the place in the list you left.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);
  const tapped = useRef(false);
  const positions = useRef(new Map<string, number>());
  const here = useRef("");

  useEffect(() => {
    const key = `${pathname}?${search.toString()}`;
    here.current = key;
    setLoading(false);

    const scroller = document.querySelector<HTMLElement>(SCROLLER);
    if (!scroller) return;
    // A link was tapped: start at the top. Otherwise this is Back, Forward or
    // a redirect: go back to where this page was left, if it was.
    const target = tapped.current ? 0 : positions.current.get(key) ?? 0;
    tapped.current = false;
    // The page may still be arriving; wait for it to be tall enough.
    let frames = 0;
    let raf = 0;
    const place = () => {
      scroller.scrollTop = target;
      if (scroller.scrollTop < target - 1 && frames++ < 60) raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [pathname, search]);

  useEffect(() => {
    // Capture phase: the router's own handler marks the click handled before a
    // bubbling listener would see it.
    function onClick(event: MouseEvent) {
      // Remember how far down this page was, for coming back to it. Taken at
      // the tap, before the next page's placeholder shortens the scroller and
      // the browser clamps the position.
      const scroller = document.querySelector<HTMLElement>(SCROLLER);
      if (scroller && here.current) positions.current.set(here.current, scroller.scrollTop);

      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      tapped.current = true;
      setLoading(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Never leave it running if a navigation fails or is abandoned.
  useEffect(() => {
    if (!loading) return;
    const stop = setTimeout(() => setLoading(false), 12_000);
    return () => clearTimeout(stop);
  }, [loading]);

  return <div className={loading ? "nav-progress on" : "nav-progress"} aria-hidden="true" />;
}
