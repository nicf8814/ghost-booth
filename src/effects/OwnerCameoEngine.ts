// Composites the booth owner's own cameo (one of public/cameo/*.png) into a
// photo, in a ghostly visual language (CLAUDE.md section 21: blurred,
// desaturated, brightened, translucent) -- a recurring "haunting" easter
// egg rather than a solid photobomb. This is a small set of fixed assets
// the operator explicitly opted into (the booth owner's own likeness, cut
// out ahead of time), not anyone's captured likeness or a live per-guest
// effect -- that's a deliberately simpler, more reliable choice than
// generating a ghost from each guest's own photo (CLAUDE.md section 64:
// reliability over a fancier effect).
//
// Supports multiple cameo images so a different "ghost" of the owner can
// be picked per photo -- pass several asset URLs and a seeded rng picks one
// per capture (CLAUDE.md section 20's reproducible randomness, same rng the
// caricature preset uses). Today there's just one image
// (public/cameo/nic-cutout.png); add more files under public/cameo/ and
// list them in App.tsx's CAMEO_ASSET_FILENAMES to start randomizing --
// nothing else needs to change. A URL that 404s (an asset listed but not
// actually present yet) is skipped rather than breaking the booth.
//
// Kept as its own small engine (mirrors MeshWarpCaricatureEngine's
// image-in/image-out shape) rather than folded into CaricatureEngine, since
// it's compositing bundled assets rather than warping the photo's own
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
  private assetUrls: string[];
  private imagesPromise: Promise<ImageBitmap[]> | null = null;

  constructor(assetUrls: string[]) {
    this.assetUrls = assetUrls;
  }

  private loadImages(): Promise<ImageBitmap[]> {
    if (!this.imagesPromise) {
      this.imagesPromise = Promise.all(
        this.assetUrls.map((url) =>
          fetch(url)
            .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`${url}: ${res.status}`))))
            .then((blob) => createImageBitmap(blob))
            .catch((err) => {
              logger.warn(`Owner cameo image failed to load, skipping it: ${url}`, err);
              return null;
            }),
        ),
      ).then((results) => results.filter((img): img is ImageBitmap => img !== null));
    }
    return this.imagesPromise;
  }

  /**
   * Draws one cameo (picked by `rng`, if given several) onto a copy of
   * `target`, ghostly-styled per `options`. Never throws (CLAUDE.md section
   * 49) -- a failed asset load, an empty asset list, or a missing 2D
   * context just returns the photo unmodified, since a cameo that can't be
   * drawn shouldn't break the booth.
   */
  async composite(
    target: ImageBitmap,
    options: Partial<OwnerCameoOptions> = {},
    rng: () => number = Math.random,
  ): Promise<ImageBitmap> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const cameos = await this.loadImages();
    if (cameos.length === 0) {
      logger.warn("No owner cameo images available; skipping cameo compositing.");
      return target;
    }
    const cameo = cameos[Math.floor(rng() * cameos.length) % cameos.length];

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
