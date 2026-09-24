# iPhone app

No iOS browser can write NFC tags. Apple exposes tag writing only to installed
apps. So there is an iPhone app, and it is deliberately thin: a native shell
(Capacitor) that loads the live site and adds one thing, Core NFC. Every
screen, rule and API is the same code the browser runs. When the site is
deployed, the app has it too, and there is no second codebase to keep in step.

## What it can do that Safari cannot

| | Safari on iPhone | iPhone app |
| --- | --- | --- |
| Open a tag's link by tapping it | Yes (opens Safari) | Yes (opens the app, signed in) |
| Write a tag | No | Yes |
| Read a tag back to verify it | No | Yes |
| Lock a tag permanently | No | Yes |
| Scan a tag from inside a screen | No | Yes |

Pairing takes one tap. The write, the read-back and the lock all happen while
the phone is held on the tag, because the reader sheet stays open between
those steps. The server checks the read-back and links the unit in the
meantime.

## How it fits together

```
ios/App/App/TagNfcPlugin.swift   Core NFC: write, read, lock (the "TagNfc" plugin)
ios/App/App/AppViewController    registers the plugin; opens tag links in the app
src/lib/nfc/native-ios.ts        TagWriter on top of TagNfc
src/lib/nfc/capacitor.ts         detects "running in the iPhone app"
src/lib/nfc/writer.ts            lists the native writer first, then Web NFC
capacitor.config.ts              which site the app loads (CAP_SERVER_URL)
```

The tagging flow in `@pmops/nfc-writer` only ever sees a `TagWriter`. In the
app the native writer is supported and is picked. In any browser it is not, so
the flow falls through to Web NFC, or to the "can't write here" explanation, as before.

## What you need

1. **An Apple Developer account** ($99/year, developer.apple.com). An
   organization account is best if the app will carry the company name.
2. **A Mac with Xcode** to build and upload. Without one, a cloud build service
   (Xcode Cloud, Codemagic, or a GitHub Actions macOS runner with signing
   secrets) can do the same job. `.github/workflows/ios-build.yml` already
   proves the project compiles on every change, without signing.
3. **The App ID**, registered under Certificates, Identifiers & Profiles, with
   two capabilities ticked: **NFC Tag Reading** and **Associated Domains**. Its
   bundle id must match `appId` in `capacitor.config.ts`
   (`com.clearline.equipmentcare` unless `CAP_APP_ID` says otherwise).

## Building it

```bash
npm ci
npm run ios:sync          # writes the config into the Xcode project
npm run ios:open          # opens Xcode
```

In Xcode, select the **App** target, then **Signing & Capabilities**, and
choose your team. Plug in an iPhone and press Run. NFC needs a real iPhone: the
simulator has no radio.

To point the app at a different deploy (a preview, say), set the variable
before syncing: `CAP_SERVER_URL=https://deploy-preview-12--site.netlify.app npm run ios:sync`.

## Getting it onto technicians' phones

- **TestFlight** is the fastest route. Upload from Xcode (Product → Archive →
  Distribute), add testers by email, and they install through the TestFlight
  app. Builds expire after 90 days, so upload a fresh one each quarter.
- **Unlisted App Store app** suits a permanent internal tool. It goes through
  review but does not appear in search; people install it from a link.
- **Apple Business Manager custom app** is for when the company manages its
  phones.

Review note: Apple rejects apps that are only a website in a frame (guideline
4.2). This one has a native feature the website cannot offer, NFC writing, and
the review notes should say so, with a test account and a spare tag.

## Tag taps opening the app

iPhones read tags in the background. When the app is installed, tapping a tag
can open the app, signed in, instead of Safari. This needs three things:

1. `APPLE_TEAM_ID` and `IOS_BUNDLE_ID` set in Netlify's environment, so the site
   serves `/.well-known/apple-app-site-association`.
2. The host in `ios/App/App/App.entitlements` (`applinks:…`) must be the
   host that is **written on the tags** (`APP_BASE_URL`). If production moves
   to a custom domain, change it there too. Tags already written keep their old
   host, so keep that domain serving the site.
3. The app reinstalled after the file is live, because iOS fetches it at install.

Until then a tap still works. It just opens Safari.

## Limits worth knowing

- **iPhone only**: iPads have no NFC reader. The app will not install on an
  iPhone without NFC (6s and earlier).
- **The app needs a connection.** It loads the live site. A tag can't be
  paired offline in the browser either, because minting and verifying are
  server steps.
- **Android** keeps using Chrome. Web NFC already writes and locks there, and a
  WebView inside an app does not have Web NFC, so wrapping Android would need
  its own native plugin for no gain.
