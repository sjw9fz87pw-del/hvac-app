# @pmops/nfc-core

Reusable NFC tag domain: secure identifier minting and verification, the tag
lifecycle state machine, server-side tap resolution, and QR fallback encoding.

**Zero dependencies.** Node standard library only — no Next.js, no Prisma, no
HTTP framework. Persistence and auditing are supplied by the host through the
`TagStore` / `TagAuditSink` ports, and the physical radio through `NfcTransport`.

## Why it is a separate package

So that this application is not the only thing that can use it. If an existing
NFC implementation (e.g. CCG Ops Hub) is reconciled with this one, the seam is
this package's public interface — either its internals are replaced, or the host
app switches its import. Nothing outside `src/lib/nfc/*` in the host application
knows how a tag is encoded.

## What is written to a tag

A single NDEF URL record:

```
https://<host>/t/v1.<tenantHint>.<tokenId>.<mac>
```

- `tokenId` — 128 random bits. Not a database id, not a sequence.
- `mac` — truncated HMAC-SHA256 keyed by a server-held secret; forged or mistyped
  tags are rejected before any database lookup.
- `tenantHint` — a non-reversible 6-char hash used only for lookup sharding and
  rate limiting. It identifies nothing on its own.

No customer name, location, equipment, model, or serial number is ever written
to the tag. Everything is resolved server-side, after authentication.

## Usage

```ts
import { mintTagToken, buildTagUrl, resolveTagPayload } from "@pmops/nfc-core";

const token = mintTagToken(process.env.NFC_TAG_SECRET!, { tenantId: org.id });
const url = buildTagUrl(process.env.APP_BASE_URL!, token.payload); // write this to the tag

const outcome = await resolveTagPayload(payload, {
  secret, store, audit,
  canAccessTenant: (id) => actor.orgScope.has(id), // from the session, never the request
});
```

## Resolution checks (all server-side, on every read)

1. Signature valid, 2. tag exists, 3. tag is `ACTIVE`, 4. tag is currently paired,
5. tenant binding intact, 6. **caller is authorized for that tenant**.

Every denial returns one generic message so valid tags cannot be enumerated, and
every read — allowed or denied — is written to the audit sink.

## How it is consumed here

This directory is a self-contained module, not an npm workspace. The host app
imports `@pmops/nfc-core`, which resolves through the `tsconfig.json` path alias
to `src/index.ts`, and Vitest resolves it the same way.

The workspace wiring was removed deliberately: Netlify's monorepo detection
treats any workspace package as the deployable application and resolves the
build output inside it, which breaks deployment. Nothing about the module's
reusability depends on that wiring — it still has zero dependencies, no
framework coupling, and its own `package.json` declaring its identity. Another
service consumes it by copying this directory or publishing it from here.
