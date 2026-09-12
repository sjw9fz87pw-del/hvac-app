import type { NextConfig } from "next";

const config: NextConfig = {
  // @pmops/nfc-core resolves through the tsconfig path alias to its TypeScript
  // source, so Next compiles it as ordinary app code. It is deliberately not an
  // npm workspace: Netlify's monorepo detection treats any workspace package as
  // the deployable app and resolves the build output inside it.
  // Moved out of `experimental` in Next 15.5; the build warns otherwise.
  typedRoutes: false,
};

export default config;
