# NFC Hardware — specification and sourcing

What to buy, why, and what will go wrong if you buy the obvious thing instead.

Everything here is grounded in two measurements taken from this codebase rather
than estimated: the actual NDEF payload size (`npx tsx scripts/ndef-size.ts`) and
the actual mounting surfaces in the equipment inventory.

> **Prices are order-of-magnitude and need verifying at purchase time.** I have no
> live pricing or stock data. Treat the ranges as "what to expect", not as quotes.

---

## 1. The short version

For one restaurant of ~50 assets:

| Item | Spec | Qty | Rough cost |
| --- | --- | --- | --- |
| **On-metal NFC tags** | NTAG213, ferrite-backed, 25–30mm | 55 (10% spares) | $0.50–1.20 ea → **$30–70** |
| **Rigid on-metal tags** | NTAG213 in PPS or epoxy, screw or 3M 300LSE | 10 (harsh spots) | $1.50–4.00 ea → **$15–40** |
| **QR labels** | Printed, laminated polyester | 55 | pennies → **~$10** |
| **Isopropyl alcohol + lint-free wipes** | 70–99% IPA | — | **~$15** |
| **Android phone** | NFC, Chrome 89+ | 1 per tech | $150–250 |
| *(optional)* **USB reader** | ACR122U or Identiv uTrust 3700F | 1 per office | $35–60 |

**Per-restaurant consumable cost is roughly $55–120.** Against a recurring
preventive-maintenance contract, tagging is rounding error — so buy the good tags.

---

## 2. Which chip: NTAG213

Measured, not guessed:

```
Tag URL   https://care.clearline.com/t/v1.t5MADX.lfr6cqcEXy6GWvVnsBKoUA.MyrF1g-bxqocccBG
NDEF message on chip: 78 bytes

  ✗ NTAG210    48 bytes   30 bytes short
  ✓ NTAG213   144 bytes   66 spare (54% used)
  ✓ NTAG215   504 bytes   426 spare
  ✓ NTAG216   888 bytes   810 spare
```

**Buy NTAG213.** It is the cheapest chip in common supply that fits, with 46%
headroom. NTAG215/216 cost more and buy you nothing — the token is deliberately
tiny because no customer data goes on the chip.

**NTAG210 does not fit.** It is sold cheaply and looks like a bargain; it will
silently fail to accept the write.

### One constraint on your domain name

The host is the only part of the URL whose length you control:

| Host | NDEF bytes | NTAG213 headroom |
| --- | --- | --- |
| `care.co` | 67 | 77 spare |
| `care.clearline.com` | 78 | 66 spare |
| `equipment.clearlinecare.example.com` | 95 | 49 spare |

Even a long subdomain fits comfortably. Re-run `scripts/ndef-size.ts` with your
real production host before placing a bulk order, and you will have proof rather
than confidence.

---

## 3. The thing that will actually bite you: metal

**Standard NFC tags do not work on metal.** The metal induces eddy currents that
oppose and absorb the reader's field, detuning the tag antenna. Read range
collapses to roughly zero. This is physics, not a quality problem — a $2 tag from
a good brand fails exactly as badly as a $0.15 one.

Now look at what this platform tags:

| Asset type | Count (seed) | Mounting surface |
| --- | --- | --- |
| Back bar cooler | 4 | Stainless steel |
| Reach-in refrigerator / freezer | 5 | Stainless steel |
| Prep table | 3 | Stainless steel |
| Walk-in cooler / freezer condenser | 3 | Painted sheet steel |
| HVAC unit | 2 | Galvanized sheet steel |
| Ice machine | 1 | Stainless steel |
| Water filtration | 1 | Plastic/composite head |

**18 of 19 assets are metal.** If you buy ordinary NTAG213 stickers — the default
result of searching for "NFC tags" — roughly 95% of your inventory will not read,
and you will discover this one asset at a time, on site, during a survey.

### What to buy instead

**On-metal tags** (also sold as "anti-metal", "ferrite", "hard tags"). These
sandwich a ferrite isolation layer between the antenna and the adhesive face,
which channels the magnetic flux and shields the antenna from the substrate.

- **Specify NTAG213 explicitly.** Many on-metal tags ship with older MIFARE
  Ultralight or proprietary chips that Web NFC will not write as NDEF.
- **25–30mm diameter** is the sweet spot. Smaller than ~20mm and read range on
  metal gets frustrating when a technician is holding a phone at arm's length
  behind a condenser.
- Expect **10–25mm read range** on metal versus 40–50mm off it. That is normal and
  perfectly workable for a deliberate tap.
- Budget roughly **3–5× the price of a standard tag**. Worth every cent.

Keep a small quantity of **standard (non-metal) tags** for the plastic and
composite assets — water filtration heads, some beverage equipment.

---

## 4. Form factor by environment

Restaurants are genuinely hostile to adhesive labels. Match the tag to the spot.

### Kitchen line and bar — thin on-metal label
Stainless fronts and sides. A 0.4–0.8mm ferrite PET label is unobtrusive and
survives wiping. **Surface prep is not optional**: a kitchen stainless panel
carries an invisible grease film that will defeat any adhesive. Wipe with 70–99%
isopropyl alcohol and let it flash off before applying.

### Walk-in cooler and freezer — rigid encapsulated tag
Freezers run around −18°C with repeated frost and condensation cycling. Standard
acrylic adhesives need to be applied above ~10°C to wet out properly, and
condensation gets under the edge of a label.

- Use a **rigid PPS or epoxy-encapsulated** on-metal tag.
- Apply it in a **warm area if possible**, or on the door frame exterior rather
  than inside the box.
- Specify an adhesive rated for low temperature (**3M 300LSE family** — 9495LE,
  9472LE) or use a **screw-mounted** tag.

### Condenser units — screw-mount or cable tie
The worst case. Hot discharge air, heavy grease and dust accumulation, and the
surface is often unpainted and rough. Adhesive loses here eventually.

- **Mechanically fasten** wherever there is an existing screw or a panel lip:
  a rigid tag with a mounting hole, or a cable-tie tag on a guard.
- Mount it **away from the discharge airflow** and where it is reachable without
  the ladder — a technician holding a phone one-handed on a step ladder will not
  fight for a tap.

### HVAC — rigid on-metal, near the access panel
Galvanized sheet steel, often roof or basement mounted. Put the tag at the filter
access panel, which is where the work happens.

### Adhesive reference

| Condition | Adhesive |
| --- | --- |
| General stainless, ambient | **3M 467MP / 468MP** (200MP acrylic) — high temp, strong on steel |
| Low surface energy plastics, cold | **3M 300LSE** (9495LE / 9472LE) |
| Greasy, rough, hot, or high-value | **Don't use adhesive.** Screw or cable tie. |

---

## 5. Phones — and an important correction about iPhone

### Technicians: Android, non-negotiable

**Writing tags from the browser requires Web NFC, which is Chrome on Android
only.** Not Safari, not iOS Chrome (which is Safari underneath), not desktop.

- Any current mid-range Android with NFC, **Chrome 89+**.
- Web NFC requires **HTTPS** — it will not work over plain HTTP, including on a
  LAN address. Plan for a real certificate in the field.
- **Antenna placement varies** by model and is usually the upper third of the
  back. Tell technicians where their specific phone's antenna is; "tap it
  anywhere" produces failed reads and a belief that the system is unreliable.

### Customers: iPhone works, and better than I first said

I under-described this in the earlier test plan. **iPhone XR/XS and later, on
iOS 14+, read NDEF URL tags natively with no app installed.** Background Tag
Reading raises a notification banner; tapping it opens the URL in Safari, which
lands on `/t/<token>` and resolves exactly as an Android tap does.

So the **customer tap experience works on both platforms**. What iPhone cannot do
is scan from inside a web page or write a tag — both of which are technician
operations, and both of which are Android-only regardless.

Caveats worth knowing before you promise it to a customer:
- iPhone 7/8/X and earlier need a native app to scan.
- Background reading does not fire while the camera or Apple Pay is active, and
  behaviour varies with lock state.
- It is a notification the user must tap, not an instant page load.

Verify on the actual devices your customers carry before making it a selling
point. The QR fallback covers every one of these cases and needs no explanation.

### Bulk encoding (optional)

A USB PC/SC reader — **ACR122U** (~$35–45, ubiquitous, somewhat dated) or
**Identiv uTrust 3700F** (~$50–60, better behaved) — lets you encode a batch of
tags at a desk before a survey instead of one at a time on site. Requires a small
local bridge, which is not built (see *Not built* below).

---

## 6. Lock the tags at pairing

An NDEF tag ships writable by anyone with a phone. Without locking, a person who
can touch the tag can rewrite it to point anywhere.

NTAG213 offers two protections:

- **Static and dynamic lock bits** — make the NDEF data permanently read-only.
  **Irreversible.** A locked tag can never be reused on another asset, which is
  the correct trade: the platform's replacement flow revokes and re-tags anyway,
  and the revoked tag's history is retained server-side.
- **32-bit password (`PWD_AUTH`)** — can gate writes while leaving reads open.
  Reversible, but you now have a key to manage across every tag in the field.

**Recommendation: lock after the verify step, do not use passwords.** Locking is
simpler, has no key-management burden, and the economics are trivial — you are
protecting a recurring service contract with a tag that costs under a dollar.

Read access must stay open, because customers tap these.

The transport interface already carries this: `NfcTransport.write()` accepts
`{ lockReadOnly }` in `packages/nfc-core/src/ports.ts`. The Web NFC implementation
does not yet call it — Chrome exposes `NDEFReader.makeReadOnly()`, which needs
verifying against your target Chrome version before being wired in.

---

## 7. Do not build anything on the tag UID

Every NTAG has a factory-programmed 7-byte UID. It is tempting to treat it as
proof of authenticity. **It is not.** "Magic" tags with writable UIDs are cheap
and widely sold, so a UID can be cloned.

This platform already handles that correctly, and the reasoning is worth keeping
explicit: security comes from the **signed server-resolved token plus session-based
authorization**, never from the tag asserting anything about itself. A cloned tag
in the wrong hands resolves to nothing, because the server checks who is asking.

The `Tag.hardwareUid` column exists to record the UID as a **tamper signal** — a
UID that changes on a tag that was never replaced is worth investigating. Two
things to know before relying on it:

- **Web NFC does not expose the UID**, deliberately, for privacy. You can only
  capture it via a native app or a USB reader.
- It is a signal, not a check. Never gate access on it.

---

## 8. A sensible pilot order

Before committing to a fleet, buy small and prove it on your actual equipment:

1. **10 × on-metal NTAG213, 25–30mm, thin label** — the workhorse.
2. **5 × rigid on-metal NTAG213**, PPS or epoxy, with a mounting hole.
3. **5 × standard NTAG213** — for plastic assets, and as the control that
   demonstrates the on-metal difference to anyone who doubts it.
4. **1 × Android phone** with Chrome 89+.

Then run the **manual checklist in `docs/TEST-PLAN.md`** against one real
restaurant. Specifically confirm, on your own equipment:

- A standard tag on a stainless door genuinely fails (this is the test that
  justifies the whole on-metal line item to whoever signs the purchase order).
- An on-metal tag reads reliably at arm's length on a condenser housing.
- A tag survives one full shift and a washdown before you order 500.
- A freezer-mounted tag reads after a frost cycle.

---

## Not built

Stated plainly, so nobody discovers it mid-deployment:

- **`makeReadOnly()` is not wired into the write flow.** The port accepts the
  option; the Web NFC adapter ignores it. Tags written today stay writable.
- **No USB reader bridge.** Bulk desk encoding needs a local helper that does not
  exist yet.
- **No UID capture**, since Web NFC cannot provide it.
- **Physical read/write has never been exercised on a real tag** in this build —
  no NFC hardware was available. The Web NFC paths are unit-tested against a
  mocked transport only.
