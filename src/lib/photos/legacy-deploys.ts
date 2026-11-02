/**
 * Every production deploy of the site up to the Nov 2, 2026 photo fix, newest
 * first.
 *
 * Until then each photo was written to a store belonging to the deploy that
 * took it (see netlify-store.ts), so the photos are still in these deploys'
 * stores. A photo missing from the site-wide store is looked for here and
 * copied across. Nothing needs adding to this list: photos taken from the fix
 * on go straight to the site-wide store.
 *
 * Collected from the deploy records. An ID that turns out not to be one of
 * this site's deploys only costs a lookup that finds nothing.
 */
export const LEGACY_DEPLOY_IDS: readonly string[] = [
  "6ae68e08f1546a17bb10a0e8", // Nov 1   dashboard without Today's visits
  "6ae5a6ab11faea1a2b0b4599", // Oct 31  dashboard redesign
  "6ae5a1f154fa9bd106fc4d4c", // Oct 31  restaurants and unit refresh (Codex)
  "6ae5462a65984f9bd36e63cf", // Oct 31  schedule calendar
  "6ae5328e15241c68adb23604", // Oct 31  restaurant-side swipe, speed
  "6ae52a3d69031eeeb4b239af", // Oct 30  top-bar logo
  "6ae5281119792b9581ca6a8b", // Oct 30  move between units
  "6ae52418771c5db345b2438f", // Oct 30  new address
  "6ae523c6f4fb32fe094ea851", // Oct 30  (unconfirmed)
  "6ae51d2c9bcab0225c752abe", // Oct 30  Axios rebrand
  "6ac831c12b6fc0bb3b50c56e", // Oct 9   scheduling fixed
  "6ac7fdf5d4ba5d146ce3c50e", // Oct 8   jobs add/remove
  "6ac3cc11825d795f915bfd0a", // Oct 5   concise pass, NFC reader
  "6ab48e2b44882d7bc18c0dd9", // Sep 24  iPhone tagging
  "6ab486ec090b123d6942a8d4", // Sep 24  tag existing units
  "6ab48430a11f4421f5b65a5f", // Sep 24  book when nothing is due
  "6ab173541f87bb814daf9566", // Sep 21  (unconfirmed)
  "6ab17311b04b1276ebab812f", // Sep 21  visit time picker
  "6aa50b90aebd83885ad673aa", // Sep 12  first deploy
];
