// The real per-guest ghost effect (CLAUDE.md sections 21-23), built from
// the guest's own segmented silhouette -- not a fixed asset like
// OwnerCameoEngine's "My Cameo" easter egg. Pipeline, per section 21:
//   captured photo -> person segmentation -> extract person -> duplicate
//   -> deform -> blur -> desaturate -> increase brightness -> reduce
//   opacity -> offset -> place behind foreground.
//
// Runs after the fact on a single captured frame (not live video), so the
// per-pixel mask-to-alpha conversion below is cheap enough to do on the
// main thread without hurting the "keep the UI responsive" goal (section
// 30) -- the expensive part (the ML segmentation model itself) already ran
// separately via MediaPipePersonSegmenter.

import type { PersonSegmentation } from "../vision/VisionTypes";

interface GhostEchoConfig {
  /** 0..1 -- how transparent this echo is. */
  opacity: number;
  blurPx: number;
  /** 0..1 -- 0 keeps full color, 1 is fully desaturated. */
  desaturate: number;
  /** e.g. 1.2 = 20% brighter. */
  brightness: number;
  /** Position/pose displacement, as fractions of the photo's width/height. */
  offsetXFrac: number;
  offsetYFrac: number;
  scaleX: number;
  scaleY: number;
  rotateDeg: number;
}

/**
 * Converts MediaPipe's grayscale segmentation mask (person = bright,
 * background = dark, but fully opaque as an image) into an actual alpha
 * mask, so it can drive a `destination-in` cutout. Canvas compositing reads
 * alpha, not luminance, so this per-pixel copy is the bridge between the
 * two.
 */
function maskToAlphaCanvas(mask: ImageBitmap): OffscreenCanvas {
  const canvas = new OffscreenCanvas(mask.width, mask.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(mask, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // MediaPipe's mask is grayscale (R === G === B); use that luminance as
    // the new alpha channel.
    data[i + 3] = data[i];
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Cuts the person out of `source` using `mask`, leaving everything else transparent. */
function extractPerson(source: ImageBitmap, mask: ImageBitmap): ImageBitmap | OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  const alphaMask = maskToAlphaCanvas(mask);
  ctx.drawImage(alphaMask, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** Draws one ghostly, displaced/distorted copy of the person cutout. */
function drawGhostEcho(
  ctx: OffscreenCanvasRenderingContext2D,
  cutout: ImageBitmap | OffscreenCanvas,
  width: number,
  height: number,
  cfg: GhostEchoConfig,
): void {
  ctx.save();
  ctx.globalAlpha = cfg.opacity;
  ctx.filter = `blur(${cfg.blurPx}px) saturate(${Math.max(0, 1 - cfg.desaturate)}) brightness(${cfg.brightness})`;

  const cx = width / 2;
  const cy = height / 2;
  ctx.translate(cx + cfg.offsetXFrac * width, cy + cfg.offsetYFrac * height);
  ctx.rotate((cfg.rotateDeg * Math.PI) / 180);
  ctx.scale(cfg.scaleX, cfg.scaleY);
  ctx.translate(-cx, -cy);
  ctx.drawImage(cutout as CanvasImageSource, 0, 0, width, height);
  ctx.restore();
}

/**
 * Picks 2 translucent, distorted echo configs (CLAUDE.md section 22) once
 * per photo. Callers should reuse the same returned array across every
 * bitmap variant (candid + goofy) they composite the ghost onto, so the
 * ghost's pose doesn't visibly jump when the guest toggles Goofy Filter --
 * that's why this is split from compositeGuestGhost below rather than
 * picking fresh randomness on every call.
 *
 * `rng` should be the same per-photo seeded generator used for the
 * caricature preset, so a given photo's ghost pose is reproducible
 * (section 20).
 */
export function pickGhostEchoConfigs(rng: () => number): GhostEchoConfig[] {
  // Furthest/faintest first (section 22). A little per-photo randomness in
  // offset/rotation so it reads as a shifting apparition rather than an
  // identical stamp every time (section 23).
  return [
    {
      opacity: 0.16,
      blurPx: 10,
      desaturate: 0.7,
      brightness: 1.3,
      offsetXFrac: -0.05 + rng() * 0.06,
      offsetYFrac: -0.12 - rng() * 0.04,
      scaleX: 1.05 + rng() * 0.05,
      scaleY: 1.15 + rng() * 0.05,
      rotateDeg: -4 + rng() * 8,
    },
    {
      opacity: 0.3,
      blurPx: 6,
      desaturate: 0.6,
      brightness: 1.2,
      offsetXFrac: 0.02 + rng() * 0.05,
      offsetYFrac: -0.06 - rng() * 0.03,
      scaleX: 1.02 + rng() * 0.04,
      scaleY: 1.07 + rng() * 0.04,
      rotateDeg: -2 + rng() * 4,
    },
  ];
}

/**
 * Composites `echoes` (from pickGhostEchoConfigs) of the segmented person
 * behind `foreground`. Never throws (CLAUDE.md section 49) -- an empty
 * `segmentations` array (model not loaded, no person found) just returns
 * `foreground` unchanged, same as "no face detected" elsewhere.
 *
 * Layer order matters here: `foreground` is a full, fully-opaque rectangular
 * photo (background included), so simply drawing it on top of the ghost
 * echoes -- as an earlier version of this function did -- paints over the
 * entire canvas and erases every ghost, regardless of offset. To actually
 * get a "duplicate behind, sharp person in front" result (section 21), the
 * base photo goes down first, the translucent echoes go on top of that, and
 * then only the person's own sharp cutout (not the whole rectangle) goes on
 * top of the echoes -- so the real subject stays crisp while the offset
 * duplicates remain visible in the space around them (above the head, to
 * the sides) instead of being fully covered.
 */
export async function compositeGuestGhost(
  source: ImageBitmap,
  segmentations: PersonSegmentation[],
  foreground: ImageBitmap,
  echoes: GhostEchoConfig[],
): Promise<ImageBitmap> {
  if (segmentations.length === 0) return foreground;

  const canvas = new OffscreenCanvas(foreground.width, foreground.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return foreground;

  const mask = segmentations[0].mask;
  // Ghost echoes are duplicated from the ORIGINAL captured photo (`source`),
  // not the caricatured `foreground`, so the apparition reads as a distinct
  // "before" self rather than a second warped copy stacked on the warped one.
  const ghostCutout = extractPerson(source, mask);
  // The crisp person redrawn on top, though, must match whichever bitmap
  // this call is compositing onto (candid `master` or caricatured `working`)
  // so the sharp foreground subject still shows the caricature when present.
  const sharpCutout = extractPerson(foreground, mask);

  ctx.drawImage(foreground, 0, 0, canvas.width, canvas.height);

  for (const echo of echoes) {
    drawGhostEcho(ctx, ghostCutout, canvas.width, canvas.height, echo);
  }

  ctx.drawImage(sharpCutout as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas.transferToImageBitmap();
}
