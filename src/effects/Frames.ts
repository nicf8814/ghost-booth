// Decorative photo frames (CLAUDE.md section 28's composition layer,
// section 24's "frame" concept). Drawn procedurally with Canvas 2D rather
// than shipping raster art assets -- no external files to source or license,
// works at any resolution, and matches "prefer browser-native APIs over
// unnecessary dependencies" (CLAUDE.md section 1). Each frame is an inset
// decoration drawn within the existing canvas bounds, not a canvas resize,
// so it never shifts the coordinate system debug landmark overlays rely on.

export type FrameKey = "none" | "classic" | "filmStrip";

export const FRAME_KEYS: FrameKey[] = ["none", "classic", "filmStrip"];

const ACCENT_ORANGE = "#ff7a1a";
const DARK = "#150500";

export function drawFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: string,
  width: number,
  height: number,
): void {
  switch (frame as FrameKey) {
    case "classic":
      drawClassicFrame(ctx, width, height);
      break;
    case "filmStrip":
      drawFilmStripFrame(ctx, width, height);
      break;
    case "none":
    default:
      // No frame -- CLAUDE.md section 49: an unrecognized/"none" frame key
      // degrades to no decoration rather than an error.
      break;
  }
}

/** A themed double-line border matching the app's orange/near-black palette. */
function drawClassicFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const outer = Math.round(width * 0.028);
  const gap = Math.max(2, Math.round(width * 0.006));

  ctx.save();
  ctx.strokeStyle = ACCENT_ORANGE;
  ctx.lineWidth = outer;
  ctx.strokeRect(outer / 2, outer / 2, width - outer, height - outer);

  ctx.strokeStyle = DARK;
  ctx.lineWidth = Math.max(1, Math.round(outer * 0.25));
  const innerInset = outer + gap;
  ctx.strokeRect(innerInset, innerInset, width - innerInset * 2, height - innerInset * 2);
  ctx.restore();
}

/** Black bars top/bottom with sprocket holes, evoking a film strip. */
function drawFilmStripFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const barHeight = Math.round(height * 0.07);
  const holeSize = Math.round(barHeight * 0.4);
  const holeGap = holeSize * 1.8;

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, barHeight);
  ctx.fillRect(0, height - barHeight, width, barHeight);

  ctx.fillStyle = "#ffffff";
  const holeY1 = (barHeight - holeSize) / 2;
  const holeY2 = height - barHeight + (barHeight - holeSize) / 2;
  for (let x = holeGap / 2; x < width; x += holeGap) {
    ctx.fillRect(x, holeY1, holeSize, holeSize);
    ctx.fillRect(x, holeY2, holeSize, holeSize);
  }
  ctx.restore();
}
