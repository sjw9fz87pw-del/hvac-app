"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { List, Row, Divider, Pill, Disclosure, Card, Button } from "@/components/ui/primitives";
import { beginGesture, pastSlop, targetIdAt, type GestureState } from "@/components/ui/drag-list";

export interface RestaurantRow {
  id: string; name: string; groupId: string; groupName: string; groupSlug: string;
  units: number; place: string | null; overdue: number; due: number;
}

export interface GroupBlock {
  id: string; name: string; restaurants: RestaurantRow[];
}

/**
 * The grip. `touch-action: none` on this element is the whole trick: a gesture
 * that starts here is never claimed by the browser for scrolling, so touchmove
 * keeps being delivered and the drag can happen. The rest of the row keeps its
 * normal scrolling behaviour.
 */
function Grip({ onPointerDown }: { onPointerDown: (event: React.PointerEvent) => void }) {
  return (
    <span
      role="button"
      aria-label="Drag to group"
      onPointerDown={onPointerDown}
      style={{
        display: "grid", placeItems: "center", flexShrink: 0,
        width: 34, height: 44, marginLeft: -6, cursor: "grab",
        touchAction: "none", userSelect: "none",
        WebkitUserSelect: "none", WebkitTouchCallout: "none",
        color: "var(--ink-faint)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        {[3, 8, 13].map((y) =>
          [5, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />),
        )}
      </svg>
    </span>
  );
}

function statusPill(row: RestaurantRow) {
  if (row.overdue > 0) return <Pill tone="bad">{row.overdue} overdue</Pill>;
  if (row.due > 0) return <Pill tone="warn">{row.due} due</Pill>;
  if (row.units === 0) return <Pill>No units</Pill>;
  return <Pill tone="good">On track</Pill>;
}

export function RestaurantList({ groups, loose, canGroup }: {
  groups: GroupBlock[];
  loose: RestaurantRow[];
  canGroup: boolean;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState<RestaurantRow | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ a: RestaurantRow; b: RestaurantRow } | null>(null);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const state = useRef<GestureState | null>(null);
  const row = useRef<RestaurantRow | null>(null);

  const justDragged = useRef(false);
  const overRef = useRef<string | null>(null);
  useEffect(() => { overRef.current = over; }, [over]);

  /**
   * While a drag is live the gesture is driven from the document, not from the
   * handle it started on: the finger leaves that element immediately and the
   * events have to keep arriving anyway. preventDefault on a non-passive
   * touchmove holds the page still for the duration.
   */
  useEffect(() => {
    if (!dragging) return;

    const at = (x: number, y: number) => {
      setGhost({ x, y });
      const id = targetIdAt(x, y);
      setOver(id && id !== row.current?.id ? id : null);
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      at(touch.clientX, touch.clientY);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      at(event.clientX, event.clientY);
    };
    const onEnd = () => { void finish(); };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onEnd);
    };
    // finish() reads the live target through a ref, so this binds once per drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function reset() {
    state.current = null;
    row.current = null;
    setDragging(null);
    setOver(null);
    setGhost(null);
  }

  /** Press on the grip. Nothing lifts until the finger actually moves. */
  function handleDown(event: React.PointerEvent, item: RestaurantRow) {
    if (!canGroup || event.button !== 0) return;
    event.preventDefault();
    state.current = beginGesture(event.clientX, event.clientY);
    row.current = item;

    const arm = (x: number, y: number) => {
      if (!state.current || state.current.dragging) return;
      if (!pastSlop(state.current, x, y)) return;
      state.current = { ...state.current, dragging: true };
      setDragging(row.current);
      setGhost({ x, y });
      navigator.vibrate?.(12);
      document.removeEventListener("touchmove", armTouch);
      document.removeEventListener("pointermove", armPointer);
    };
    const armTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) { e.preventDefault(); arm(t.clientX, t.clientY); }
    };
    const armPointer = (e: PointerEvent) => {
      if (e.pointerType !== "touch") arm(e.clientX, e.clientY);
    };
    const disarm = () => {
      document.removeEventListener("touchmove", armTouch);
      document.removeEventListener("pointermove", armPointer);
      document.removeEventListener("touchend", disarm);
      document.removeEventListener("pointerup", disarm);
      if (state.current && !state.current.dragging) reset();
    };
    document.addEventListener("touchmove", armTouch, { passive: false });
    document.addEventListener("pointermove", armPointer);
    document.addEventListener("touchend", disarm);
    document.addEventListener("pointerup", disarm);
  }

  async function finish() {
    const dragged = row.current;
    const target = overRef.current;
    const wasDragging = Boolean(state.current?.dragging);
    // The click that follows a drop would otherwise open what we dropped onto.
    justDragged.current = wasDragging;
    reset();
    if (!wasDragging || !dragged || !target) return;

    // Dropping onto a group header joins that group outright.
    const targetGroup = groups.find((g) => g.id === target);
    if (targetGroup) { await assign([dragged.id], { groupId: targetGroup.id }); return; }

    const all = [...groups.flatMap((g) => g.restaurants), ...loose];
    const onto = all.find((r) => r.id === target);
    if (!onto) return;

    // Landing on a restaurant in a *different* group joins that group. Landing
    // on one in the same group cannot mean "join what you are already in", so
    // it means the opposite: pull these two out into a group of their own.
    const ontoGroup = groups.find((g) => g.id === onto.groupId);
    if (ontoGroup && ontoGroup.restaurants.length > 1 && onto.groupId !== dragged.groupId) {
      await assign([dragged.id], { groupId: ontoGroup.id });
      return;
    }
    setGroupName("");
    setNaming({ a: dragged, b: onto });
  }

  async function assign(locationIds: string[], target: { groupId: string } | { newGroupName: string }) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/v1/groups", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ locationIds, ...target }),
    });
    setBusy(false);
    setNaming(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not group those");
      return;
    }
    router.refresh();
  }

  const dropStyle = (id: string): React.CSSProperties =>
    over === id
      ? { outline: "2px solid var(--accent)", outlineOffset: -2, borderRadius: "var(--radius-card)", background: "var(--accent-soft)" }
      : {};

  function renderRow(item: RestaurantRow, index: number, total: number) {
    return (
      <div
        key={item.id}
        data-drop-id={item.id}
        onContextMenu={(e) => { if (canGroup) e.preventDefault(); }}
        onClickCapture={(e) => {
          if (justDragged.current) { e.preventDefault(); e.stopPropagation(); justDragged.current = false; }
        }}
        style={{
          ...dropStyle(item.id),
          opacity: dragging?.id === item.id ? 0.4 : 1,
          // Long-pressing a link is a browser gesture before it is ours: iOS
          // raises a preview sheet and both platforms start selecting text,
          // either of which swallows the drag before it begins.
          ...(canGroup
            ? {
                userSelect: "none" as const,
                WebkitUserSelect: "none" as const,
                WebkitTouchCallout: "none" as const,
                touchAction: "pan-y" as const,
              }
            : {}),
        }}
      >
        {index > 0 && total > 1 ? <Divider /> : null}
        {/* The href must not depend on `dragging`. Row renders an <a> when it
            has one and a plain <div> when it does not, so toggling it mid-drag
            makes React replace the node the touch is attached to — and the
            browser cancels the whole gesture. The click that follows a drop is
            suppressed in onClickCapture instead. */}
        <Row
          href={`/admin/locations/${item.id}`}
          title={item.name}
          subtitle={[`${item.units} unit${item.units === 1 ? "" : "s"}`, item.place].filter(Boolean).join(" · ")}
          right={statusPill(item)}
          leading={canGroup ? <Grip onPointerDown={(e: React.PointerEvent) => handleDown(e, item)} /> : undefined}
        />
      </div>
    );
  }

  return (
    <div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 14, marginBottom: 12 }} role="alert">{error}</p> : null}

      {groups.map((group) => (
        <div key={group.id} data-drop-id={group.id} style={dropStyle(group.id)}>
          <Disclosure
            title={group.name}
            meta={`${group.restaurants.length} restaurant${group.restaurants.length === 1 ? "" : "s"}`}
            defaultOpen
            right={<Pill tone="info">Group</Pill>}
          >
            <List>
              {group.restaurants.map((item, i) => renderRow(item, i, group.restaurants.length))}
            </List>
          </Disclosure>
        </div>
      ))}

      {loose.length > 0 ? (
        <List>{loose.map((item, i) => renderRow(item, i, loose.length))}</List>
      ) : null}

      {canGroup && groups.length === 0 && loose.length > 1 ? (
        <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 14, lineHeight: 1.55 }}>
          Drag a restaurant by its grip onto another to put them in a group.
        </p>
      ) : null}

      {/* What the finger is carrying. */}
      {dragging && ghost ? (
        <div
          style={{
            position: "fixed", left: ghost.x, top: ghost.y, transform: "translate(-50%, -140%)",
            pointerEvents: "none", zIndex: 90,
            padding: "10px 16px", borderRadius: 999,
            background: "var(--accent)", color: "#1a0f04",
            fontWeight: 700, fontSize: 14, boxShadow: "0 10px 26px rgba(0,0,0,.4)",
          }}
        >
          {dragging.name}
        </div>
      ) : null}

      {naming ? (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 95, display: "grid", placeItems: "center",
            background: "rgba(0,0,0,.55)", padding: 18,
          }}
          onClick={() => setNaming(null)}
        >
          <div style={{ width: "100%", maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <Card>
              <h2 style={{ fontSize: 19 }}>Name this group</h2>
              <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                {naming.b.name} and {naming.a.name} will be grouped together.
              </p>
              <input
                autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Dad's Restaurants"
                style={{
                  width: "100%", marginTop: 14, padding: "13px 14px", borderRadius: 12,
                  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
                }}
              />
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <Button
                  disabled={busy || !groupName.trim()}
                  onClick={() => assign([naming.b.id, naming.a.id], { newGroupName: groupName.trim() })}
                >
                  {busy ? "Grouping…" : "Create group"}
                </Button>
                <Button variant="secondary" onClick={() => setNaming(null)}>Cancel</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
