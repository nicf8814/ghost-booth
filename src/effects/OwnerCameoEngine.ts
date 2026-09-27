// Composites a chosen ghost cameo (one of public/cameo/*, keyed by
// CameoKey -- see effects/Cameos.ts) into a photo, in a ghostly visual
// language (CLAUDE.md section 21: blurred, desaturated, brightened,
// translucent). Originally this auto-picked one of the booth owner's own
// cutouts per photo; it's now an explicit guest pick (App.tsx/
// CapturePipeline.ts's ghostKey), so `composite()` takes the key directly
// instead of relying on rng to choose among several assets.
//
// The guest picks these specifically to "strike fear into the subjects,"
// not to place a small sticker in the corner, so the default sizing covers
// the entire photo (like CSS background-size: cover -- scaled up just
// enough that the shorter dimension fills the frame, then centered) rather
// than a small fraction tucked into a corner. `options` can still override
// this per call if a future preset wants a smaller/offset placement.
//
// Kept as its own small engine (mirrors MeshWarpCaricatureEngine's
// image-in/image-out shape) rather than folded into CaricatureEngine, since
// it's compositing a bundled asset rather than warping the photo's own
// content, and because it's meant to be trivially removable/toggleable
// independent of the caricature pipeline.

import { logger } from "../utils/logger";
import type { CameoKey } from "./Cameos";

export interface OwnerCameoOptions {
  /** 0..1 - how transparent the cameo is. Lower reads more "ghostly". */
  opacity: number;
  blurPx: number;
  /** 0..1 - 0 keeps full color, 1 is fully desaturated (grayscale). */
  desaturate: number;
  /** e.g. 1.2 = 20% brighter, matching the guest ghosts' "slightly high" brightness. */
  brightness: number;
  /**
   * Cameo width as a fraction of the target photo's width. Omit to cover
   * the whole photo (scaled so the shorter dimension exactly fills the
   * frame, per the "not a sticker" requirement) -- most callers should
   * leave this unset.
   */
  scale?: number;
  /** Center position as a fraction of the target photo's width/height (0..1). */
  offsetXFrac: number;
  offsetYFrac: number;
}

const DEFAULT_OPTIONS: OwnerCameoOptions = {
  opacity: 0.55,
  blurPx: 3,
  desaturate: 0.45,
  brightness: 1.15,
  offsetXFrac: 0.5,
  offsetYFrac: 0.5,
};

export class OwnerCameoEngine {
  private assetUrls: Record<CameoKey, string>;
  private imagePromises = new Map<CameoKey, Promise<ImageBitmap | null>>();

  constructor(assetUrls: Record<CameoKey, string>) {
    this.assetUrls = assetUrls;
  }

  private loadImage(key: CameoKey): Promise<ImageBitmap | null> {
    let promise = this.imagePromises.get(key);
    if (!promise) {
      const url = this.assetUrls[key];
      promise = fetch(url)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`${url}: ${res.status}`))))
        .then((blob) => createImageBitmap(blob))
        .catch((err) => {
          logger.warn(`Cameo image failed to load, skipping it: ${url}`, err);
          return null;
        });
      this.imagePromises.set(key, promise);
    }
    return promise;
  }

  /**
   * Draws the cameo for `key` onto a copy of `target`, ghostly-styled per
   * `options`. `key === null` (nothing chosen, or the feature disabled)
   * just returns `target` unmodified. Never throws (CLAUDE.md section 49)
   * -- a failed asset load or a missing 2D context also just returns the
   * photo unmodified, since a cameo that can't be drawn shouldn't break
   * the booth.
   */
  async composite(
    target: ImageBitmap,
    key: CameoKey | null,
    options: Partial<OwnerCameoOptions> = {},
  ): Promise<ImageBitmap> {
    if (!key) return target;
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const cameo = await this.loadImage(key);
    if (!cameo) {
      logger.warn(`Cameo image unavailable for key "${key}"; skipping cameo compositing.`);
      return target;
    }

    const canvas = new OffscreenCanvas(target.width, target.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      logger.warn("2D context unavailable for cameo compositing; skipping.");
      return target;
    }

    ctx.drawImage(target, 0, 0);

    // "Cover" sizing when no explicit scale is given: scale so the cameo's
    // shorter dimension exactly fills the corresponding photo dimension,
    // then center it -- the cameo dominates the frame rather than sitting
    // as a small corner sticker.
    const drawWidth = opts.scale !== undefined
      ? target.width * opts.scale
      : Math.max(target.width, target.height * (cameo.width / cameo.height));
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
