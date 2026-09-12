import type { NextConfig } from "next";

const config: NextConfig = {
  // The NFC package is source-only TypeScript shared across services; Next
  // compiles it alongside the app rather than us shipping a build step for it.
  transpilePackages: ["@pmops/nfc-core"],
  // Moved out of `experimental` in Next 15.5; the build warns otherwise.
  typedRoutes: false,
};

export default config;
