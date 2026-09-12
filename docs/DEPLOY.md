# Deployment

**Live: https://clearline-equipment-care.netlify.app**

The app is deployed and serving. One manual step remains before it is usable:
setting four environment variables, which must be done in the Netlify UI (see
*Remaining step*).

---

## Current state

| | |
| --- | --- |
| Netlify project | `clearline-equipment-care` (`4a7696fd-9a4b-480e-9c17-c718c2d1cfce`) |
| Build | **Passing** |
| Routes | Serving — `/signin` renders, server components and API routes work |
| Database | **Provisioned and migrated.** `POST /api/v1/auth/login` queries `User` and correctly returns 401, which only happens if the schema exists |
| Data | **Empty** — not yet seeded |
| Dependency audit | **0 vulnerabilities** |

A second project, `clearline-equipment-care-misdetected`, is a dead first
attempt kept only so its deploy history stays readable. It can be deleted.

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

## Remaining step: environment variables

Four variables must be set, and the MCP tooling available here reports
`Environment variable upserted` while nothing actually persists — verified by
reading them back (empty) and by two live tests. **They have to be set in the
Netlify UI**: Project configuration → Environment variables.

Generate fresh values — nothing depends on any earlier ones, since no tag has
been written yet:

```bash
node -e "const c=require('crypto');for(const k of ['NFC_TAG_SECRET','SESSION_SECRET','JOB_TOKEN'])console.log(k+'='+c.randomBytes(48).toString('base64url'))"
```

| Variable | Value | Notes |
| --- | --- | --- |
| `NFC_TAG_SECRET` | generated, ≥32 chars | **Back this up.** Every tag identifier is signed with it; losing it makes every tag in the field unresolvable |
| `SESSION_SECRET` | generated | |
| `JOB_TOKEN` | generated | Authenticates the nightly job and the bootstrap endpoint |
| `APP_BASE_URL` | `https://clearline-equipment-care.netlify.app` | Used to build tag URLs |

`DATABASE_URL` is deliberately **not** set — Netlify DB provisions it and
`resolveDatabaseUrl()` picks it up. Setting it would override the per-branch
database that keeps deploy previews off production data.

Redeploy after setting them.

## Then seed the demo data

Once, with the `JOB_TOKEN` you set:

```bash
curl -X POST https://clearline-equipment-care.netlify.app/api/v1/jobs/bootstrap \
  -H "x-job-token: YOUR_JOB_TOKEN" -H 'content-type: application/json' -d '{}'
```

The response carries a generated password **once** and is never logged. It is
shared by all five demo accounts (`admin@clearline.example`,
`manager@clearline.example`, `tech@clearline.example`, `owner@monagroup.example`,
`gm@monagroup.example`). The endpoint refuses to run against a populated
database unless sent `{"reset": true}`.

The development password `password123` cannot reach this deployment: the CLI
seed refuses to run when `NODE_ENV=production` or `NETLIFY` is set.

## Then verify

In this order:

1. `/signin` renders, and signing in as `owner@monagroup.example` lands on `/home`
2. `gm@monagroup.example` sees only Mona — 16 of 19 assets — and gets 404 for a
   Mona East asset
3. `/admin` renders the command center for `admin@clearline.example`
4. A photo upload round-trips through Netlify Blobs
5. `/t/<payload>` resolves a tag (requires `NFC_TAG_SECRET` to match whatever
   signed the tag)

## Scheduled job

`netlify/functions/scheduled-refresh.ts` runs at 07:00 UTC daily and calls
`/api/v1/jobs/refresh`, which advances schedule statuses and sends the overdue
digest. Both operations are idempotent, so a missed or doubled run is harmless.
It needs `JOB_TOKEN` and `APP_BASE_URL` to be set.
