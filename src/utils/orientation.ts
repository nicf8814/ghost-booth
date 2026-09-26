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
