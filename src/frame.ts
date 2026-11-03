import { drawGhost, ghostPlacement, type GhostName } from "./ghost";
import { FRAME, drawFullPrint, type LoadedFrame } from "./frames";
import { PRINT_H, PRINT_W, coverCrop } from "./layout";

export interface FrameText {
  title: string;
  /** Pre-processed ghost cameos to drop into the photo. */
  ghosts?: { name: GhostName; canvas: HTMLCanvasElement }[];
  /** The border pictures; the plain cream frame without ornaments when left out. */
  frame?: LoadedFrame;
  /** "soft" fades the photo into the border (Victorian styles); default soft. */
  edges?: "soft" | "sharp";
}

/** Splits text into two lines of roughly equal length at a space. */
export function splitBalanced(text: string): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return [text];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * How bright the picture is behind a spot, 0-255, weighting only drawn pixels.
 * `k` converts print coordinates to this canvas's pixels.
 */
function backdropLuminance(src: HTMLCanvasElement, k: number, r: { x: number; y: number; w: number; h: number }): number {
  const x0 = Math.max(0, Math.floor(r.x * k));
  const y0 = Math.max(0, Math.floor(r.y * k));
  const x1 = Math.min(src.width, Math.ceil((r.x + r.w) * k));
  const y1 = Math.min(src.height, Math.ceil((r.y + r.h) * k));
  if (x1 <= x0 || y1 <= y0) return 128;
  const t = document.createElement("canvas");
  t.width = 12;
  t.height = 12;
  const tc = t.getContext("2d")!;
  tc.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, 12, 12);
  const d = tc.getImageData(0, 0, 12, 12).data;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < 144; i++) {
    const a = d[i * 4 + 3] / 255;
    sum += (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a;
    weight += a;
  }
  return weight > 1 ? sum / weight : 128;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Makes the edges of whatever is already drawn inside `r` fade to transparent
 * over `feather` pixels. Each edge is a smooth ramp; the four ramps multiply,
 * so the corners fade smoothly too.
 */
function fadeEdges(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, feather: number) {
  const f = Math.min(feather, r.w / 2, r.h / 2);
  const ramp = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    // smoothstep-ish stops so there is no visible band where the fade starts
    for (const [t, a] of [[0, 0], [0.25, 0.1], [0.5, 0.5], [0.75, 0.9], [1, 1]] as const) {
      g.addColorStop(t, `rgba(0,0,0,${a})`);
    }
    return g;
  };
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const big = { x: -10_000, y: -10_000, w: 20_000, h: 20_000 };
  for (const g of [
    ramp(r.x, 0, r.x + f, 0), // left
    ramp(r.x + r.w, 0, r.x + r.w - f, 0), // right
    ramp(0, r.y, 0, r.y + f), // top
    ramp(0, r.y + r.h, 0, r.y + r.h - f), // bottom
  ]) {
    ctx.fillStyle = g;
    ctx.fillRect(big.x, big.y, big.w, big.h);
  }
  ctx.restore();
}

/**
 * Renders the finished print: the photo in the filigree border with the
 * spooky title below it.
 */
export function renderPrint(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  text: FrameText,
  scale = 1,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PRINT_W * scale);
  canvas.height = Math.round(PRINT_H * scale);
  const ctx = canvas.getContext("2d")!;
  // Everything below is drawn in 1200x1800 print coordinates; scale > 1 just
  // renders the same picture with more pixels (the hi-res export).
  ctx.scale(canvas.width / PRINT_W, canvas.height / PRINT_H);
  // The camera frame is now larger than the print, so downscale it carefully.
  ctx.imageSmoothingQuality = "high";

  const frame = text.frame ?? { spec: FRAME };
  const spec = frame.spec;
  const soft = text.edges !== "sharp";
  const PHOTO = soft ? spec.soft.photo : spec.photo;

  // Background: cream paper
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  // Photo
  const radius = spec.outline.radius;
  const crop = coverCrop(srcW, srcH, PHOTO.w, PHOTO.h);
  // the corner pair first so the edge peekers (Kristen, the bride, Ryan) sit on top
  const ghosts = text.ghosts ?? [];
  const withPair = ghosts.some((g) => g.name === "man");
  const peeks = (g: { name: GhostName }) => g.name === "kristen" || g.name === "bride" || g.name === "ryan";
  const drawGhosts = (c: CanvasRenderingContext2D) => {
    // Measure the backdrop behind every ghost before drawing any of them, so
    // a ghost can stand out against a bright wall (see drawGhost).
    const k = c.canvas.width / PRINT_W;
    const lums = new Map<GhostName, number>();
    for (const g of ghosts) {
      const r = ghostPlacement(g.name, PHOTO, g.canvas.width, g.canvas.height, peeks(g) ? withPair : false);
      lums.set(g.name, backdropLuminance(c.canvas, k, r));
    }
    for (const g of ghosts.filter((g) => !peeks(g))) drawGhost(c, g.name, g.canvas, PHOTO, false, scale, lums.get(g.name));
    for (const g of ghosts.filter(peeks)) drawGhost(c, g.name, g.canvas, PHOTO, withPair, scale, lums.get(g.name));
  };

  if (soft) {
    // Draw the photo and ghosts on their own layer, fade the layer's edges
    // out, then lay it on the background so it melts into the paper.
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lctx = layer.getContext("2d")!;
    lctx.scale(canvas.width / PRINT_W, canvas.height / PRINT_H);
    lctx.imageSmoothingQuality = "high";
    lctx.save();
    lctx.beginPath();
    lctx.rect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
    lctx.clip();
    lctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
    drawGhosts(lctx); // ghosts fade with the photo, so edge peekers melt in too
    lctx.restore();
    fadeEdges(lctx, PHOTO, spec.soft.feather);
    ctx.drawImage(layer, 0, 0, PRINT_W, PRINT_H);
  } else {
    ctx.save();
    roundRectPath(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, radius);
    ctx.clip();
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
    // gentle vignette so it feels moody without darkening faces
    const vig = ctx.createRadialGradient(
      PRINT_W / 2, PHOTO.y + PHOTO.h / 2, PHOTO.h * 0.35,
      PRINT_W / 2, PHOTO.y + PHOTO.h / 2, PHOTO.h * 0.75,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(10,0,20,0.35)");
    ctx.fillStyle = vig;
    ctx.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
    drawGhosts(ctx);
    ctx.restore();

    // Thin outline around the photo
    ctx.save();
    ctx.strokeStyle = spec.outline.color;
    ctx.lineWidth = spec.outline.width;
    roundRectPath(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, radius);
    ctx.stroke();
    ctx.restore();
  }

  // Ornaments go on top of the photo so the corners can overlap it.
  if (frame.overlay) drawFullPrint(ctx, frame.overlay);

  // Caption: one spooky line, or two balanced lines if it won't fit big
  const bandH = spec.captionBottom - spec.captionTop;
  const centerY = spec.captionTop + bandH * 0.5;
  const maxW = PHOTO.w - 320;

  // The booth's own hand lettering stands in for the default title.
  if (frame.lettering && /^heisterkamp halloween/i.test(text.title.trim())) {
    const img = frame.lettering;
    const ratio = img.naturalWidth / img.naturalHeight;
    const h = Math.min(bandH - 10, maxW / ratio);
    const w = h * ratio;
    ctx.drawImage(img, (PRINT_W - w) / 2, centerY - h / 2, w, h);
    return canvas;
  }
  const fontAt = (px: number) => `${px}px Creepster, Impact, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let lines = [text.title];
  ctx.font = fontAt(112);
  if (ctx.measureText(text.title).width > maxW) lines = splitBalanced(text.title);
  let size = lines.length === 1 ? 112 : 100;
  ctx.font = fontAt(size);
  while (Math.max(...lines.map((l) => ctx.measureText(l).width)) > maxW && size > 40) {
    size -= 4;
    ctx.font = fontAt(size);
  }

  ctx.fillStyle = spec.textColor;
  const lineH = size * 1.05;
  const firstY = centerY - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, PRINT_W / 2, firstY + i * lineH));

  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))),
      "image/jpeg",
      quality,
    );
  });
}
