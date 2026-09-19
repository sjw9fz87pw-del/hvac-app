"use client";

import { useState } from "react";
import type { RoleCopy } from "@/lib/auth/role-copy";
import { Button, Card, PageHeader, Pill, SectionTitle } from "@/components/ui/primitives";

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

const label: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 620,
  color: "var(--ink-soft)", marginBottom: 6,
};

interface Organization {
  id: string;
  name: string;
  locations: { id: string; name: string }[];
}

export function AddPersonForm({ roles, organizations }: {
  roles: RoleCopy[];
  organizations: Organization[];
}) {
  const [selected, setSelected] = useState<RoleCopy>(roles[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const organization = organizations.find((o) => o.id === organizationId);
  const needsRestaurant = selected.scope === "restaurant";
  const needsOrganization = selected.kind === "customer";

  function pickRole(role: RoleCopy) {
    setSelected(role);
    if (role.scope !== "restaurant") setLocationId("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Enter their name"); return; }
    if (!email.trim()) { setError("Enter their email"); return; }
    if (needsOrganization && !organizationId) { setError("Pick a restaurant group"); return; }
    if (needsRestaurant && !locationId) { setError("Pick which restaurant they can see"); return; }

    setBusy(true);
    setError(null);

    const response = await fetch("/api/v1/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        role: selected.role,
        organizationId: needsOrganization ? organizationId : null,
        locationId: needsRestaurant ? locationId : null,
      }),
    });

    setBusy(false);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "Could not add them"); return; }
    setCreated({ name: body.name, email: body.email, password: body.password });
  }

  // The password exists in exactly one place: this screen, once.
  if (created) {
    return (
      <main className="rise">
        <PageHeader title="Added" subtitle={created.name} />
        <Card>
          <Pill tone="warn">Shown once — copy it now</Pill>
          <p style={{ fontSize: 14.5, marginTop: 12, color: "var(--ink-soft)" }}>
            Send {created.name.split(" ")[0]} these two things. They can change the
            password from Account once they are in.
          </p>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <div>
              <span style={label}>Email</span>
              <div style={{ ...field, display: "flex", alignItems: "center", fontVariantNumeric: "tabular-nums" }}>
                {created.email}
              </div>
            </div>
            <div>
              <span style={label}>Temporary password</span>
              <div style={{ ...field, display: "flex", alignItems: "center", fontFamily: "var(--mono, ui-monospace, monospace)", fontSize: 17, letterSpacing: "0.02em" }}>
                {created.password}
              </div>
            </div>
          </div>
        </Card>
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <Button href="/admin/people">Done</Button>
          <Button href="/admin/people/new" variant="secondary">Add another</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="rise">
      <PageHeader title="Add person" subtitle="They sign in at the same address you do" />

      <form onSubmit={submit}>
        <Card>
          <div style={{ marginBottom: 16 }}>
            <label style={label} htmlFor="name">Name</label>
            <input id="name" style={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label style={label} htmlFor="email">Email</label>
            <input id="email" style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   inputMode="email" autoComplete="off" />
          </div>
        </Card>

        <SectionTitle>What can they see?</SectionTitle>
        <div style={{ display: "grid", gap: 8 }}>
          {roles.map((role) => {
            const on = role.role === selected.role;
            return (
              <button
                key={role.role} type="button" onClick={() => pickRole(role)}
                aria-pressed={on}
                style={{
                  textAlign: "left", padding: "14px 16px", borderRadius: "var(--radius-card)",
                  cursor: "pointer", background: "var(--surface)",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  boxShadow: on ? "var(--shadow-card)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                    border: `2px solid ${on ? "var(--accent)" : "var(--line-strong, var(--line))"}`,
                    background: on ? "var(--accent)" : "transparent",
                  }} />
                  <span style={{ fontWeight: 650, fontSize: 15 }}>{role.label}</span>
                  {role.kind === "internal" ? <Pill tone="info">Your team</Pill> : null}
                </div>
                <div style={{ color: "var(--ink-soft)", fontSize: 13.5, marginTop: 6, marginLeft: 24 }}>
                  {role.summary}
                </div>
              </button>
            );
          })}
        </div>

        {needsOrganization ? (
          <>
            <SectionTitle>Which restaurants?</SectionTitle>
            <Card>
              {organizations.length === 0 ? (
                <p style={{ fontSize: 14.5, color: "var(--ink-soft)" }}>
                  Add a restaurant first — there is nothing to give them access to yet.
                </p>
              ) : (
                <>
                  <div style={{ marginBottom: needsRestaurant ? 16 : 0 }}>
                    <label style={label} htmlFor="org">Group</label>
                    <select id="org" style={field} value={organizationId}
                            onChange={(e) => { setOrganizationId(e.target.value); setLocationId(""); }}>
                      {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                    </select>
                  </div>

                  {needsRestaurant ? (
                    <div>
                      <label style={label} htmlFor="loc">Restaurant</label>
                      <select id="loc" style={field} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                        <option value="">Choose a restaurant…</option>
                        {(organization?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      <p style={{ color: "var(--ink-faint)", fontSize: 13, marginTop: 8 }}>
                        They will not be able to see any other restaurant in this group.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </Card>
          </>
        ) : null}

        {error ? (
          <p style={{ color: "var(--bad)", fontSize: 14, marginTop: 14 }} role="alert">{error}</p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add person"}</Button>
        </div>
      </form>
    </main>
  );
}
