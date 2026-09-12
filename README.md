# Equipment Care

The operating system for recurring restaurant equipment preventive care:
physical service + NFC identity + permanent equipment records + preventive
scheduling + technician proof + restaurant visibility + issue routing.

Not an equipment database. The software is the restaurant's permanent equipment
record, maintenance history, proof-of-service system, scheduling platform and
issue-reporting system.

---

## Start here

- **[docs/DISCOVERY.md](docs/DISCOVERY.md)** — what existed before this build (short answer:
  nothing but a README; the CCG NFC system referenced in the brief is **not reachable
  from this repository or account** — see §1.2), target architecture, data model, roles,
  NFC plan, screen map, phases, risks and test plan.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how it is built and why.
- **[docs/API.md](docs/API.md)** — the REST surface.
- **[docs/HARDWARE.md](docs/HARDWARE.md)** — which NFC tags to buy and why the obvious
  choice fails on 95% of restaurant equipment.
- **[docs/TEST-PLAN.md](docs/TEST-PLAN.md)** — what is tested automatically, and the manual checklist.

## Run it

```bash
npm install
cp .env.example .env          # set DATABASE_URL, NFC_TAG_SECRET, SESSION_SECRET, APP_BASE_URL
npx prisma db push
npm run db:seed
npm run dev                   # http://localhost:3000
```

Requires PostgreSQL 14+ and Node 20+.

### Demo accounts

Seeded with a realistic restaurant group (Mona, two locations, 19 assets, tags,
service history, issues). Password for all: `password123`.

| Email | Role | Lands on |
| --- | --- | --- |
| `admin@clearline.example` | Super Admin | Command center |
| `manager@clearline.example` | Service Manager | Command center |
| `tech@clearline.example` | Technician | Today |
| `owner@monagroup.example` | Customer Org Owner | All locations |
| `gm@monagroup.example` | Customer Location Manager | Mona only |

## Test

```bash
npm test          # 106 tests: unit + integration against a real PostgreSQL database
npm run typecheck
npm run build
```

Integration tests create and tear down their own tenants, so they can run against
the same database as the seed data.

## Layout

```
packages/nfc-core/    Framework-free NFC domain — zero dependencies, shareable across services
prisma/               Schema (40 tables) and seed
src/lib/auth/         Sessions, password hashing, capabilities, tenant scope
src/lib/maintenance/  Due-date engine, scheduling, completion + proof gates
src/lib/nfc/          Prisma adapters over @pmops/nfc-core
src/lib/sync/         Idempotency and the offline queue
src/app/(customer)/   Home · Equipment · Service · Issues · Account
src/app/(tech)/       Today · Visits · Scan · Activity · Profile
src/app/(admin)/      Dashboard · Customers · Locations · Equipment · Schedule ·
                      Technicians · Issues · Reports · NFC · Settings
src/app/t/[token]/    Where an NFC tap or QR scan lands
src/app/api/v1/       REST API
```

## The properties that matter

- **Tenant isolation** is derived from the session's membership rows. A client-supplied
  organization or location id can only narrow a query within that scope; anything outside
  it returns **404**, never 403 — a 403 would confirm another customer's record exists.
  Location-scoped managers are confined to their own restaurants *within* their own group.
- **Tags carry no customer data.** A random 128-bit id plus a truncated HMAC. Everything
  resolves server-side after the caller is authenticated and authorized, and every read —
  allowed or denied — is logged.
- **Service records are immutable.** Corrections write a superseding record; the original
  is never edited or deleted. Archiving an asset never touches its history.
- **Incomplete work is refused, not quietly closed.** Proof requirements are configurable
  per service type and enforced server-side.
- **Every write the field app makes is idempotent**, which is what makes the offline queue
  safe on bad restaurant Wi-Fi.
- **"Maintenance Health" is not a mechanical-health claim.** It is computed only from
  service punctuality, overdue items and open issues, and the UI says so.

## Not built

Stated plainly rather than implied: PDF rendering and emailed reports (the report is
built as structured data and is renderer-ready), billing (schema only), AI extraction
(table exists and is confirmation-gated; no model is called), and sensor ingestion
(tables exist, nothing writes to them).
