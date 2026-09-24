# @pmops/nfc-writer

Everything involved in physically putting a tag on a unit, in one place, with
its own tests.

- Talking to the phone's NFC radio (write, read back, lock).
- Explaining why a phone cannot, in words that say what to do instead.
- Running mint → write → read back → verify → link → lock in the one order
  that is safe, for both pairing a new tag and replacing a damaged one.

No React, no Next.js, no database, no `fetch` baked in. The radio comes in
through `TagWriter` and the server through `TagApi`, so every step can be
tested with fakes and a bug in tag writing cannot hide in a screen component.

## Running its tests on their own

```bash
npm run test:nfc-writer            # from the repo root; no database, no app setup
npx tsc -p packages/nfc-writer     # typechecks the module without the app's aliases
```

They also run as part of `npm test`.

## Using it

```ts
import { pairTagToUnit, pairPhaseLabel } from "@pmops/nfc-writer";
import { tagApi, tagWriter } from "@/lib/nfc/writer";

const { tagId, lockNote } = await pairTagToUnit({
  organizationId,
  unitId,              // an existing unit; the module never creates one
  lock: true,
  writer: tagWriter(),
  api: tagApi,
  onPhase: (phase) => setLabel(pairPhaseLabel(phase)),
});
```

`replaceUnitTag` takes the same options plus a `reason`.

## What it guarantees

| Rule | Why |
| --- | --- |
| Nothing is minted on a device that cannot write | No orphan tags in the database |
| A tag is only put on a unit that already exists | Tagging never creates units |
| The unit is linked only after the read-back verifies | An unverified tag on a cooler resolves to nothing, and the tech thinks it is covered |
| A failed write or read-back is reported to the server | The tag shows as failed, not as phantom stock |
| On replace, the old tag is untouched until the new one verifies | The unit is never left without a working tag |
| Locking happens last, after the link is committed | A locked tag pointing at nothing is scrap |
| A failed lock never undoes the link | An unlocked working tag beats an unpaired one |

Each row has a test in `tests/pair.test.ts`.

## Files

```
src/writer.ts    TagWriter interface, pickTagWriter, NfcUnsupportedError
src/web-nfc.ts   TagWriter for Web NFC (Chrome on Android)
src/blocker.ts   Why a browser cannot write, and what to tell the person
src/tag-api.ts   TagApi interface, and the HTTP version for /api/v1/tags/*
src/pair.ts      pairTagToUnit, replaceUnitTag, payloadFromReadBack
tests/           Fakes for the radio, the browser and the server
```

## Adding an iPhone writer later

No iOS browser can write NFC. When there is a native writer (a Core NFC bridge
in a wrapper app, for instance), implement `TagWriter` for it and put it first
in the list in `src/lib/nfc/writer.ts`:

```ts
const writers: TagWriter[] = [createNativeWriter(), createWebNfcWriter()];
```

For a Capacitor NFC plugin the mapping is direct: `isSupported` is
`Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(...)` (both
synchronous), `blocker` returns `null`, `write`/`readOnce` each open one
system NFC sheet, and `canLock`/`lock` wrap the plugin's make-read-only call.
`lock` must return a `LockOutcome` rather than throw.

`pickTagWriter` uses the first one that works on the device, so every tagging
screen picks it up without changing. The flow tests already run against a fake
writer, so a native writer only needs tests for its own bridge.
