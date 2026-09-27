// "Poster Mode" (operator beta feature): grades a photo to read like a
// horror movie poster -- desaturated/tinted color grade + a directional
// vignette that pools light around the subject. Modeled on the shared
// visual language of classic and modern horror one-sheets (Evil Dead Rise,
// Stephen King's IT, Fright Night): one dominant tint, deep shadow falloff.
// Pure color-grade/gradient treatment now -- no text is drawn by this
// module at all (an earlier version drew a small tagline here; that was
// removed per direction to keep Poster Mode as just the color theme/
// gradient, with the caption toggle below being the only source of text on
// a photo, poster or not).
//
// This is the "quick procedural version" tier -- no person segmentation, so
// it grades/vignettes the whole photo rather than lifting the guest onto a
// separate background. That's a deliberate scope cut (CLAUDE.md section 52:
// prefer fast/offline/predictable over a fancier generative pipeline) and
// can be revisited once Phase 6 segmentation exists.
//
// Applied to the source bitmap *before* it reaches the regular
// frame+overlay composition (CompositionEngine) -- CapturePipeline.ts's
// composeSelectedBitmap grades with this effect first, then hands the
// graded bitmap to compose() for overlays/caption. Frame stays mutually
// exclusive with Poster (its own vignette already fills a similar role and
// a frame border on top would clutter it), but overlays, the caption, and
// a horror filter (graded in even earlier, see HorrorFilters.ts) can all
// now layer on top of a poster-graded photo.

export type PosterTint =
  | "crimson"
  | "teal"
  | "moonlight"
  | "toxicGreen"
  | "violetHaze"
  | "amberInferno"
  | "grimGrey"
  | "bubblegumGore";

export interface PosterConfig {
  tint: PosterTint;
}

const TINTS: Record<PosterTint, { multiply: string; vignette: string }> = {
  // Evil Dead Rise's profile shot: warm amber pool of light against near-black.
  crimson: { multiply: "rgba(150, 70, 50, 0.5)", vignette: "rgba(10, 2, 0, 0.7)" },
  // Evil Dead Rise's embrace shot / general "elevated horror" grade.
  teal: { multiply: "rgba(60, 130, 130, 0.5)", vignette: "rgba(0, 12, 12, 0.7)" },
  // Fright Night's moonlit sky.
  moonlight: { multiply: "rgba(80, 100, 160, 0.5)", vignette: "rgba(2, 5, 15, 0.7)" },
  // A sickly radioactive/toxic-slime green -- 80s creature-feature poster.
  toxicGreen: { multiply: "rgba(70, 150, 60, 0.5)", vignette: "rgba(2, 10, 2, 0.72)" },
  // A purple/magenta haunted-carnival grade.
  violetHaze: { multiply: "rgba(120, 60, 150, 0.5)", vignette: "rgba(8, 2, 15, 0.72)" },
  // A hot orange/red "burning" grade, hotter and more saturated than crimson.
  amberInferno: { multiply: "rgba(190, 90, 30, 0.55)", vignette: "rgba(12, 3, 0, 0.72)" },
  // A near-desaturated grey grade for a stark, old-horror-film look.
  grimGrey: { multiply: "rgba(110, 110, 115, 0.45)", vignette: "rgba(3, 3, 4, 0.75)" },
  // A campy hot-pink/red "slasher party" grade -- the odd one out on
  // purpose, leaning into the booth's "trashy/absurd" personality rather
  // than every tint being a somber horror-movie grade.
  bubblegumGore: { multiply: "rgba(220, 40, 110, 0.45)", vignette: "rgba(15, 0, 8, 0.68)" },
};

export const POSTER_TINTS: PosterTint[] = [
  "crimson",
  "teal",
  "moonlight",
  "toxicGreen",
  "violetHaze",
  "amberInferno",
  "grimGrey",
  "bubblegumGore",
];

export const POSTER_TINT_LABELS: Record<PosterTint, string> = {
  crimson: "Crimson",
  teal: "Teal",
  moonlight: "Moonlight",
  toxicGreen: "Toxic Green",
  violetHaze: "Violet Haze",
  amberInferno: "Amber Inferno",
  grimGrey: "Grim Grey",
  bubblegumGore: "Bubblegum Gore",
};

/**
 * Grades `source` into a poster-style image and returns a new ImageBitmap.
 * Never throws (CLAUDE.md section 49) -- falls back to the ungraded photo
 * if canvas filter/2D context support is missing.
 */
export async function applyPosterEffect(source: ImageBitmap, config: PosterConfig): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  const tint = TINTS[config.tint];

  // Color grade: desaturate + push contrast/darken before the tint overlay,
  // so the result reads as a lit subject in near-darkness rather than a
  // washed-out photo. `filter` on OffscreenCanvasRenderingContext2D is
  // widely supported (Safari 15.4+); if it's not, drawImage below still
  // works, just without the grade -- graceful degradation, not a crash.
  try {
    ctx.filter = "grayscale(25%) contrast(1.15) brightness(0.95)";
  } catch {
    // Some environments throw on unsupported filter strings rather than
    // ignoring them; either way, fall through and draw ungraded.
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";

  // Tint: a single dominant hue over the whole frame, matching the
  // reference posters' limited palettes.
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = tint.multiply;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  // Vignette: radial falloff to near-black at the edges, pooling light
  // toward the upper-middle where a face usually sits in a selfie-style
  // capture -- the "single dramatic light source" look.
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.45;
  const innerR = Math.min(canvas.width, canvas.height) * 0.35;
  const outerR = Math.max(canvas.width, canvas.height) * 0.95;
  const vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, tint.vignette);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.transferToImageBitmap();
}
