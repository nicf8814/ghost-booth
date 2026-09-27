// The guest-choosable ghost cameo catalog: fixed images under public/cameo/
// that OwnerCameoEngine composites into a photo, ghostly-styled (blurred,
// desaturated, brightened, translucent -- CLAUDE.md section 21). Historically
// this was a single owner-likeness cutout composited automatically per
// CLAUDE.md section 21's easter egg; the guest now picks a specific cameo
// from a menu (same "picker" pattern as Frame/Overlays/Poster/Filter in
// CapturePipeline.ts), and that cameo is meant to dominate the frame -- the
// user's own words were "these are not stickers" -- so OwnerCameoEngine's
// default sizing now covers the whole photo rather than tucking a small
// image into a corner.
//
// Add a new key here plus its file under public/cameo/ to add another
// choosable ghost; nothing else needs to change (App.tsx builds the
// key->URL map from this list).

export type CameoKey =
  | "nicCutout"
  | "theRake"
  | "forestCrawler"
  | "glassHands"
  | "zombieWoman"
  | "smokeSkull";

export const CAMEO_KEYS: CameoKey[] = [
  "nicCutout",
  "theRake",
  "forestCrawler",
  "glassHands",
  "zombieWoman",
  "smokeSkull",
];

export const CAMEO_LABELS: Record<CameoKey, string> = {
  nicCutout: "My Cameo",
  theRake: "The Rake",
  forestCrawler: "Forest Crawler",
  glassHands: "Glass Hands",
  zombieWoman: "Screamer",
  smokeSkull: "Smoke Skull",
};

/** Filename under public/cameo/ for each cameo key. */
export const CAMEO_FILENAMES: Record<CameoKey, string> = {
  nicCutout: "nic-cutout.png",
  theRake: "the-rake.jpg",
  forestCrawler: "forest-crawler.jpg",
  glassHands: "glass-hands.jpg",
  zombieWoman: "zombie-woman.jpg",
  smokeSkull: "smoke-skull.jpg",
};
