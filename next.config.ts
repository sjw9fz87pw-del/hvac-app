import type { NextConfig } from "next";

const config: NextConfig = {
  // @pmops/nfc-core resolves through the tsconfig path alias to its TypeScript
  // source, so Next compiles it as ordinary app code. It is deliberately not an
  // npm workspace: Netlify's monorepo detection treats any workspace package as
  // the deployable app and resolves the build output inside it.
  // Moved out of `experimental` in Next 15.5; the build warns otherwise.
  typedRoutes: false,
  experimental: {
    // How long a page already loaded on the phone is reused before it is asked
    // for again. Going back to a tab within 30 seconds is then instant. Saving
    // anything refreshes the page, which clears this, so it never hides a
    // change made on this phone.
    staleTimes: { dynamic: 30, static: 60 },
  },
};

export default config;
