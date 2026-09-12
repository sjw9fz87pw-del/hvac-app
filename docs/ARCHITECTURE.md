# Architecture

How this is built, and why each decision was made. The discovery report
([DISCOVERY.md](DISCOVERY.md)) covers what existed beforehand and the plan; this
covers what the code actually does.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 15 (App Router), React 19, TypeScript strict | One deployable serving three role-scoped experiences and the API |
| Database | PostgreSQL 16 via Prisma 6 | Relational integrity matters here: history, audit and tenancy are all relationships |
| Auth | Session cookies + scrypt (Node stdlib) | No native module and no third-party auth service for something this central |
| Styling | Tailwind v4 tokens + inline styles | Token-driven light/dark with no class-name indirection in one-off layouts |
| NFC | `@pmops/nfc-core` workspace package | Zero dependencies, so it is shareable with another service |
| Tests | Vitest, unit + integration against real Postgres | Tenant isolation cannot be proven with mocks |

## The five invariants

Everything else is detail. These are the properties the code is arranged to protect.

### 1. Tenant scope comes from the session, never the request

`src/lib/auth/session.ts` builds an `Actor` by reading membership rows using the
session id in the cookie. `src/lib/auth/scope.ts` turns that into query filters.

```
request → cookie → DB session row → Actor { roles, capabilities, organizationIds, locationIds }
       → capability assertion
       → tenantWhere(actor, requestedNarrowing)   ← narrows, never widens
       → out-of-scope id ⇒ AuthError(404)
```

Two dimensions, both enforced:

- `canAccessOrganization` — is this tenant mine?
- `canAccessLocation` — if I am location-scoped, is this one of my locations?
- `canAccessAsset` / `assertAsset` — **both**, and this is what every resource
  handler calls.

Checking only the organization is a real bug, not a theoretical one: it lets a
location manager at one restaurant read a sibling restaurant in the same group.
That bug existed in this codebase during development, was caught by live probing,
and is now covered by regression tests in both `tests/permissions.test.ts` and
`tests/integration.test.ts`.

Refusals are **404**. A 403 would confirm the resource exists.

### 2. Permissions are capabilities, not routes

`src/lib/auth/permissions.ts` maps roles to capabilities (`equipment.verify`,
`tag.revoke`, `service.complete`, …). Handlers assert capabilities, so adding a
route can never accidentally widen access. The UI hides buttons for convenience;
every handler re-checks, because hidden is not forbidden.

### 3. Internal notes cannot leak by omission

`src/lib/api/serializers.ts` builds customer payloads through functions that have
**no way to emit** `technicianNotes`. This is stronger than remembering the right
`select` at each call site — the type of the returned object simply has no such
field. Tests assert that an internal string never appears in a serialized payload.

### 4. Proof is immutable, and incomplete proof is refused

`src/lib/maintenance/completion.ts`:

- `missingProof()` is pure, so the client can grey out the button and the server
  can enforce the same rule. The server's answer is the one that counts.
- A `ServiceRecord` carries a `contentHash` over its proof and has no update path
  in the application layer. `supersedeService()` writes a *new* record pointing at
  the one it replaces.
- Archiving an asset pauses schedules and closes tag assignments; it never touches
  service records.

### 5. Every field write is idempotent

`src/lib/sync/idempotency.ts` keys on `(actorId, key)` with a unique constraint.
Concurrent duplicates lose the insert race and read the winner's stored response.
This is what makes the offline queue safe: a technician's phone can retry three
times over failing basement Wi-Fi and still produce exactly one service record.

---

## NFC

### Why it is a separate package

`packages/nfc-core` depends on nothing but Node's standard library — no Next.js,
no Prisma, no HTTP. Persistence and auditing come in through `TagStore` /
`TagAuditSink`; the radio comes in through `NfcTransport`. Nothing outside
`src/lib/nfc/*` knows how a tag is encoded.

This is deliberate: the brief described an existing CCG Ops Hub NFC implementation
that is not reachable from this repository. If it surfaces, this package's public
interface is the seam — either its internals are replaced, or this app imports the
CCG package instead.

### What is written to a tag

One NDEF URL record:

```
https://<host>/t/v1.<tenantHint>.<tokenId>.<mac>
```

`tokenId` is 128 random bits — not a database id, not a sequence. `mac` is a
truncated HMAC-SHA256 keyed by a server-held secret, so forged tags are rejected
before any database lookup. `tenantHint` is a non-reversible 6-character hash used
only for lookup sharding.

No customer name, location, equipment, model or serial number touches the chip.

### Resolution (every read, server-side)

1. Signature valid (fail before touching the DB) → 2. tag exists → 3. state is
`ACTIVE` → 4. currently paired → 5. tenant binding intact → 6. **caller is
authorized for that tenant** (nfc-core) → 7. **caller is authorized for that
location** (this app, in `resolveTap`).

Every denial returns one identical message, so valid tags cannot be enumerated,
and every read — allowed or denied — writes a `TagEvent`.

A cloned tag therefore gains an attacker nothing: authorization is decided from
the session, never from anything the tag claims.

### Pairing

`mint → write → read back → verify → pair`. Pairing is refused unless the write
was verified, because an unverified pairing leaves a tag in the field that
resolves to nothing. A failed verify writes a `VERIFY_FAILED` event that surfaces
in the command center's *Failed NFC pairing* list rather than disappearing.

Replacement revokes the old tag and pairs the new one in a single transaction, so
the asset is never without an identity and the old tag's history stays attached.

### QR fallback

Web NFC — scanning and writing from inside a web page — exists on Chrome for
Android and essentially nowhere else. That constrains **technician** operations to
Android.

Customer taps are less constrained than that suggests: iPhone XR/XS and later on
iOS 14+ read NDEF URL tags natively with no app, raising a banner that opens
`/t/<token>` in Safari. So a tag tap works on both platforms; only writing is
Android-only.

The QR code encodes the **same token** and hits the **same endpoint**, so it
covers older iPhones, desktop, and the cases where background reading does not
fire — a first-class path rather than a degraded one. The UI detects capability
and never shows a button that cannot work on the device looking at it.

Hardware constraints that follow from this are in [HARDWARE.md](HARDWARE.md);
the one that matters most is that nearly every asset is mounted on steel, which
ordinary NFC tags cannot read through.

---

## The maintenance engine

`src/lib/maintenance/engine.ts` is pure — no I/O — so the same functions power
list badges, dashboards and the visit generator, and those three can never
disagree.

- **Interval override chain**: `ASSET > LOCATION > CUSTOMER > SYSTEM`. Resolved
  by `resolveInterval()`; the winning scope is stored on the schedule so the UI
  can say *where* an interval came from.
- **Due dates** are anchored to when the work actually happened, not to when it
  was previously due — a late service resets the clock instead of being instantly
  late again. Calendar arithmetic, not millisecond addition, so a DST boundary
  does not turn 30 days into 29 days and 23 hours.
- **Status** moves `UPCOMING → SCHEDULE_NEEDED → DUE → OVERDUE` on configurable
  thresholds, and `SCHEDULE_NEEDED` is suppressed when a visit already covers the
  asset.
- **Maintenance Health** is computed only from overdue items, due items, open
  issues and on-time rate, and returns the `factors` that produced the number so
  the UI can show its own inputs. It is deliberately *not* a mechanical-health
  claim — no sensor data exists yet.

Visits are **generated** from what is due (`generateVisit`), grouped by area so the
technician walks the restaurant once. Nobody hand-picks assets.

---

## Offline

`src/lib/sync/queue.ts` (IndexedDB) writes the event locally **first**, then posts.
That ordering is the point: a technician in a walk-in with no signal finishes the
task, the app confirms it, and the record reaches the server from the parking lot
twenty minutes later.

- Each queued event carries a client-generated id used as its idempotency key.
- `POST /api/v1/sync` replays a batch; already-applied events come back as
  `duplicate`, not as a second write.
- A 4xx rejection (incomplete proof, bad input) is **not** queued to retry forever.
- Photos are compressed to roughly 200KB in the browser before upload, with
  exponential-backoff retry. A 4MB camera capture over restaurant Wi-Fi is the
  difference between proof being collected and not.

---

## Extension points (dormant, not speculative)

These tables exist now so history accrues from day one and later phases are
additive rather than migrations of live data:

`SensorDevice` / `SensorReading`, `Part` / `PartUsage`, `RepairCost`,
`ServicePlan` / `PlanLineItem` / `Subscription`, and `AiExtraction`.

`AiExtraction` is confirmation-gated by design: an extracted manufacturer, model
or serial is never promoted onto an asset without `confirmedById` being set by a
human. There is no AI write path, and no model is called anywhere in this codebase.

---

## Known limits

- Photos are stored on local disk behind a `BlobStore` port. S3/R2 is an
  implementation of that interface, not a refactor.
- Notification delivery is in-app only; the preference table carries email/push
  flags that nothing reads yet.
- Visit generation is on-demand. A scheduled job to run `refreshScheduleStatuses()`
  and `notifyOverdueDigest()` nightly is not wired up — both functions exist and
  are idempotent.
- Web NFC paths are unit-tested against a mocked transport; no NFC hardware was
  available in the build environment, so the physical read/write has not been
  exercised on a real tag.
