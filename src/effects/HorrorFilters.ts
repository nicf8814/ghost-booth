// Horror Filters (CLAUDE.md section 24's neighbor in the wider spec doc --
// whole-photo color-grade treatments, distinct from Overlays.ts's
// decorative stickers/vignette-on-top and PosterEffect.ts's dedicated
// poster-grade+vignette combo). Four presets covering the "Analog Horror /
// Dark / Horror / Vintage Haunted" categories from the reference spec:
//
//   vhs        - Analog Horror: desaturated, contrast-pushed, scanlines +
//                grain + a chromatic-aberration channel split, like a
//                degraded VHS tape.
//   noir       - Dark: underexposed, high contrast, cool blue/green cast.
//   bloodMoon  - Horror: red tint, high contrast, crushed shadows, grain.
//   vintage    - Vintage Haunted: sepia, faded/lifted blacks, soft grain.
//
// Same "quick procedural version" tier as PosterEffect.ts (CLAUDE.md section
// 52's preference for fast/offline/predictable over anything fancier) --
// plain Canvas 2D `ctx.filter` color grades plus a couple of small
// hand-drawn overlays (scanlines, grain, a cheap RGB-split for the VHS
// aberration look), no shader/WebGL pass needed for four static looks.
//
// Applied as a pre-pass on the source bitmap *before* it reaches
// CompositionEngine.compose() (see CapturePipeline.ts's composeSelectedBitmap),
// so frame/overlays/caption can still be layered on top of a filtered photo.
// Mutually exclusive with Poster Mode for the same reason Frame/Overlays are
// (PosterEffect.ts is already a full color grade of its own -- stacking two
// grades would just look muddy), enforced by the caller, not this module.

export type FilterKey = "vhs" | "noir" | "bloodMoon" | "vintage";

export const FILTER_KEYS: FilterKey[] = ["vhs", "noir", "bloodMoon", "vintage"];

export const FILTER_LABELS: Record<FilterKey, string> = {
  vhs: "VHS / Analog Horror",
  noir: "Dark Noir",
  bloodMoon: "Blood Moon",
  vintage: "Vintage Haunted",
};

export interface FilterConfig {
  key: FilterKey;
}

/**
 * Grades `source` with the named horror filter and returns a new
 * ImageBitmap. Never throws (CLAUDE.md section 49) -- falls back to the
 * ungraded photo if canvas filter/2D context support is missing, same
 * degrade-gracefully pattern as applyPosterEffect.
 */
export async function applyHorrorFilter(source: ImageBitmap, config: FilterConfig): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  switch (config.key) {
    case "vhs":
      drawVhs(ctx, source, canvas.width, canvas.height);
      break;
    case "noir":
      drawNoir(ctx, source, canvas.width, canvas.height);
      break;
    case "bloodMoon":
      drawBloodMoon(ctx, source, canvas.width, canvas.height);
      break;
    case "vintage":
      drawVintage(ctx, source, canvas.width, canvas.height);
      break;
  }

  return canvas.transferToImageBitmap();
}

function safeFilter(ctx: OffscreenCanvasRenderingContext2D, filter: string): void {
  try {
    ctx.filter = filter;
  } catch {
    // Some environments throw on unsupported filter strings rather than
    // ignoring them -- fall through and draw ungraded (section 49).
  }
}

function tint(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, color: string, op: GlobalCompositeOperation): void {
  ctx.globalCompositeOperation = op;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
}

/** Cheap RGB-split: nudges the red and blue channels a few px apart via two offset, additively-blended draws. Reads as chromatic aberration without a shader pass. */
function drawChromaticAberration(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, width: number, height: number, amount: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.5;
  ctx.filter = "grayscale(1) sepia(1) hue-rotate(-50deg) saturate(6)"; // pushes toward red
  ctx.drawImage(source, -amount, 0, width, height);
  ctx.filter = "grayscale(1) sepia(1) hue-rotate(150deg) saturate(6)"; // pushes toward cyan/blue
  ctx.drawImage(source, amount, 0, width, height);
  ctx.restore();
}

function drawScanlines(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#000000";
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }
  ctx.restore();
}

function drawGrain(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, intensity: number): void {
  const dotCount = Math.round((width * height) / 900);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < dotCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.globalAlpha = Math.random() * intensity;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawVignette(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, edgeColor: string, strength: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const innerR = Math.min(width, height) * 0.4;
  const outerR = Math.max(width, height) * 0.85;
  const vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, edgeColor.replace("STRENGTH", String(strength)));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawVhs(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, width: number, height: number): void {
  safeFilter(ctx, "brightness(0.92) contrast(1.22) saturate(0.85)");
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";
  drawChromaticAberration(ctx, source, width, height, Math.max(1, width * 0.003));
  drawScanlines(ctx, width, height);
  drawGrain(ctx, width, height, 0.35);
  drawVignette(ctx, width, height, "rgba(0, 0, 0, STRENGTH)", 0.55);
}

function drawNoir(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, width: number, height: number): void {
  safeFilter(ctx, "grayscale(0.35) contrast(1.35) brightness(0.75) saturate(0.7)");
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";
  tint(ctx, width, height, "rgba(30, 60, 70, 0.35)", "multiply"); // blue/green cast
  drawGrain(ctx, width, height, 0.15);
  drawVignette(ctx, width, height, "rgba(0, 5, 8, STRENGTH)", 0.75);
}

function drawBloodMoon(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, width: number, height: number): void {
  safeFilter(ctx, "contrast(1.3) brightness(0.9) saturate(1.1)");
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";
  tint(ctx, width, height, "rgba(160, 20, 20, 0.32)", "multiply"); // red tint
  drawGrain(ctx, width, height, 0.2);
  drawVignette(ctx, width, height, "rgba(20, 0, 0, STRENGTH)", 0.7);
}

function drawVintage(ctx: OffscreenCanvasRenderingContext2D, source: ImageBitmap, width: number, height: number): void {
  safeFilter(ctx, "sepia(0.55) contrast(0.9) brightness(1.05) saturate(0.9)");
  ctx.drawImage(source, 0, 0, width, height);
  ctx.filter = "none";
  // Faded blacks: lift shadows slightly with a soft light-gray wash.
  tint(ctx, width, height, "rgba(80, 65, 50, 0.12)", "screen");
  drawGrain(ctx, width, height, 0.25);
  drawVignette(ctx, width, height, "rgba(30, 20, 10, STRENGTH)", 0.45);
}
