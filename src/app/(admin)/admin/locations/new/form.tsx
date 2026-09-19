"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui/primitives";

/** The rooms a restaurant is usually divided into. Tap to add, tap to remove. */
const SUGGESTED_AREAS = ["Kitchen", "Bar", "Walk-In", "Prep", "Basement", "Roof", "Dish"];

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 620,
  color: "var(--ink-soft)", marginBottom: 6,
};

const NEW_GROUP = "__new__";

export function AddRestaurantForm({ organizations, defaultGroupId, canCreateGroup }: {
  organizations: { id: string; name: string; restaurants: number }[];
  /** The group the last restaurant went into, so a run of them lands together. */
  defaultGroupId: string | null;
  canCreateGroup: boolean;
}) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(
    defaultGroupId ?? organizations[0]?.id ?? NEW_GROUP,
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [name, setName] = useState("");
  const [addressLine1, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [areas, setAreas] = useState<string[]>(["Kitchen", "Bar"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleArea(area: string) {
    setAreas((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Give the restaurant a name"); return; }
    if (organizationId === NEW_GROUP && !newGroupName.trim()) {
      setError("Name the new group");
      return;
    }
    setBusy(true);
    setError(null);

    const response = await fetch("/api/v1/locations", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        ...(organizationId === NEW_GROUP
          ? { newGroupName: newGroupName.trim() }
          : { organizationId }),
        name: name.trim(),
        addressLine1: addressLine1.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        phone: phone.trim() || null,
        areas,
      }),
    });

    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      router.push(body?.id ? `/admin/locations/${body.id}` : "/admin/locations");
      router.refresh();
      return;
    }

    setBusy(false);
    const body = await response.json().catch(() => ({}));
    setError(body.error ?? "Could not save the restaurant");
  }

  return (
    <main className="rise">
      <PageHeader title="Add restaurant" subtitle="Units get added afterwards, one at a time" />

      <form onSubmit={submit}>
        <Card>
          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="org">Group</label>
            <select id="org" style={field} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}{org.restaurants > 0 ? ` · ${org.restaurants}` : ""}
                </option>
              ))}
              {canCreateGroup ? <option value={NEW_GROUP}>+ New group…</option> : null}
            </select>

            {organizationId === NEW_GROUP ? (
              <input
                style={{ ...field, marginTop: 10 }}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name, e.g. Dad&rsquo;s Restaurants"
                autoComplete="off"
              />
            ) : (
              <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 8 }}>
                The next restaurant you add will default to this group.
              </p>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="name">Restaurant name</label>
            <input id="name" style={field} value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="e.g. Bru Philly" autoComplete="off" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="address">Street address <span style={{ fontWeight: 400 }}>· optional</span></label>
            <input id="address" style={field} value={addressLine1} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 2 }}>
              <label style={label} htmlFor="city">City</label>
              <input id="city" style={field} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label} htmlFor="state">State</label>
              <input id="state" style={field} value={state} onChange={(e) => setState(e.target.value)} autoComplete="off" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="phone">Phone <span style={{ fontWeight: 400 }}>· optional</span></label>
            <input id="phone" style={field} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
          </div>

          <div>
            <span style={label}>Areas</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SUGGESTED_AREAS.map((area) => {
                const on = areas.includes(area);
                return (
                  <button
                    key={area} type="button" onClick={() => toggleArea(area)}
                    aria-pressed={on}
                    style={{
                      padding: "9px 14px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                      minHeight: 40, cursor: "pointer",
                      border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                      background: on ? "var(--accent)" : "var(--surface-2)",
                      color: on ? "#1a0f04" : "var(--ink-soft)",
                    }}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
            <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 10 }}>
              You can add more areas later when adding a unit.
            </p>
          </div>
        </Card>

        {error ? (
          <p style={{ color: "var(--bad)", fontSize: 14, marginTop: 14 }} role="alert">{error}</p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add restaurant"}</Button>
        </div>
      </form>
    </main>
  );
}
