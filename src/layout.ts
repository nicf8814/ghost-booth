// Pure layout math for the printed photo. Kept free of DOM/canvas so it can
// be unit tested.

/** Output size: 2:3 portrait, matching the Kodak Mini 2 Retro's 2x3 prints. */
export const PRINT_W = 1200;
export const PRINT_H = 1800;

/** Hi-res export: same framed photo, scaled so it is 3840 pixels tall (4K). */
export const HD_SCALE = 3840 / PRINT_H;

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
