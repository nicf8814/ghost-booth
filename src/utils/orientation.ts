// CLAUDE.md section 5/7: the live preview may be mirrored, but the final
// photograph needs a deliberate, non-accidental orientation policy so we
// never print a horizontally reversed photo.

/**
 * Draws a source frame onto a canvas, optionally flipping horizontally.
 * Used to "un-mirror" a selfie-style preview before it becomes the master
 * bitmap that gets processed/printed.
 */
export function drawNormalized(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  mirror: boolean,
): void {
  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, width, height);
  ctx.restore();
}

/**
 * Draws a `sourceWidth` x `sourceHeight` source frame onto a canvas rotated
 * 90deg, landscape-to-portrait (or vice versa) -- the canvas passed in must
 * already be sized `sourceHeight` x `sourceWidth` (dimensions swapped).
 *
 * Needed because on this booth's portrait iPad mount, iOS Safari's
 * getUserMedia can still hand back a landscape-shaped video frame (the
 * front camera's sensor is physically landscape; portrait ideal
 * width/height constraints are only a hint -- see CameraManager.ts) even
 * though the live <video> preview displays it correctly rotated via an
 * internal transform that plain canvas/ImageBitmap capture does not
 * inherit. captureMasterFrame detects that width>height mismatch against
 * the portrait viewport and calls this to rotate the actual pixel data
 * to match, once, before any other processing.
 */
export function drawRotated90(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  clockwise: boolean,
): void {
  ctx.save();
  if (clockwise) {
    ctx.translate(sourceHeight, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, sourceWidth);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  ctx.restore();
}
