// Pure layout math for the printed photo. Kept free of DOM/canvas so it can
// be unit tested.

/** Output size: 2:3 portrait, matching the Kodak Mini 2 Retro's 2x3 prints. */
export const PRINT_W = 1200;
export const PRINT_H = 1800;

/**
 * Margin kept clear of anything important on every side. The Kodak app may
 * trim a little off the edges when it fits the image to the paper, so the
 * photo and caption stay well inside this.
 */
export const SAFE = 70;

/** Where the photo sits on the print. */
export const PHOTO = {
  x: SAFE,
  y: SAFE,
  w: PRINT_W - SAFE * 2,
  h: 1380,
};

/** Caption band below the photo. */
export const CAPTION = {
  top: PHOTO.y + PHOTO.h,
  bottom: PRINT_H - SAFE,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Source rectangle that fills a destination of the given size without
 * stretching (CSS object-fit: cover), centered.
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const w = srcH * dstRatio;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / dstRatio;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

export type Rotation = "none" | "cw" | "ccw";

/** Canvas size after applying a rotation to a frame. */
export function rotatedSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === "none" ? { w, h } : { w: h, h: w };
}
