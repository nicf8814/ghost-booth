import type { GetUserMediaCameraManager } from "./CameraManager";
import { drawNormalized } from "../utils/orientation";

/**
 * Turns a raw captured frame into the "master" bitmap used by the rest of
 * the pipeline: orientation-normalized (un-mirrored), full resolution,
 * created once (CLAUDE.md section 7 — do not repeatedly resize the same
 * bitmap; keep separate preview/processing/master/print copies downstream).
 */
export async function captureMasterFrame(
  camera: GetUserMediaCameraManager,
  opts: { mirrorPreview: boolean } = { mirrorPreview: true },
): Promise<ImageBitmap> {
  const raw = await camera.captureFrame();

  if (!opts.mirrorPreview) {
    // Preview wasn't mirrored, so the raw capture is already correctly
    // oriented for printing.
    return raw;
  }

  // Preview was mirrored for a natural "look in a mirror" feel, so we
  // deliberately un-mirror the master copy here — once — rather than ever
  // printing a horizontally reversed photo.
  const canvas = new OffscreenCanvas(raw.width, raw.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return raw;
  }
  drawNormalized(ctx, raw, canvas.width, canvas.height, true);
  return canvas.transferToImageBitmap();
}
