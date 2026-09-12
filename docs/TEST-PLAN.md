# Test Plan

```bash
npm test   # 106 tests across 4 files
```

Integration tests run against a real PostgreSQL database and create/tear down
their own tenants, so they are safe to run alongside seeded demo data.

---

## Automated coverage

### `tests/nfc-core.test.ts` — 25 tests
Token mint/verify round-trip; tampered token id rejected; wrong secret rejected;
malformed and unknown-version payloads; **the payload contains no tenant id**;
token ids unpredictable across 200 mints; lifecycle transitions legal and illegal;
a revoked tag can never return to life; only `ACTIVE` tags are readable; NDEF
carries exactly one URL record; QR encodes the identical payload; URL parsing and
foreign-URL rejection; resolution refuses forged signatures **before touching the
store**, plus unknown, revoked, unpaired and unauthorized tags — each logged; all
six denial reasons produce one identical message.

### `tests/engine.test.ts` — 31 tests
Override chain precedence and fallback; inactive/invalid plans ignored; due dates
anchored to actual performance; two services on the same day give the same due
date; **DST boundary does not shrink a 30-day interval**; leap year and year
rollover; new assets due immediately; every status threshold including grace
periods and visit suppression; urgency ordering; health score bounds, zero-asset
case, and self-explaining factors; proof requirements — complete, every missing
piece named, QR accepted, manual rejected when NFC required, optional items
ignored; content hash stable across photo reordering and sensitive to changes.

### `tests/permissions.test.ts` — 20 tests
Internal vs customer classification; **no customer role holds any tag-write or
revoke capability**; no customer role reads internal notes, verifies equipment or
manages schedules; limited staff genuinely limited; technician scope; `service.edit`
and `settings.manage` reserved to Super Admin; capability union across memberships;
every internal role can reach the screens its navigation exposes *(regression)*;
location scope — a manager confined to their own location, an owner across their
group, staff unrestricted, and out-of-scope refused as 404 *(regression)*;
serializers never emit internal notes and hide data-plate photos.

### `tests/integration.test.ts` — 30 tests
**Tenant isolation** — only own equipment returned; another tenant's id refused as
404 not 403; an empty scope matches nothing rather than everything; scope cannot be
widened by a client id; **a location manager cannot read a sibling restaurant in
their own group** *(regression)*; an unrestricted owner can; internal staff see all
tenants. **Passwords** — verify/reject, no plaintext in the hash, salted, malformed
hash rejected. **Idempotency** — replay returns the original without repeating work;
same key + different body is a conflict; no key means always execute; keys isolated
per actor. **Service** — immutable record written and schedule advanced with audit;
missing proof refused and **nothing written**; another tenant's equipment refused;
**history survives archiving**. **Tags** — unverified pairing refused; verified
pairing audited; cross-tenant pairing refused; replacement retains history and
revokes the old tag; a revoked tag stops resolving; an active tag resolves for an
authorized caller and is denied (and logged) for an outsider; unpair keeps history.

---

## Verified live against a running build

Beyond the automated suite, these were exercised end-to-end against the production
build with seeded data:

| Check | Result |
| --- | --- |
| Sign in as each of the five roles | 200 |
| Every customer, technician and admin page renders | all 200 |
| Location manager sees only their own location (16 of 19 assets) | ✓ |
| Location manager requesting another location explicitly | 404 |
| Location manager opening a sibling restaurant's asset | 404 *(this was a real bug; fixed)* |
| Location manager attempting `tags/mint` | 403 |
| Customer payloads contain no `technicianNotes` | ✓ |
| Internal staff resolving the same tag **do** see internal notes | ✓ |
| NFC tap resolves to the right asset | ✓ |
| Tap on an asset with an open task lands on the task | ✓ |
| Forged tag payload | 404, generic message |
| Signed-out tap preserves the token through sign-in | 307 → `/signin?next=/t/…` |
| Service completion with missing proof | 422, nine missing items named |
| Service completion with full proof | 201; schedule advanced, task closed, issue created, 2 photos stored, notifications sent, audit written |
| Same request replayed with the same idempotency key | Same record returned; **exactly one row in the database** |
| Offline batch replayed twice | `applied:1` then `duplicate:1`; exactly one issue created |

---

## Manual checklist (requires NFC hardware)

Not performed — no NFC reader was available in the build environment. Web NFC
paths are unit-tested against a mocked transport, so the physical read/write has
**not** been exercised on a real tag.

1. **Rapid inventory** — create 10 assets and tag each without leaving the screen;
   area and frequency persist between units.
2. **Write → verify → pair** — confirm pairing is refused if the read-back fails,
   and that the failure appears in the command center.
3. **Replace a damaged tag** — old revoked, new paired, history intact on the asset.
4. **Tap on iPhone** — iPhone XR/XS and later on iOS 14+ read NDEF URL tags with no
   app via Background Tag Reading, so the tap should raise a banner that opens
   `/t/<token>` in Safari. Confirm that, *and* confirm the QR fallback resolves to the
   identical record for older iPhones and for the cases where background reading does
   not fire (camera or Apple Pay active, some lock states).
5. **On-metal read range** — confirm a standard tag fails on a stainless door and an
   on-metal tag reads at arm's length on a condenser housing. See `docs/HARDWARE.md`.
6. **Airplane mode** — complete a service offline, confirm it appears in the queue on
   Profile, then restore signal and confirm exactly one record is created.

## Not covered

No load testing. No browser E2E automation. No billing tests (billing is not
implemented). No AI tests (no model is called anywhere).
