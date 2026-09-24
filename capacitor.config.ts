import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iPhone app is a native shell around the live site, not a copy of it.
 *
 * This app is server-rendered (Next.js server components, API routes, a
 * database), so there is no static bundle to ship inside the app. The shell
 * loads `CAP_SERVER_URL` and adds the one thing a browser on iOS cannot do:
 * write and lock NFC tags, through the TagNfc plugin in ios/App/App.
 *
 * `native/www` is only the offline fallback Capacitor requires to exist.
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://clearline-equipment-care.netlify.app";

const config: CapacitorConfig = {
  // Must match the App ID registered in the Apple Developer account.
  appId: process.env.CAP_APP_ID ?? "com.clearline.equipmentcare",
  appName: "Clearline",
  webDir: "native/www",
  server: {
    url: serverUrl,
    // Only the app's own host stays inside the shell; anything else opens in Safari.
    allowNavigation: [new URL(serverUrl).host],
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
