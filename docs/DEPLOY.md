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

One generated password for the owner account, returned once by the setup
endpoint and not recoverable afterwards.

```bash
curl -X POST https://<host>/api/v1/jobs/bootstrap \
  -H "x-job-token: $JOB_TOKEN" -H "content-type: application/json" \
  -d '{"ownerEmail": "owner@example.com", "ownerName": "Owner"}'
```

Setup runs **only against an empty database**. Once a service company exists the
endpoint returns 409 and changes nothing — there is no reset or force flag, by
design. Equipment passports and service records are immutable, so the only way
to lose them would be a call like this one; reinstalling is therefore a code
change and a deploy, not a parameter. A leaked `JOB_TOKEN` cannot destroy data.

The owner lands with the `SUPER_ADMIN` role. Change the password from Account
straight after the first sign-in, then add the rest of the team from People.

## Configuration

### Email (optional)

Invitations work without it: the admin screen shows a single-use link to pass on
by hand. Set both of these and they go out by email instead — no code change.

Two routes, whichever is configured wins:

**SMTP — sends as your own mailbox, no DNS setup.**

| Variable | Value |
| --- | --- |
| `SMTP_USER` | The mailbox to send from, e.g. `you@gmail.com` |
| `SMTP_PASSWORD` | An app password, not the account password |
| `SMTP_HOST` | Optional, defaults to `smtp.gmail.com` |
| `SMTP_PORT` | Optional, defaults to `465` |

Gmail requires 2-Step Verification before it will issue an app password
(Google Account → Security → App passwords). Sending limits are around 500
a day, which is far beyond what invitations need.

**Resend — needs a verified domain, better at volume.**

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | An API key from resend.com |
| `EMAIL_FROM` | A sender on a domain verified there |

`REPLY_TO` overrides where replies go; it defaults to the SMTP mailbox. With
neither route configured, `emailConfigured()` is false and nothing is sent.

Invitation and reset links are signed rather than stored, so there is no table
to migrate. The signature covers the user's current password hash, which is what
makes a link single-use: setting a password invalidates every link issued before
it. The signing key is derived from `NFC_TAG_SECRET` with a domain separator, so
rotating that value also invalidates any link still outstanding.



Only two variables have to be set by hand. `SESSION_SECRET` was a requirement I
invented — nothing reads it, because sessions use a random token hashed into the
database. `APP_BASE_URL` now falls back to Netlify's own `URL`, and
`DATABASE_URL` is deliberately unset so Netlify DB's per-branch database is used,
which keeps deploy previews off production data.

| Variable | Why |
| --- | --- |
| `NFC_TAG_SECRET` | Signs every tag identifier. **Back it up** — losing it makes every tag in the field unresolvable |
| `JOB_TOKEN` | Authenticates the nightly job and the bootstrap endpoint |

> **`NFC_TAG_SECRET` has been rotated** (September 2026), before any real tag
> was written. Do not rotate it again casually: every tag already written is
> signed with it, and a new secret makes every one of them stop resolving. If it
> ever leaks, rotate it and re-pair every tag in the field.

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
npx -y netlify-cli build --offline # Netlify's own pipeline, plugins included
```

The working directory lies: Next loads `.env` from disk regardless of the shell,
so `env -u DATABASE_URL` does not reproduce a missing-database build.

## Operations

- **Readiness:** `GET /api/v1/health` — database, schema, seeded, missing config,
  each email setting, and when the nightly job last ran (`nightlyJob.current` is
  false if it has missed two runs). Booleans and a timestamp only; no values.
- **Weekly check:** a scheduled Claude routine reads the health endpoint and the
  main pages every week and reports anything wrong. It never changes anything.
- **First install only:** `POST /api/v1/jobs/bootstrap` with `x-job-token`. It
  refuses with 409 once any data exists — there is no reset, by design.
- **Nightly job:** `netlify/functions/scheduled-refresh.ts` at 07:00 UTC calls
  `/api/v1/jobs/refresh`, advancing schedule statuses and sending the overdue
  digest. Both are idempotent, so a missed or doubled run is harmless. Each run
  is recorded so the health check can tell a stopped job from a quiet one.
- **Schema changes need a migration.** Production is never `db push`ed — Netlify
  applies only the SQL under `netlify/database/migrations`. `tests/migrations.test.ts`
  fails, printing the SQL to add, if `schema.prisma` gets ahead of them.
- **Reproduce a build failure locally** — the working directory lies, because Next
  loads `.env` from disk regardless of the shell:

  ```bash
  git archive HEAD | tar -x -C /tmp/cleanroom && cd /tmp/cleanroom && npm ci
  npm run build
  npx -y netlify-cli build --offline   # Netlify's own pipeline, plugins included
  ```

A second project, `clearline-equipment-care-misdetected`, is a dead first attempt
kept only so its deploy history stays readable. It can be deleted.
