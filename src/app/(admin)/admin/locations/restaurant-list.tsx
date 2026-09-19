"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { List, Row, Divider, Pill, Disclosure, Card, Button } from "@/components/ui/primitives";
import { beginGesture, onMove, onHoldElapsed, targetIdAt, LONG_PRESS_MS, type GestureState } from "@/components/ui/drag-list";

export interface RestaurantRow {
  id: string; name: string; groupId: string; groupName: string; groupSlug: string;
  units: number; place: string | null; overdue: number; due: number;
}

export interface GroupBlock {
  id: string; name: string; restaurants: RestaurantRow[];
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
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const row = useRef<RestaurantRow | null>(null);

  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  function reset() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    state.current = null;
    row.current = null;
    setDragging(null);
    setOver(null);
    setGhost(null);
  }

  function pointerDown(event: React.PointerEvent, item: RestaurantRow) {
    if (!canGroup) return;
    state.current = beginGesture(event.clientX, event.clientY, Date.now());
    row.current = item;
    holdTimer.current = setTimeout(() => {
      if (!state.current) return;
      state.current = onHoldElapsed(state.current);
      if (state.current.gesture === "drag") {
        setDragging(row.current);
        setGhost({ x: state.current.startX, y: state.current.startY });
        // Tiny buzz where supported, so the lift is felt rather than guessed at.
        navigator.vibrate?.(12);
      }
    }, LONG_PRESS_MS);
  }

  function pointerMove(event: React.PointerEvent) {
    if (!state.current) return;
    state.current = onMove(state.current, event.clientX, event.clientY, Date.now());

    if (state.current.gesture === "scroll") { reset(); return; }
    if (state.current.gesture !== "drag") return;

    // Only now take the gesture off the browser, so scrolling stayed possible
    // right up to the moment the drag actually began.
    event.preventDefault();
    setGhost({ x: event.clientX, y: event.clientY });
    const id = targetIdAt(event.clientX, event.clientY);
    setOver(id && id !== row.current?.id ? id : null);
  }

  async function pointerUp() {
    const dragged = row.current;
    const target = over;
    const wasDragging = state.current?.gesture === "drag";
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
        onPointerDown={(e) => pointerDown(e, item)}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={reset}
        style={{
          ...dropStyle(item.id),
          opacity: dragging?.id === item.id ? 0.4 : 1,
          touchAction: dragging ? "none" : "pan-y",
        }}
      >
        {index > 0 && total > 1 ? <Divider /> : null}
        <Row
          href={dragging ? undefined : `/admin/locations/${item.id}`}
          title={item.name}
          subtitle={[`${item.units} unit${item.units === 1 ? "" : "s"}`, item.place].filter(Boolean).join(" · ")}
          right={statusPill(item)}
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
          Press and hold a restaurant, then drag it onto another to put them in a group.
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
