// The guest-choosable ghost cameo catalog: fixed images under public/cameo/
// that OwnerCameoEngine composites into a photo, ghostly-styled (blurred,
// desaturated, brightened, translucent -- CLAUDE.md section 21). The guest
// picks a specific cameo from a menu (same "picker" pattern as Frame/
// Overlays/Poster/Filter in CapturePipeline.ts), and that cameo is meant to
// dominate the frame -- the user's own words were "these are not stickers"
// -- so OwnerCameoEngine's default sizing covers the whole photo rather
// than tucking a small image into a corner.
//
// Five stock horror/creature images were briefly added and then removed:
// the user confirmed they didn't hold a license for that stock
// photography, so they came back out rather than staying live pending a
// license. "geminiReacher" replaces one of them with art the user
// generated themselves via Gemini (Google's generative AI terms give the
// user usage rights to what they generate, and this is for the user's own
// personal, non-commercial booth) -- see PROJECT_LOG.md for the fuller
// licensing note. Add a new key here plus its file under public/cameo/ to
// add another choosable ghost -- nothing else needs to change (App.tsx
// builds the key->URL map from this list).

export type CameoKey = "nicCutout" | "geminiReacher";

export const CAMEO_KEYS: CameoKey[] = ["nicCutout", "geminiReacher"];

export const CAMEO_LABELS: Record<CameoKey, string> = {
  nicCutout: "My Cameo",
  geminiReacher: "The Reacher",
};

/** Filename under public/cameo/ for each cameo key. */
export const CAMEO_FILENAMES: Record<CameoKey, string> = {
  nicCutout: "nic-cutout.png",
  geminiReacher: "gemini-reacher.jpg",
};
