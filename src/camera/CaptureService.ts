import type { GetUserMediaCameraManager } from "./CameraManager";
import { drawNormalized, drawRotated90 } from "../utils/orientation";

export interface CaptureMasterFrameOptions {
  mirrorPreview: boolean;
  /**
   * This booth is mounted portrait (see CameraManager.ts / PrintLayout.ts).
   * If the raw captured frame still comes back landscape-shaped anyway --
   * a real iOS Safari quirk where the live preview displays correctly
   * rotated but a canvas/ImageBitmap capture of the same stream doesn't
   * inherit that rotation -- this rotates it 90deg to match the portrait
   * viewport before anything else touches it. Auto-detected per capture
   * (only fires on an actual width>height-vs-portrait-viewport mismatch,
   * so it's a no-op on a device that already reports frames correctly).
   * `rotateCounterClockwise` flips which way that correction turns, for
   * operators to flip in the field (Operator Panel) if the guessed
   * direction ends up upside-down on the actual hardware -- there's no
   * reliable way to know the front camera sensor's mounting offset ahead
   * of testing on the real iPad.
   */
  rotateCounterClockwise?: boolean;
}

/**
 * Turns a raw captured frame into the "master" bitmap used by the rest of
 * the pipeline: orientation-normalized (un-mirrored, rotated to match the
 * portrait mount if needed), full resolution, created once (CLAUDE.md
 * section 7 — do not repeatedly resize the same bitmap; keep separate
 * preview/processing/master/print copies downstream).
 */
export async function captureMasterFrame(
  camera: GetUserMediaCameraManager,
  opts: CaptureMasterFrameOptions = { mirrorPreview: true },
): Promise<ImageBitmap> {
  const raw = await camera.captureFrame();
  const rotated = maybeRotateToPortrait(raw, opts.rotateCounterClockwise ?? false);
  if (rotated !== raw) {
    raw.close();
  }

  if (!opts.mirrorPreview) {
    // Preview wasn't mirrored, so the (rotation-corrected) capture is
    // already correctly oriented for printing.
    return rotated;
  }

  // Preview was mirrored for a natural "look in a mirror" feel, so we
  // deliberately un-mirror the master copy here — once — rather than ever
  // printing a horizontally reversed photo.
  const canvas = new OffscreenCanvas(rotated.width, rotated.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return rotated;
  }
  drawNormalized(ctx, rotated, canvas.width, canvas.height, true);
  // `rotated` (whether it's the original raw capture or a newly-rotated
  // copy) is always superseded by the mirrored canvas result below, so it
  // always gets closed here rather than leaking (CLAUDE.md section 7).
  rotated.close();
  return canvas.transferToImageBitmap();
}

/**
 * Rotates `raw` 90deg if it's landscape-shaped (width > height) while the
 * booth's viewport is portrait -- see CaptureMasterFrameOptions above.
 * Returns `raw` unchanged (same reference) when no rotation is needed, so
 * callers can tell whether a new bitmap was allocated.
 */
function maybeRotateToPortrait(raw: ImageBitmap, rotateCounterClockwise: boolean): ImageBitmap {
  const viewportIsPortrait = typeof window === "undefined" || window.innerHeight >= window.innerWidth;
  const frameIsLandscape = raw.width > raw.height;
  if (!viewportIsPortrait || !frameIsLandscape) {
    return raw;
  }

  const canvas = new OffscreenCanvas(raw.height, raw.width);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return raw;
  }
  drawRotated90(ctx, raw, raw.width, raw.height, !rotateCounterClockwise);
  return canvas.transferToImageBitmap();
}
