// Decorative photo frames (CLAUDE.md section 28's composition layer,
// section 24's "frame" concept). Drawn procedurally with Canvas 2D rather
// than shipping raster art assets -- no external files to source or license,
// works at any resolution, and matches "prefer browser-native APIs over
// unnecessary dependencies" (CLAUDE.md section 1). Each frame is an inset
// decoration drawn within the existing canvas bounds, not a canvas resize,
// so it never shifts the coordinate system debug landmark overlays rely on.

export type FrameKey =
  | "none"
  | "classic"
  | "filmStrip"
  | "polaroid"
  | "spooky"
  | "torn"
  | "heisterkamp";

export const FRAME_KEYS: FrameKey[] = [
  "none",
  "classic",
  "filmStrip",
  "polaroid",
  "spooky",
  "torn",
  "heisterkamp",
];

export const FRAME_LABELS: Record<FrameKey, string> = {
  none: "No Frame",
  classic: "Classic",
  filmStrip: "Film Strip",
  polaroid: "Polaroid",
  spooky: "Spooky Border",
  torn: "Torn Edge",
  heisterkamp: "Heisterkamp Halloween",
};

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
    case "polaroid":
      drawPolaroidFrame(ctx, width, height);
      break;
    case "spooky":
      drawSpookyFrame(ctx, width, height);
      break;
    case "torn":
      drawTornFrame(ctx, width, height);
      break;
    case "heisterkamp":
      drawHeisterkampFrame(ctx, width, height);
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

/** Thick white border, extra-deep on the bottom, mimicking a classic instant-film print. */
function drawPolaroidFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const side = Math.round(width * 0.05);
  const top = Math.round(height * 0.05);
  const bottom = Math.round(height * 0.16);

  ctx.save();
  ctx.fillStyle = "#f5f2e8";
  // Four separate rects rather than one border stroke so the bottom band
  // can be deeper than the other three sides (the instant-film tell).
  ctx.fillRect(0, 0, width, top);
  ctx.fillRect(0, height - bottom, width, bottom);
  ctx.fillRect(0, 0, side, height);
  ctx.fillRect(width - side, 0, side, height);

  // A faint inner shadow line where the border meets the photo, so the
  // border reads as sitting in front of the image rather than painted flat.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = Math.max(1, side * 0.15);
  ctx.strokeRect(side, top, width - side * 2, height - top - bottom);
  ctx.restore();
}

/** Ornate black/orange Halloween border with a scalloped inner edge and corner bat silhouettes. */
function drawSpookyFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const outer = Math.round(width * 0.035);

  ctx.save();
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(0, 0, width, outer);
  ctx.fillRect(0, height - outer, width, outer);
  ctx.fillRect(0, 0, outer, height);
  ctx.fillRect(width - outer, 0, outer, height);

  // Scalloped orange line just inside the black border -- a row of small
  // overlapping arcs instead of a straight stroke.
  const scallopR = outer * 0.55;
  ctx.fillStyle = ACCENT_ORANGE;
  for (let x = outer + scallopR; x < width - outer; x += scallopR * 1.7) {
    ctx.beginPath();
    ctx.arc(x, outer * 0.55, scallopR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, height - outer * 0.55, scallopR, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = outer + scallopR; y < height - outer; y += scallopR * 1.7) {
    ctx.beginPath();
    ctx.arc(outer * 0.55, y, scallopR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width - outer * 0.55, y, scallopR, 0, Math.PI * 2);
    ctx.fill();
  }

  // A small bat silhouette tucked into each corner.
  const batSize = outer * 0.85;
  drawTinyBat(ctx, outer * 1.4, outer * 1.4, batSize);
  drawTinyBat(ctx, width - outer * 1.4, outer * 1.4, batSize);
  drawTinyBat(ctx, outer * 1.4, height - outer * 1.4, batSize);
  drawTinyBat(ctx, width - outer * 1.4, height - outer * 1.4, batSize);
  ctx.restore();
}

/** A small bat glyph for drawSpookyFrame's corners -- simpler than Overlays.ts's drawBat since it just needs to read at corner-icon scale, not as a full decorative overlay. */
function drawTinyBat(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.fillStyle = "#150500";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx - size, cy - size * 0.6, cx - size * 1.4, cy);
  ctx.quadraticCurveTo(cx - size * 0.5, cy + size * 0.15, cx, cy + size * 0.1);
  ctx.quadraticCurveTo(cx + size * 0.5, cy + size * 0.15, cx + size * 1.4, cy);
  ctx.quadraticCurveTo(cx + size, cy - size * 0.6, cx, cy);
  ctx.closePath();
  ctx.fill();
}

/** A jagged, hand-torn-paper edge instead of a clean rectangle border. */
function drawTornFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const depth = width * 0.02;
  const step = width * 0.035;

  ctx.save();
  ctx.fillStyle = "#fdfaf2";
  // A jagged ring: draw the outer rect, then punch a jagged-edged hole
  // through it (even-odd fill rule) so only a torn-looking border remains.
  ctx.beginPath();
  ctx.rect(0, 0, width, height);

  const inset = depth * 2.5;
  jaggedRectPath(ctx, inset, inset, width - inset * 2, height - inset * 2, step, depth);
  ctx.fill("evenodd");
  ctx.restore();
}

/** Traces a rectangle whose edge wanders by up to `depth` at every `step`, giving a torn-paper silhouette. Deterministic (no rng) so a frame preview never shifts between renders of the same size. */
function jaggedRectPath(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  step: number,
  depth: number,
): void {
  const wobble = (i: number) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const jag = (base: number, i: number) => base + (wobble(i) - 0.5) * depth * 2;

  ctx.beginPath();
  let i = 0;
  ctx.moveTo(x, jag(y, i++));
  for (let px = x; px < x + w; px += step) ctx.lineTo(px, jag(y, i++));
  ctx.lineTo(x + w, jag(y, i++));
  for (let py = y; py < y + h; py += step) ctx.lineTo(jag(x + w, i++), py);
  ctx.lineTo(jag(x + w, i++), y + h);
  for (let px = x + w; px > x; px -= step) ctx.lineTo(px, jag(y + h, i++));
  ctx.lineTo(x, jag(y + h, i++));
  for (let py = y + h; py > y; py -= step) ctx.lineTo(jag(x, i++), py);
  ctx.closePath();
}

/** The named event frame: a black banner across the bottom reading "HEISTERKAMP HALLOWEEN 2027" in bold horror lettering, with blood dripping *from* the banner's top edge into the photo above it -- not across the text itself, which stays clean and legible. Font size auto-shrinks to fit the banner width so the text is never clipped or cramped at any photo size. */
function drawHeisterkampFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();

  // Thin blood-drip accent along the very top edge of the whole frame --
  // unrelated to the banner, just carries the "dripping" motif to the top
  // of the photo too.
  drawBloodDrips(ctx, width, 0, width * 0.02, "rgba(120, 8, 12, 0.85)", 1);

  // Bottom banner.
  const bannerH = Math.round(height * 0.13);
  const bannerY = height - bannerH;
  ctx.fillStyle = "#0a0508";
  ctx.fillRect(0, bannerY, width, bannerH);

  // Blood dripping *down from the banner's top edge into the photo above
  // it* -- drawn before the text, and entirely outside the banner
  // rectangle, so it never crosses into the text area below.
  drawBloodDrips(ctx, width, bannerY, bannerH * 0.55, "rgba(150, 10, 14, 0.88)", -1);

  const text = "HEISTERKAMP HALLOWEEN 2027";
  const maxTextWidth = width * 0.92;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shrink the font until the full line fits the banner width -- a fixed
  // size clipped or crowded the text on narrower photos, which was the
  // main legibility problem. Floors out at a still-readable minimum rather
  // than shrinking forever.
  let fontSize = Math.round(bannerH * 0.5);
  const minFontSize = Math.round(bannerH * 0.22);
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  while (fontSize > minFontSize && ctx.measureText(text).width > maxTextWidth) {
    fontSize -= 1;
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  }

  const textY = bannerY + bannerH * 0.5;

  // A solid black outline (not a close-in-color offset copy, which reads
  // as a smudge more than a shadow) gives the cream fill real contrast
  // against the near-black banner regardless of font size.
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(2, fontSize * 0.1);
  ctx.strokeText(text, width / 2, textY);
  ctx.fillStyle = "#f4e6c8";
  ctx.fillText(text, width / 2, textY);

  ctx.restore();
}

/** A deterministic row of uneven blood-drip streaks hanging from `y`, either downward (`direction: 1`, into the photo below) or upward (`direction: -1`, into the photo above -- used for drips that hang from the *top* of a bottom banner without crossing into it). Shared by drawHeisterkampFrame's top-of-frame accent and its banner-edge drips. No rng (frames must render identically every time for a given size), so drip lengths/positions come from a fixed trig-based wobble instead. */
function drawBloodDrips(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  y: number,
  maxDripLen: number,
  color: string,
  direction: 1 | -1,
): void {
  const count = Math.max(6, Math.round(width / 42));
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const x = t * width + Math.sin(i * 7.13) * 6;
    const wobble = (Math.sin(i * 3.71) + 1) / 2; // 0..1, deterministic per index
    const dripLen = direction * maxDripLen * (0.25 + wobble * 0.75);
    const dripW = maxDripLen * (0.14 + wobble * 0.1);

    // A rounded "bead" at the drip's base, tapering into a thin trail.
    ctx.beginPath();
    ctx.moveTo(x - dripW * 0.5, y);
    ctx.quadraticCurveTo(x - dripW * 0.5, y + dripLen * 0.6, x, y + dripLen);
    ctx.quadraticCurveTo(x + dripW * 0.5, y + dripLen * 0.6, x + dripW * 0.5, y);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y + dripLen, dripW * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}
