// The guest-choosable ghost cameo catalog: fixed images under public/cameo/
// that OwnerCameoEngine composites into a photo, ghostly-styled (blurred,
// desaturated, brightened, translucent -- CLAUDE.md section 21). The guest
// picks a specific cameo from a menu (same "picker" pattern as Frame/
// Overlays/Poster/Filter in CapturePipeline.ts), and that cameo is meant to
// dominate the frame -- the user's own words were "these are not stickers"
// -- so OwnerCameoEngine's default sizing covers the whole photo rather
// than tucking a small image into a corner.
//
// Only the booth owner's own cutout is listed here. Five stock
// horror/creature images were briefly added and then removed: the user
// confirmed they don't hold a license for that stock photography, and
// CLAUDE.md's own privacy/reliability priorities don't cover "ship
// unlicensed commercial images on a public site," so they came back out
// rather than staying live pending a license. Add a new key here plus its
// file under public/cameo/ to add another choosable ghost once there's
// artwork with clear rights to use it -- nothing else needs to change
// (App.tsx builds the key->URL map from this list).

export type CameoKey = "nicCutout";

export const CAMEO_KEYS: CameoKey[] = ["nicCutout"];

export const CAMEO_LABELS: Record<CameoKey, string> = {
  nicCutout: "My Cameo",
};

/** Filename under public/cameo/ for each cameo key. */
export const CAMEO_FILENAMES: Record<CameoKey, string> = {
  nicCutout: "nic-cutout.png",
};
