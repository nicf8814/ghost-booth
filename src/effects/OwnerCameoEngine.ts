// Composites the booth owner's own cameo (public/cameo/nic-cutout.png) into
// a photo, in the same ghostly visual language as the guest ghost effect
// will eventually use (CLAUDE.md section 21: blurred, desaturated,
// brightened, translucent) -- a recurring "haunting" easter egg rather than
// a solid photobomb. Unlike the spec's per-guest ghost (generated fresh
// from each captured photo via segmentation), this is a single fixed asset
// the operator explicitly opted into, not anyone's captured likeness.
//
// Kept as its own small engine (mirrors MeshWarpCaricatureEngine's
// image-in/image-out shape) rather than folded into CaricatureEngine, since
// it's compositing a bundled asset rather than warping the photo's own
// content, and because it's meant to be trivially removable/toggleable
// independent of the caricature pipeline.

import { logger } from "../utils/logger";

export interface OwnerCameoOptions {
  /** 0..1 - how transparent the cameo is. Lower reads more "ghostly". */
  opacity: number;
  blurPx: number;
  /** 0..1 - 0 keeps full color, 1 is fully desaturated (grayscale). */
  desaturate: number;
  /** e.g. 1.2 = 20% brighter, matching the guest ghosts' "slightly high" brightness. */
  brightness: number;
  /** Cameo width as a fraction of the target photo's width. */
  scale: number;
  /** Center position as a fraction of the target photo's width/height (0..1). */
  offsetXFrac: number;
  offsetYFrac: number;
}

const DEFAULT_OPTIONS: OwnerCameoOptions = {
  opacity: 0.4,
  blurPx: 5,
  desaturate: 0.55,
  brightness: 1.2,
  scale: 0.32,
  offsetXFrac: 0.78,
  offsetYFrac: 0.22,
};

export class OwnerCameoEngine {
  private assetUrl: string;
  private imagePromise: Promise<ImageBitmap> | null = null;

  constructor(assetUrl: string) {
    this.assetUrl = assetUrl;
  }

  private loadImage(): Promise<ImageBitmap> {
    if (!this.imagePromise) {
      this.imagePromise = fetch(this.assetUrl)
        .then((res) => res.blob())
        .then((blob) => createImageBitmap(blob));
    }
    return this.imagePromise;
  }

  /**
   * Draws the cameo onto a copy of `target`, ghostly-styled per `options`.
   * Never throws (CLAUDE.md section 49) -- a failed asset load or a
   * missing 2D context just returns the photo unmodified, since a cameo
   * that can't be drawn shouldn't break the booth.
   */
  async composite(target: ImageBitmap, options: Partial<OwnerCameoOptions> = {}): Promise<ImageBitmap> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    let cameo: ImageBitmap;
    try {
      cameo = await this.loadImage();
    } catch (err) {
      logger.warn("Owner cameo image failed to load; skipping cameo compositing.", err);
      return target;
    }

    const canvas = new OffscreenCanvas(target.width, target.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      logger.warn("2D context unavailable for owner cameo compositing; skipping.");
      return target;
    }

    ctx.drawImage(target, 0, 0);

    const drawWidth = target.width * opts.scale;
    const drawHeight = drawWidth * (cameo.height / cameo.width);
    const x = target.width * opts.offsetXFrac - drawWidth / 2;
    const y = target.height * opts.offsetYFrac - drawHeight / 2;

    ctx.save();
    ctx.globalAlpha = opts.opacity;
    ctx.filter = `blur(${opts.blurPx}px) saturate(${Math.max(0, 1 - opts.desaturate)}) brightness(${opts.brightness})`;
    ctx.drawImage(cameo, x, y, drawWidth, drawHeight);
    ctx.restore();

    return canvas.transferToImageBitmap();
  }
}
