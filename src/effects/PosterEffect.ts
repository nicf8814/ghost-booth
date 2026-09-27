// "Poster Mode" (operator beta feature): grades a photo to read like a
// horror movie poster -- desaturated/tinted color grade, a directional
// vignette that pools light around the subject, and bold horror-style
// title/tagline typography. Modeled on the shared visual language of
// classic and modern horror one-sheets (Evil Dead Rise, Stephen King's IT,
// Fright Night): one dominant tint, deep shadow falloff, distressed title
// lockup, small spaced-caps tagline.
//
// This is the "quick procedural version" tier -- no person segmentation, so
// it grades/vignettes the whole photo rather than lifting the guest onto a
// separate background. That's a deliberate scope cut (CLAUDE.md section 52:
// prefer fast/offline/predictable over a fancier generative pipeline) and
// can be revisited once Phase 6 segmentation exists.
//
// Applied as an alternative to the regular caption+frame composition
// (CompositionEngine), not layered on top of it -- the poster's own title/
// tagline text and vignette already fill that role, and combining both
// would clutter the frame with two competing text/border treatments.

export type PosterTint = "crimson" | "teal" | "moonlight";

export interface PosterConfig {
  tagline?: string;
  tint: PosterTint;
}

const TINTS: Record<PosterTint, { multiply: string; vignette: string }> = {
  // Evil Dead Rise's profile shot: warm amber pool of light against near-black.
  crimson: { multiply: "rgba(150, 70, 50, 0.5)", vignette: "rgba(10, 2, 0, 0.7)" },
  // Evil Dead Rise's embrace shot / general "elevated horror" grade.
  teal: { multiply: "rgba(60, 130, 130, 0.5)", vignette: "rgba(0, 12, 12, 0.7)" },
  // Fright Night's moonlit sky.
  moonlight: { multiply: "rgba(80, 100, 160, 0.5)", vignette: "rgba(2, 5, 15, 0.7)" },
};

export const POSTER_TINTS: PosterTint[] = ["crimson", "teal", "moonlight"];

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

  if (config.tagline) {
    drawPosterTagline(ctx, canvas.width, canvas.height, config.tagline);
  }

  return canvas.transferToImageBitmap();
}

/** Small, letter-spaced caps sitting in its own zone -- the only text now that the title lockup was dropped. */
function drawPosterTagline(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, tagline: string): void {
  const fontSize = Math.round(width * 0.032);
  ctx.save();
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#f0e6e6";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = fontSize * 0.4;

  const spaced = spaceOutLetters(tagline);
  ctx.fillText(spaced, width / 2, height * 0.62);
  ctx.restore();
}

/** Crude letter-spacing for canvas text (no letter-spacing CSS property on 2D context). */
function spaceOutLetters(text: string): string {
  return text.split("").join(" "); // thin space
}
