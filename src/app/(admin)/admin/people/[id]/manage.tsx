"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoleCopy } from "@/lib/auth/role-copy";
import { Button, Card, PageHeader, Pill, SectionTitle, formatDate } from "@/components/ui/primitives";
import { CopyLink } from "@/components/ui/copy-link";

interface Person {
  id: string; name: string; email: string; active: boolean;
  awaitingSetup: boolean; lastLoginAt: string | null; servicesRecorded: number;
  role: string; roleLabel: string; scopeName: string;
}

interface Organization { id: string; name: string; locations: { id: string; name: string }[] }

type Issued = { emailed: boolean; link: string; expiresInHours: number; error: string | null };

const field: React.CSSProperties = {
  width: "100%", padding: "13px 14px", borderRadius: 12,
  border: "1px solid var(--line)", background: "var(--surface-2)", minHeight: 48,
};

export function ManagePerson({ person, roles, organizations, isSelf, isLastOwner }: {
  person: Person; roles: RoleCopy[]; organizations: Organization[];
  isSelf: boolean; isLastOwner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const [role, setRole] = useState(person.role);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [locationId, setLocationId] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const selected = roles.find((r) => r.role === role);
  const organization = organizations.find((o) => o.id === organizationId);
  const locked = isSelf || isLastOwner;

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    setIssued(null);

    const response = await fetch(`/api/v1/users/${person.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });

    setBusy(null);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error ?? "That did not work"); return; }

    if (body.invite) setIssued(body.invite as Issued);
    setConfirmRemove(false);
    setChangingRole(false);
    router.refresh();
  }

  return (
    <main className="rise">
      <PageHeader title={person.name} subtitle={person.email} />

      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <Pill tone={person.active ? "good" : "bad"}>{person.active ? "Active" : "No access"}</Pill>
          <Pill tone="info">{person.roleLabel}</Pill>
          {person.awaitingSetup ? <Pill tone="warn">Hasn&rsquo;t set a password</Pill> : null}
          {isSelf ? <Pill tone="accent">You</Pill> : null}
        </div>
        <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.7 }}>
          <div>Sees: <strong style={{ color: "var(--ink)" }}>{person.scopeName}</strong></div>
          <div>Last signed in: {person.lastLoginAt ? formatDate(person.lastLoginAt) : "never"}</div>
          {person.servicesRecorded > 0 ? (
            <div>{person.servicesRecorded} service record{person.servicesRecorded === 1 ? "" : "s"} in their name</div>
          ) : null}
        </div>
      </Card>

      {issued ? (
        <Card style={{ marginTop: 14 }}>
          {issued.emailed ? (
            <>
              <Pill tone="good">Emailed</Pill>
              <p style={{ fontSize: 14, marginTop: 10, color: "var(--ink-soft)" }}>
                Sent to {person.email}. Works once, expires in{" "}
                {issued.expiresInHours >= 24 ? `${Math.round(issued.expiresInHours / 24)} days` : `${issued.expiresInHours} hours`}.
              </p>
            </>
          ) : (
            <>
              <Pill tone="warn">Email not set up — send this yourself</Pill>
              <CopyLink link={issued.link} />
              {issued.error ? (
                <p style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 8 }}>Sending failed: {issued.error}</p>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {error ? (
        <p style={{ color: "var(--bad)", fontSize: 14, marginTop: 14 }} role="alert">{error}</p>
      ) : null}

      <SectionTitle>Fix their access</SectionTitle>
      <div style={{ display: "grid", gap: 10 }}>
        {person.awaitingSetup ? (
          <Button variant="secondary" disabled={busy !== null} onClick={() => act("resend_invite")}>
            {busy === "resend_invite" ? "Issuing…" : "Send the invitation again"}
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy !== null} onClick={() => act("reset_password")}>
            {busy === "reset_password" ? "Issuing…" : "Send a password reset"}
          </Button>
        )}

        {!changingRole ? (
          <Button variant="secondary" disabled={busy !== null || locked} onClick={() => setChangingRole(true)}>
            Change what they can see
          </Button>
        ) : null}
      </div>

      {changingRole ? (
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            {roles.map((option) => {
              const on = option.role === role;
              return (
                <button
                  key={option.role} type="button" onClick={() => { setRole(option.role); setLocationId(""); }}
                  aria-pressed={on}
                  style={{
                    textAlign: "left", padding: "12px 14px", borderRadius: 13, cursor: "pointer",
                    background: "var(--surface-2)",
                    border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  }}
                >
                  <div style={{ fontWeight: 640, fontSize: 14.5 }}>{option.label}</div>
                  <div style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 3 }}>{option.summary}</div>
                </button>
              );
            })}
          </div>

          {selected?.kind === "customer" ? (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <select style={field} value={organizationId}
                      onChange={(e) => { setOrganizationId(e.target.value); setLocationId(""); }}>
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {selected.scope === "restaurant" ? (
                <select style={field} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">Choose a restaurant…</option>
                  {(organization?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              ) : null}
            </div>
          ) : null}

          <p style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 12, lineHeight: 1.5 }}>
            They will be signed out and will sign back in under the new role.
          </p>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <Button
              disabled={busy !== null || (selected?.scope === "restaurant" && !locationId)}
              onClick={() => act("change_role", {
                role,
                organizationId: selected?.kind === "customer" ? organizationId : null,
                locationId: selected?.scope === "restaurant" ? locationId : null,
              })}
            >
              {busy === "change_role" ? "Saving…" : "Save role"}
            </Button>
            <Button variant="secondary" onClick={() => { setChangingRole(false); setRole(person.role); }}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <SectionTitle>Remove their access</SectionTitle>
      <Card>
        {locked ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            {isSelf
              ? "You cannot change your own access. Another owner has to do it."
              : "This is the only owner. Make someone else an owner first, or you would lock everyone out."}
          </p>
        ) : person.active ? (
          <>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6 }}>
              They stop being able to sign in immediately, and any session they have open
              ends. Nothing they recorded is deleted — service records keep their name on
              them, because those are permanent proof of work.
            </p>
            {!confirmRemove ? (
              <div style={{ marginTop: 14 }}>
                <Button variant="secondary" onClick={() => setConfirmRemove(true)}>Remove access</Button>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 620 }}>Remove access for {person.name}?</p>
                <Button disabled={busy !== null} onClick={() => act("deactivate")}>
                  {busy === "deactivate" ? "Removing…" : "Yes, remove access"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Cancel</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6 }}>
              This account cannot sign in. Give it back whenever you like.
            </p>
            <div style={{ marginTop: 14 }}>
              <Button disabled={busy !== null} onClick={() => act("activate")}>
                {busy === "activate" ? "Restoring…" : "Restore access"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
