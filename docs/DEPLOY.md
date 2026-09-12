# Deployment

**Live and fully configured: https://clearline-equipment-care.netlify.app**

Readiness at a glance: `GET /api/v1/health` → `{"ready": true, "missing": []}`

---

## Current state

| | |
| --- | --- |
| Netlify project | `clearline-equipment-care` (`4a7696fd-9a4b-480e-9c17-c718c2d1cfce`) |
| Build | Passing, 0 dependency vulnerabilities |
| Database | Provisioned and migrated (40 tables) |
| Data | Seeded — 19 assets, 15 tags, 14 service records, 2 issues |
| Configuration | Complete |
| Scheduled job | Registered, 07:00 UTC daily |

### Verified against the live site

| Check | Result |
| --- | --- |
| All five roles sign in | 200 |
| Customer, technician and admin pages render | all 200 |
| Location manager sees only Mona | 16 of 19 assets |
| Location manager opens a Mona East asset | **404** |
| Location manager attempts `tags/mint` | **403** |
| Customer payloads contain `technicianNotes` | **no** |
| Technician resolving the same tag sees internal notes | yes |
| Signed tag resolves to the right asset | Main Water Filtration · Mona · Basement |
| Forged tag payload | **404**, generic message |
| Tap while signed out | 307 → `/signin?next=/t/…`, preserving the tap |
| Tap as owner | 307 → the equipment passport |
| Maintenance Health | 77 GOOD from 19 assets / 7 overdue / 2 issues |

## Demo accounts

One generated password, shared by all five. It was returned once by the
bootstrap endpoint and is not recoverable — re-run bootstrap with
`{"reset": true}` to issue a new one.

| Email | Role | Sees |
| --- | --- | --- |
| `admin@clearline.example` | Super Admin | Everything |
| `manager@clearline.example` | Service Manager | Command center |
| `tech@clearline.example` | Technician | Today / visits |
| `owner@monagroup.example` | Customer Org Owner | Both locations |
| `gm@monagroup.example` | Customer Location Manager | Mona only |

## Configuration

Only two variables have to be set by hand. `SESSION_SECRET` was a requirement I
invented — nothing reads it, because sessions use a random token hashed into the
database. `APP_BASE_URL` now falls back to Netlify's own `URL`, and
`DATABASE_URL` is deliberately unset so Netlify DB's per-branch database is used,
which keeps deploy previews off production data.

| Variable | Why |
| --- | --- |
| `NFC_TAG_SECRET` | Signs every tag identifier. **Back it up** — losing it makes every tag in the field unresolvable |
| `JOB_TOKEN` | Authenticates the nightly job and the bootstrap endpoint |

> **Rotate `NFC_TAG_SECRET` before writing real tags.** The current value was
> generated during this session and has appeared in a chat transcript. Nothing
> of value depends on it yet — the 15 seeded tags are demo data — so rotating now
> costs nothing and later costs every tag in the field:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
> ```
>
> Set it in Netlify, redeploy, then re-run bootstrap with `{"reset": true}` so
> the demo tags are re-minted under the new key.

### A trap worth knowing

Setting environment variables through the MCP tooling **silently does nothing**
when `newVarContext` or `newVarScopes` are supplied — it still reports
`Environment variable upserted`. Only the minimal form persists:
`{siteId, upsertEnvVar, envVarKey, envVarValue}`. This cost several deploys to
notice, which is why `/api/v1/health` now exists: it reports which configuration
is actually present in the running function, as booleans only.

## What was blocking it


Netlify refuses to build Next.js versions carrying **CVE-2025-55182** (RCE in
the React flight protocol). That single fact explains every symptom seen while
debugging:

- The build failed **only** when the Next.js runtime plugin was active, because
  the runtime performs the version check.
- Without the plugin the build passed, but every route 404'd, because nothing
  was there to serve them.
- `netlify build --offline` passed locally, because the check needs network.

15.5.4 was carrying not one advisory but **31**, three critical. The floor
across all of them was 15.5.24. Upgraded to **15.5.25**, the latest backport on
the 15.5 line, which clears every one without a major-version jump.

Four further defects were found and fixed along the way; see the commit history
from `Make the app deployable` onward. The two-step reproduction that found them:

```bash
# Clean room — the committed tree only. No .env, no stale node_modules.
git archive HEAD | tar -x -C /tmp/cleanroom && cd /tmp/cleanroom && npm ci
npm run build              # catches what your working directory hides
npx netlify build --offline # Netlify's own pipeline, plugins included
```

The working directory lies: Next loads `.env` from disk regardless of the shell,
so `env -u DATABASE_URL` does not reproduce a missing-database build.

## Operations

- **Readiness:** `GET /api/v1/health` — database, schema, seeded, and missing config.
- **Re-seed:** `POST /api/v1/jobs/bootstrap` with `x-job-token`, body `{"reset": true}`.
  Refuses to wipe a populated database without it, and returns the new password once.
- **Nightly job:** `netlify/functions/scheduled-refresh.ts` at 07:00 UTC calls
  `/api/v1/jobs/refresh`, advancing schedule statuses and sending the overdue
  digest. Both are idempotent, so a missed or doubled run is harmless.
- **Reproduce a build failure locally** — the working directory lies, because Next
  loads `.env` from disk regardless of the shell:

  ```bash
  git archive HEAD | tar -x -C /tmp/cleanroom && cd /tmp/cleanroom && npm ci
  npm run build
  npx netlify build --offline   # Netlify's own pipeline, plugins included
  ```

A second project, `clearline-equipment-care-misdetected`, is a dead first attempt
kept only so its deploy history stays readable. It can be deleted.
