# Deployment

Target: Netlify. **Status: not yet deploying successfully.** What is verified,
what is fixed, and what is still blocked is recorded below rather than implied.

---

## Current state

| | |
| --- | --- |
| Netlify project | `clearline-equipment-care` (`4a7696fd-9a4b-480e-9c17-c718c2d1cfce`) |
| URL | https://clearline-equipment-care.netlify.app |
| Build | **Failing** — `Failed during stage 'building site': Build script returned non-zero exit code: 2` |
| Environment variables | Set: `NFC_TAG_SECRET`, `SESSION_SECRET`, `JOB_TOKEN` (all secret), `APP_BASE_URL` |
| Database | Not provisioned — every deploy shows `database_branch_id: null` |

A second project, `clearline-equipment-care-misdetected`, is a dead first
attempt kept only so its deploy history stays readable. It can be deleted.

## What is verified to work

Reproducing the deploy faithfully takes two steps, because the working
directory lies:

```bash
# 1. Clean-room build from the committed tree only — no .env, no stale
#    node_modules. This is what the deploy actually sees.
git archive HEAD | tar -x -C /tmp/cleanroom
cd /tmp/cleanroom && npm ci && npm run build          # passes

# 2. Netlify's own pipeline, plugins included.
npx netlify build --offline                            # "Netlify Build Complete"
```

Both pass. `npm test` (106 tests) and `npm run typecheck` pass.

## Fixed along the way

Four real defects, each found by a reproduction rather than a guess:

1. **`@netlify/functions` was imported but never installed.** The scheduled
   function imports a type from it. Local typechecking passed only because
   `netlify-cli` pulled it in transitively — removing that made the local check
   faithful again.
2. **`packagePath: packages/nfc-core`.** `netlify build --dry` showed Netlify's
   monorepo detection treating the NFC workspace package as the deployable app,
   resolving build output to `packages/nfc-core/.next`. Removing the npm
   workspace wiring fixed it; the package still resolves through the tsconfig
   path alias, which is how it always actually resolved.
3. **`datasources: { db: { url: undefined } }`** threw in the Prisma
   constructor, which runs at module load and therefore during `next build`.
   Invisible locally because Next loads `.env` from disk regardless of the shell
   environment, and `.env` is gitignored.
4. **`publish = ".next"` without the runtime** published build output as static
   files, 404ing every route.

## What is still blocked

With `[[plugins]] package = "@netlify/plugin-nextjs"` present, the build fails.
Without it, the build succeeds but every route 404s because the runtime never
applies. Ruled out by direct test: the workspace misdetection, the Prisma
constructor, `[functions] included_files`, `base`, `@netlify/database`, and
whether the plugin is a devDependency.

**The blocker is the build log.** Netlify exposes it only in the web UI, which
this environment cannot reach, and a failed deploy publishes nothing — so the
trick of writing the log to a static asset works only for builds that succeed.

### To unblock it

Either is enough:

1. **Open the build log** at
   `https://app.netlify.com/projects/clearline-equipment-care/deploys` and share
   the error from the failing deploy. The clean-room reproduction above makes a
   fix quick once the message is known.
2. **Connect the GitHub repository** to the Netlify project (Project
   configuration → Build & deploy → Link repository, branch
   `claude/restaurant-maintenance-platform-dydlsy`). Git-based builds are the
   supported path, deploy on push, and surface logs normally.

## After the build succeeds

1. **Provision the database.** `@netlify/database` provisions Postgres on
   deploy; confirm `database_branch_id` is no longer null. The initial migration
   in `netlify/database/migrations/001_initial/` (40 tables) is applied
   automatically before a production deploy is published, and a failure blocks
   publishing.

2. **Seed demo data** — once, with a generated password:

   ```bash
   curl -X POST https://clearline-equipment-care.netlify.app/api/v1/jobs/bootstrap \
     -H "x-job-token: $JOB_TOKEN" -H 'content-type: application/json' -d '{}'
   ```

   The response carries the password **once** and is not logged anywhere. The
   endpoint refuses to run against a populated database unless sent
   `{"reset": true}`.

3. **Verify**, in this order: `/signin`, sign in, `/home` renders the dashboard,
   `/admin` renders the command center, a photo upload round-trips through
   Netlify Blobs, and a tag resolves at `/t/<payload>`.

## Secrets

`NFC_TAG_SECRET`, `SESSION_SECRET` and `JOB_TOKEN` were generated at deploy time
and stored as secret Netlify environment variables. They are readable in the
Netlify UI and were never written to the repository.

**`NFC_TAG_SECRET` is the one that matters.** Every tag identifier is signed
with it, so rotating or losing it makes every tag in the field unresolvable.
Back it up somewhere durable before tags are written.
