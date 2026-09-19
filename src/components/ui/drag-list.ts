/**
 * Dragging rows around on a touch screen.
 *
 * The hard constraint is `touch-action`. A browser decides who owns a gesture
 * at touchstart and will not revisit it: with `pan-y` anywhere on the path it
 * claims every vertical movement for scrolling, stops delivering touchmove, and
 * fires pointercancel. Since dragging one row onto another *is* vertical
 * movement, no amount of long-pressing or preventDefault wins that argument
 * after the fact.
 *
 * So dragging starts from a handle that declares `touch-action: none`. The
 * browser never claims gestures that begin there, touchmove keeps arriving, and
 * the rest of the row scrolls normally. A visible grip also says the row can be
 * dragged, which a long press never does.
 *
 * Movement still has to clear a few pixels first, so a tap that lands on the
 * handle does not lift the row.
 */

/** Movement before a press on the handle becomes a drag. */
export const SLOP_PX = 4;

export interface GestureState {
  startX: number;
  startY: number;
  dragging: boolean;
}

export function beginGesture(x: number, y: number): GestureState {
  return { startX: x, startY: y, dragging: false };
}

/** Has the finger moved far enough to mean it. Once dragging, stays dragging. */
export function pastSlop(state: GestureState, x: number, y: number): boolean {
  if (state.dragging) return true;
  return Math.hypot(x - state.startX, y - state.startY) > SLOP_PX;
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
