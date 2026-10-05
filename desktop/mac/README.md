# Clearline for Mac

The site in its own window, with the USB NFC reader built in. Made for the
office Mac mini: open the app, go to **NFC**, and pair or scan tags on the
reader. No browser, no helper to keep running.

Every screen is the live site, so deploying the site updates the app. The app
adds one thing: `window.webkit.messageHandlers.deskReader`, which the site's
`desk-reader` TagWriter (`packages/nfc-writer/src/desk-reader.ts`) finds and
uses. The reader code (`Sources/DeskReader.swift`) is a port of
`packages/nfc-writer/desk-reader/desk_reader.py` and answers with the same JSON.

## Build and install

Needs only the Command Line Tools (`xcode-select --install`), not Xcode.

```bash
desktop/mac/build.sh --install     # builds, then copies to ~/Applications
```

Any PC/SC reader works with the driver macOS ships: ACR122U and clones,
ACR1252, ACR1552, SCL3711, Identiv uTrust.

## Using it

1. Plug in the reader and open **Clearline**. Sign in once; it stays signed in.
2. **NFC** shows *USB reader: Connected*.
3. **Assets without tags**: put a blank tag on the reader, press **Pair with
   reader** on the unit. It is written, read back, verified, linked and (if
   ticked) locked. Next tag, next unit.
4. **Scan a tag** opens whatever tag is on the reader.

A unit's own page pairs through the reader too.

## Settings

Point it at a preview or a local build:

```bash
defaults write com.clearline.desk AppURL http://localhost:3000/admin/nfc
defaults delete com.clearline.desk AppURL      # back to the live site
```

Links to other sites open in the default browser. Only the app's own site
(and localhost) can use the reader.

## Limits

- The signature is ad hoc, which is fine on the Mac it was built on. To hand
  the app to other Macs, sign it with a Developer ID and notarize it.
- The reader code is exercised against a real ACR122U and tag (write, read
  back, uid check). Locking has only been run against the simulated tag in
  `desk-reader/test_desk_reader.py`, since it is permanent.
