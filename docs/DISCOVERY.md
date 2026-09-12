# Discovery Report — Restaurant Equipment Preventive-Maintenance Platform

**Date:** 2026-09-05
**Repository:** `sjw9fz87pw-del/hvac-app`
**Branch:** `claude/restaurant-maintenance-platform-dydlsy`

---

## 1. Current State

### 1.1 What actually exists in this repository

I inspected the repository before writing any code. The complete contents are:

```
hvac-app/
  README.md      # 2 lines: "# hvac-app" / "hvac test app"
```

- Single commit (`4403013 Initial commit`), authored 2026-09-05.
- Two branches: `main` and `claude/restaurant-maintenance-platform-dydlsy` (identical).
- **No application code, no package manifest, no database, no migrations, no CI.**

### 1.2 The CCG NFC implementation — not present

The task asked me to inspect and reuse an existing **CCG Ops Hub NFC tag
implementation**, an existing **NFC skill**, the reader/writer flow, tag pairing,
QR fallback, permissions, audit logs, and reusable asset models. I searched for
all of it and it is **not reachable from this session**:

| Thing I looked for | Where I looked | Result |
| --- | --- | --- |
| CCG NFC source code | This repo (all files, all branches, full git history) | **Not found** — repo contains only `README.md` |
| Other CCG repositories | `list_repos` for this account | **Not found** — `sjw9fz87pw-del/hvac-app` is the *only* repository this account can see |
| An "NFC skill" | `~/.claude/skills`, `/mnt/skills`, plugin dirs, session skill listing | **Not found** — available skills are generic (docx, pdf, pptx, xlsx, artifact/design, code-review, etc.). No NFC skill exists. |
| Any NFC code on disk | Recursive `grep -ri nfc` across the home and config trees | **Not found** — the only hit was this session's own transcript |
| Existing auth / DB / asset models | This repo | **Not found** — nothing to reuse |

**Conclusion: there is nothing to reuse, and nothing working to destroy.** No
existing functionality was overwritten, because none existed. Every claim about
"reuse" in this document therefore describes *how the new NFC module is built so
that it can be shared with CCG Ops Hub*, rather than a port of existing code.

> **If the CCG code does exist somewhere**, it is in a repository or workspace this
> session was never granted. Grant this session access to that repo (an org owner
> can enable it at `claude.ai/admin-settings/claude-tag`, or re-run with the repo
> attached) and the NFC module described in §6 is the seam to reconcile against:
> it is deliberately isolated in `packages/nfc-core` with **zero** dependencies on
> Next.js, Prisma, or this app's schema, so swapping its internals for the proven
> CCG implementation — or replacing this app's copy with the CCG package — is a
> contained change behind a stable interface.

### 1.3 Environment inventory

| Capability | Status |
| --- | --- |
| Node.js | v22.22.2 |
| npm / pnpm | 10.9.7 / 10.33.0 |
| PostgreSQL | 16.13, local cluster started for dev + tests |
| Docker | present |
| Network | outbound HTTPS via agent proxy (npm registry reachable) |

---

## 2. Reusable Components

Because nothing pre-existed, "reusable" here means **what this build factors out
so it is reusable across this app and CCG Ops Hub**:

| Module | Location | Depends on | Reusable because |
| --- | --- | --- | --- |
| `@pmops/nfc-core` | `packages/nfc-core` | **nothing** (Node stdlib `crypto` only) | Pure domain: secure tag-token mint/verify, tag lifecycle state machine, payload builder, QR fallback URL builder, audit-event contracts. No framework, no ORM, no HTTP. Consumable by any Node service. |
| Tag storage port | `packages/nfc-core/src/ports.ts` | — | `TagStore` / `TagAuditSink` interfaces. This app implements them over Prisma; CCG can implement them over its own store. |
| Maintenance engine | `src/lib/maintenance/engine.ts` | pure TS | Interval resolution + due-date + status math with no I/O — unit-testable and portable. |
| Permission matrix | `src/lib/auth/permissions.ts` | pure TS | Role → capability map, evaluated server-side; no framework coupling. |
| Design system | `src/components/ui/*` | React + Tailwind | Cards, stat tiles, status pills, sheets, checklist rows, empty states. |
| Photo pipeline | `src/lib/photos/*` | browser canvas + storage port | Client compression, EXIF-safe timestamping, retry queue; storage behind a `BlobStore` port (local disk now, S3 later). |

---

## 3. Target Architecture

### 3.1 Shape

A single **Next.js 15 (App Router) + TypeScript** application, plus one
framework-free workspace package for NFC. One deployable, three role-scoped
experiences, one API.

```
hvac-app/
├── packages/
│   └── nfc-core/                 # framework-free NFC domain (reusable by CCG)
├── prisma/
│   ├── schema.prisma             # full domain model
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (customer)/           # Home, Equipment, Service, Issues, Account
│   │   ├── (tech)/               # Today, Visits, Scan, Activity, Profile
│   │   ├── (admin)/              # Dashboard, Customers, Locations, Equipment,
│   │   │                         #   Schedule, Technicians, Issues, Reports, NFC, Settings
│   │   ├── t/[token]/            # public tag/QR resolver -> auth -> equipment page
│   │   └── api/v1/…              # REST API
│   ├── lib/
│   │   ├── auth/                 # sessions, password hashing, RBAC, tenant scope
│   │   ├── maintenance/          # interval resolution, due dates, health score
│   │   ├── nfc/                  # Prisma adapters for @pmops/nfc-core
│   │   ├── audit/                # append-only audit log
│   │   ├── sync/                 # idempotency + offline replay
│   │   └── photos/               # compression + blob storage port
│   └── components/               # design system + feature components
└── docs/                         # this report, architecture, API, runbook
```

### 3.2 Key architectural decisions

1. **Tenant isolation is a server-side invariant, never a client input.** Every
   query is built through `scopeFor(actor)`, which derives the accessible
   organization/location set from the *session row in the database*. Client-supplied
   `organizationId` is only ever used as a **filter within** that derived scope, and
   is rejected if outside it (404, not 403 — no existence leak).
2. **Service records are immutable.** A completed service writes an append-only
   `ServiceRecord` with a content hash. Corrections create a superseding record
   linked by `supersedesId`; the original is never mutated or deleted. Editing or
   archiving an asset never touches history.
3. **Assets are archived, never deleted.** `archivedAt` + `replacedByAssetId`.
4. **Tags carry an opaque signed identifier only.** Never customer data. See §6.
5. **Idempotency everywhere the field app writes.** Every mutating endpoint accepts
   `Idempotency-Key`; replays return the original response. This is what makes the
   offline queue safe.
6. **The due-date engine is pure.** No I/O, therefore fully unit-tested, and the
   same function powers list badges, dashboards, and the nightly generator.
7. **Extension points are in the schema now, dormant in the UI**: sensor readings,
   telemetry, parts, repair costs, vendors, service plans/subscriptions, AI
   extraction results. Building them in later is additive, not a migration of
   live data.

### 3.3 Request lifecycle (mutating endpoint)

```
request
  → session cookie → DB session row → Actor {userId, role, orgScope, locationScope}
  → permission check (capability, not route)
  → tenant scope applied to every query
  → idempotency key lookup (replay? return stored response)
  → transaction: domain write + audit event (+ notification enqueue)
  → response cached against idempotency key
```

---

## 4. Database Model

PostgreSQL via Prisma. Grouped by concern; full DDL in `prisma/schema.prisma`.

**Identity & tenancy**
`ServiceCompany`, `User`, `Session`, `Membership` (user × role × org/location scope),
`CustomerOrganization`, `RestaurantLocation`, `Area`.

**Equipment**
`Equipment` (the Equipment Passport: name, category, type, manufacturer, model,
serial, area, internal asset id, condition, criticality, warranty, filter spec,
vendor, manuals, status, `archivedAt`, `replacedByAssetId`, `pendingSetup`),
`EquipmentPhoto`, `EquipmentDocument`, `FilterSpec`, `WarrantyInfo`.

**NFC / identity tags**
`Tag` (token id, secret hash, state: `UNASSIGNED|ACTIVE|REVOKED|LOST`, tenant binding),
`TagAssignment` (tag × equipment, `assignedAt`/`unassignedAt` — history preserved),
`TagEvent` (append-only: written, verified, paired, replaced, unpaired, reassigned,
revoked, read, failed-read), `QrFallback` (derived from the same token).

**Preventive maintenance**
`ServiceType` (condenser cleaning, HVAC filter, water filter, ice machine…),
`MaintenanceTemplate` (per equipment category → service type + default interval +
completion requirements), `MaintenancePlan` (the override chain: SYSTEM → CUSTOMER →
LOCATION → ASSET), `MaintenanceSchedule` (per asset × service type: interval, last
service, next due, status), `ChecklistTemplate` / `ChecklistItemTemplate`.

**Work**
`Visit` (location × date × technician × status × estimated duration),
`VisitTask` (visit × equipment × service type × status), `ServiceRecord`
(immutable proof: technician, timestamps, checklist results, photos, notes,
customer-visible notes, issues found, next due date, NFC verification evidence,
content hash, `supersedesId`), `ServicePhoto` (BEFORE/AFTER/ISSUE),
`ChecklistResult`.

**Issues**
`Issue` (source: CUSTOMER|TECHNICIAN|SYSTEM, category, severity, status,
equipment, reporter, photos, assignment), `IssueEvent`, `Vendor`,
`VendorAssignment` (future outside-trade routing).

**Commercial (dormant)**
`ServicePlan`, `PlanLineItem`, `Subscription`, `SubscriptionAsset`.

**Platform**
`AuditEvent` (actor, action, entity, before/after, ip, ua — append-only),
`Notification` + `NotificationPreference` (with dedupe key to prevent spam),
`IdempotencyKey`, `SyncBatch`.

**Future intelligence (dormant tables, present so history accrues from day one)**
`SensorDevice`, `SensorReading`, `Part`, `PartUsage`, `RepairCost`,
`AiExtraction` (data-plate OCR results awaiting technician confirmation —
always `confirmedBy` gated, never auto-trusted).

**Enforcement notes**
- Composite indexes on `(organizationId, …)` for every tenant-scoped table.
- Unique: `Tag.tokenId`, `Equipment.internalAssetId` per organization,
  `IdempotencyKey.key` per actor.
- `ServiceRecord` has no `UPDATE`/`DELETE` path in the application layer.

---

## 5. Role and Permission Model

| Role | Scope | Can |
| --- | --- | --- |
| **Super Admin** | Service company (all tenants) | Everything, incl. settings, user management, tag revocation |
| **Operations Admin** | Service company | All customers/locations/equipment/schedule/NFC; no company settings/billing |
| **Service Manager** | Assigned customers | Schedule visits, assign techs, verify customer-added equipment, resolve issues, pair tags |
| **Technician** | Assigned visits/locations | Read assets at assigned locations, perform service, write photos/notes, pair & verify tags, flag issues |
| **Customer Org Owner** | One customer organization | All own locations, dashboards, equipment, add equipment, report issues, view reports |
| **Customer Location Manager** | One (or several) locations | Same as owner but scoped to assigned locations only |
| **Customer Staff** (optional/limited) | One location | View equipment, report issues. **No** cost/plan data, no history export |

**Rules**
- Permissions are **capabilities**, not routes: `equipment.create`, `equipment.verify`,
  `tag.pair`, `tag.revoke`, `service.complete`, `service.edit`, `issue.assign`,
  `report.view`, `settings.manage`, … Every API handler asserts a capability.
- Server-side always. UI hiding is cosmetic only; every handler re-checks.
- Customers never receive internal-only fields. `technicianNotes` is stripped at the
  serializer boundary; only `customerVisibleNotes` crosses. This is enforced by
  dedicated customer-facing serializers, not by `select` sprinkled at call sites.
- No customer role has any tag-writing capability. Customers cannot program tags.

---

## 6. NFC Integration Plan

### 6.1 Module boundary

`packages/nfc-core` — pure TypeScript, Node `crypto` only. Exports:

- `mintTagToken(secret, {tenantId, nonce})` → `{tokenId, payload, checkDigest}`
- `verifyTagToken(secret, payload)` → parsed token or typed failure
- `buildTagUrl(baseUrl, payload)` / `buildQrPayload(...)` — the QR fallback resolves
  to the **same** token, so NFC and QR are one code path
- `TagLifecycle` — the state machine (`UNASSIGNED → ACTIVE → REVOKED|LOST`,
  reassignment, replacement) with legal-transition validation
- `TagStore` / `TagAuditSink` ports — this app implements them over Prisma

This is the seam described in §1.2: if the CCG implementation surfaces, either its
internals drop in behind these signatures, or this app switches to the CCG package.

### 6.2 What goes on the tag

An NDEF record containing **only** a URL of the form:

```
https://<host>/t/<v>.<tenantHint>.<tokenId>.<mac>
```

- `tokenId` — random 128-bit opaque id. Not an equipment id, not a sequence.
- `mac` — HMAC-SHA256 truncated, over `v|tenantHint|tokenId`, keyed by a server-held
  secret. Detects forged/mistyped tags before a DB hit.
- `tenantHint` — a **non-reversible** 32-bit hash of the tenant id, used only to
  shard/rate-limit lookups. It identifies nothing on its own.
- **No** customer name, location, equipment, model, serial, or address on the tag.
- Tags are written with the NDEF read-only lock **offered** at pairing time (the
  writer flow exposes "lock tag" for tamper resistance).

### 6.3 Server-side resolution (every read)

`GET /t/<payload>` → `POST /api/v1/tags/resolve`:

1. MAC valid? (fail fast, no DB hit)
2. Tag exists?
3. Tag state is `ACTIVE` (not `REVOKED`/`LOST`/`UNASSIGNED`)?
4. Tag is currently assigned to an equipment asset?
5. Asset's tenant matches the tag's tenant binding?
6. **Requesting user has access to that tenant/location** — resolved from the
   session, never from the payload?
7. Log a `TagEvent` (`READ` or `READ_DENIED`) either way.

Failures return an identical generic response so an attacker cannot enumerate
valid tags. Unauthenticated taps land on a sign-in page that preserves the token,
then resolve after login.

### 6.4 Internal tag operations

Reader, Writer, Pair New Tag, Replace Tag, Unpair, Reassign, Verify, Test,
Tag History, Revoked Tags, Unassigned Tags, Recent Tags, QR generation.

**Pairing flow:** select equipment → *Assign NFC Tag* → tap blank tag → write
secure identifier → **read back and verify the write** → pair to equipment →
confirm success. The pairing is only committed after the verify read succeeds;
a failed verify produces a `TAG_WRITE_FAILED` event and surfaces in the admin
command center's *Failed NFC pairing* list.

**Replacement:** new tag is minted and paired in the same transaction that revokes
the old one. The old `TagAssignment` row is closed, not deleted — complete history
survives.

Every assignment, replacement, reassignment, unpair, and revocation writes both a
`TagEvent` and an `AuditEvent`.

### 6.5 Client capability

Web NFC (`NDEFReader`) works on Chrome for Android. Everywhere else (iOS Safari,
desktop), the same flows fall back to **QR scan** or **manual tag-id entry**, hitting
the identical resolver endpoint. The UI detects capability and never shows a dead
button. A future native/wrapper app can implement the same `NfcTransport` interface.

---

## 7. UX Screen Map

**Customer** — `Home · Equipment · Service · Issues · Account`
Home: location switcher, Maintenance Health, asset count, current / due soon /
overdue, open issues, recently serviced, next scheduled visit. Equipment: grouped by
area with drill-down; asset page = Equipment Passport (photos, status, last/next
service, history, documents, Report a Problem). Service: upcoming visits + past
visit reports. Issues: report + track. Account: profile, locations, users, notifications.

**Technician** — `Today · Visits · Scan · Activity · Profile`
Today: assigned restaurants, units due, progress ring. Visit: tasks grouped by area,
"Tap tag to start". Scan: NFC/QR. Task: checklist + before/after photo + notes +
Complete → **Next Equipment**. Rapid Inventory Mode: area → photo → type → optional
model/serial → interval → create → assign tag → verify → next unit, all on one screen.

**Admin** — `Dashboard · Customers · Locations · Equipment · Schedule · Technicians ·
Issues · Reports · NFC · Settings`
Dashboard = command center: today's restaurants, equipment scheduled, techs working,
completed/remaining, overdue, missed visits, customer-reported problems, assets
without tags, assets awaiting verification, failed pairings, incomplete proof,
technician exceptions. Global search across restaurant, customer, equipment name,
model, serial, asset id, tag id.

**Design language:** mobile-first, large touch targets (≥44px), rounded cards,
generous spacing, one accent color, four status colors (current / due soon / overdue /
issue), system font stack, subtle motion, no dense grids. Light and dark.

---

## 8. Implementation Phases

| Phase | Scope | Status in this branch |
| --- | --- | --- |
| 1 | Foundation: auth, orgs, locations, areas, equipment, tenant isolation, permissions | **Built** |
| 2 | Equipment inventory: rapid inventory mode, photos, equipment pages, customer portal | **Built** |
| 3 | NFC: `nfc-core`, writer, reader, pairing, resolver, QR fallback, audit | **Built** |
| 4 | Preventive maintenance: templates, plans, due-date engine, task generation | **Built** |
| 5 | Technician workflow: Today, visits, tap, checklist, photos, completion, offline queue | **Built** |
| 6 | Customer dashboard: health, equipment, upcoming, history, issue reporting | **Built** |
| 7 | Internal command center: customers, schedule, overdue, issues, techs, exceptions | **Built** |
| 8 | Reporting: service reports, photo proof, PDF-ready structure | **Built (HTML/print-ready; PDF renderer deferred)** |
| 9 | Service plans & billing architecture | **Schema + read models only; no billing** |
| 10 | Equipment intelligence, AI, sensors, lifecycle analytics | **Schema seams only; no AI calls** |

Phases 9 and 10 are deliberately schema-and-seam only — see §10.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **The CCG NFC system exists and this duplicates it** | Highest-priority open item. NFC is isolated in one dependency-free package so reconciliation is a contained swap, not a rewrite. Flagged prominently in §1.2. |
| Web NFC is Chrome-Android only | QR fallback is a first-class, equal path on every tag — not a degraded mode. Every asset always has a QR. |
| Tag cloning | Signed opaque token + server-side state/tenant/authorization checks + read-only lock offered at write time. A cloned tag still cannot read data the tapping user isn't entitled to. |
| Cross-tenant leakage | Scope derived from the session row only; client tenant ids are filters, never grants. Out-of-scope ids return 404. Integration tests assert this per resource. |
| Duplicate service records from a flaky field connection | Idempotency keys on every write + client-generated event ids; replays return the original record. |
| Photo loss on bad Wi-Fi | Client compresses, queues in IndexedDB, retries with backoff; the task cannot complete without required photos, and the queue survives app restarts. |
| Notification spam | Dedupe key + per-type digest windows + user preferences; no per-asset blast. |
| Overstating equipment health | The score is named **Maintenance Health** and is computed *only* from on-time service, overdue items, open issues, inspection findings and age. The UI states its inputs. No mechanical-health claim is made anywhere. |
| AI hallucinating history | No AI write path exists. The `AiExtraction` table is confirmation-gated by design: extracted values are never promoted to an asset without a technician confirming them. |
| Schema churn as phases 9–10 land | Dormant tables and extension points exist from day one so later phases are additive. |

---

## 10. Test Plan

**Unit (pure, fast)**
- Due-date engine: interval arithmetic, DST/month boundaries, status thresholds
  (Upcoming → Schedule Needed → Due → Overdue).
- Interval override precedence: SYSTEM → CUSTOMER → LOCATION → ASSET.
- Maintenance Health score: bounds, weighting, degenerate inputs (0 assets).
- `nfc-core`: token mint/verify round-trip, MAC tampering rejection, truncation,
  tag lifecycle legal/illegal transitions.
- Customer serializers: internal notes never present in customer payloads.

**Integration (real PostgreSQL)**
- Tenant isolation: for each resource, an actor from org A gets 404 for org B's ids.
- RBAC matrix: every role × every capability, asserted against real handlers.
- Tag resolve: revoked / unassigned / wrong-tenant / forged MAC all denied and logged.
- Idempotency: the same key replayed concurrently yields exactly one service record.
- Immutability: no code path mutates a `ServiceRecord`; corrections supersede.
- Archive: archiving an asset preserves all history and tag events.
- Offline replay: a queued batch of 20 mixed events applies exactly once.

**Manual / E2E checklist** (documented in `docs/TEST-PLAN.md`)
- Rapid inventory: 10 assets created and tagged without leaving the screen.
- Technician: tap → correct asset loads → checklist → photos → complete → next.
- Completion gate: task cannot close with a missing required photo or checklist item.
- Customer tap: sees only customer-visible data, can report a problem.

**Not covered** (stated plainly): no load testing, no native NFC hardware testing
(no reader available in this environment — Web NFC paths are unit-tested against a
mocked transport), and no billing tests since billing is not implemented.

---

## 11. What the build actually found

Two real defects surfaced during implementation. Both are recorded here rather
than quietly fixed, because both are the kind of thing this document's §5 claims
the system prevents.

### 11.1 Internal roles could not read customers or locations

`org.read` lived only in the customer capability list. The internal roles are
composed upward from the technician list, which never included it, so the
Customers and Locations pages returned 500 for every member of staff while
working correctly for customers.

Caught by probing every route against a running build, not by the test suite —
the original permission tests asserted what roles must *not* have, and never
asserted that each role can reach the screens its own navigation exposes. Fixed
by granting `org.read` to internal roles (kept distinct from `org.manage`), and
covered by a test that walks the admin navigation and asserts the capability
behind each item.

### 11.2 A location manager could read a sibling restaurant

More serious. Every resource handler checked `canAccessOrganization` only. A
Customer Location Manager scoped to one restaurant therefore passed the check for
*any* asset in their organization — including other restaurants in the same
group. The list endpoints were correct (`tenantWhere` applies both dimensions);
only the by-id handlers were wrong, which is exactly the shape of bug that a
list-only test would miss.

`canAccessLocation` also contained a dead expression — `return Boolean(organizationId) || true` —
that always evaluated to `true`, which is how the gap survived reading.

Fixed by introducing `canAccessAsset` / `assertAsset`, which check organization
**and** location together, and routing all fifteen by-id handlers plus tag
resolution through it. Tag taps now get the location check in `resolveTap`, after
`nfc-core`'s tenant gate, since location scope is this application's concept
rather than the package's. Covered by regression tests at both the pure-function
and database levels, and re-verified live: the manager now gets 404 for a sibling
restaurant's asset and 200 for their own.

**The lesson recorded for future work:** "scope" here has always meant two
dimensions, and a check that reads plausibly while testing only one is the
failure mode to watch for. The remedy was to make the two-dimension check the
*only* convenient one to call.

