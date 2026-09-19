/**
 * Long-press drag, for grouping things on a phone.
 *
 * HTML5 drag-and-drop does not fire on touch at all, so this is built on
 * pointer events. The important part is the gesture split: a finger that goes
 * down on a row might be starting a drag or might be starting a scroll, and
 * guessing wrong makes the list feel broken either way.
 *
 * So nothing is captured until a long press proves intent. Move beyond a few
 * pixels before the timer fires and it was a scroll — the drag never starts and
 * the browser keeps the gesture. Hold still and the row lifts, at which point
 * the pointer is captured and scrolling is suppressed for the duration.
 *
 * Pure DOM and timing logic, kept out of the component so the thresholds can be
 * unit-tested rather than felt for.
 */

/** Hold this long without moving to start a drag. */
export const LONG_PRESS_MS = 320;

/** Move more than this before the timer fires and it counts as a scroll. */
export const SLOP_PX = 8;

export type Gesture = "pending" | "drag" | "scroll";

export interface GestureState {
  gesture: Gesture;
  startX: number;
  startY: number;
  startedAt: number;
}

export function beginGesture(x: number, y: number, now: number): GestureState {
  return { gesture: "pending", startX: x, startY: y, startedAt: now };
}

/**
 * Decide what a pointer move means. Once a gesture has resolved it stays
 * resolved — a drag does not become a scroll halfway through.
 */
export function onMove(state: GestureState, x: number, y: number, now: number): GestureState {
  if (state.gesture !== "pending") return state;

  const moved = Math.hypot(x - state.startX, y - state.startY);
  const held = now - state.startedAt;

  if (held >= LONG_PRESS_MS) return { ...state, gesture: "drag" };
  if (moved > SLOP_PX) return { ...state, gesture: "scroll" };
  return state;
}

/** The long-press timer firing while the finger has stayed put. */
export function onHoldElapsed(state: GestureState): GestureState {
  return state.gesture === "pending" ? { ...state, gesture: "drag" } : state;
}

/**
 * Which row is under the pointer. Uses the document's own hit testing rather
 * than cached rectangles, so it stays correct while the list scrolls or
 * reflows mid-drag.
 */
export function targetIdAt(x: number, y: number, attribute = "data-drop-id"): string | null {
  if (typeof document === "undefined") return null;
  const element = document.elementFromPoint(x, y);
  const holder = element?.closest(`[${attribute}]`);
  return holder?.getAttribute(attribute) ?? null;
}
