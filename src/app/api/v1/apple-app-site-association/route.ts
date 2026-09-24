/**
 * Apple App Site Association, served at /.well-known/apple-app-site-association
 * (see the rewrite in next.config.ts).
 *
 * This is what lets tapping a tag open the iPhone app, already signed in,
 * instead of Safari: iOS fetches this file when the app is installed and, for
 * links on this host under /t/, hands them to the app named here. Without it
 * a tap still works, it just opens in Safari.
 *
 * Needs APPLE_TEAM_ID (the Apple Developer team) and IOS_BUNDLE_ID (the app's
 * bundle identifier, the same value as CAP_APP_ID). Until both are set there is
 * no iPhone app to hand links to, so this answers 404.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const team = process.env.APPLE_TEAM_ID?.trim();
  const bundle = process.env.IOS_BUNDLE_ID?.trim();
  if (!team || !bundle) return new Response("Not found", { status: 404 });

  return Response.json(
    {
      applinks: {
        details: [{ appIDs: [`${team}.${bundle}`], components: [{ "/": "/t/*", comment: "NFC and QR tag links" }] }],
      },
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
