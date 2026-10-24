import { drawGhost, type GhostName } from "./ghost";
import { CAPTION, PHOTO, PRINT_H, PRINT_W, coverCrop } from "./layout";

export const ORANGE = "#ff7a1a";
const BG = "#0e0c12";

export interface FrameText {
  title: string;
  /** Pre-processed ghost cameos to drop into the photo. */
  ghosts?: { name: GhostName; canvas: HTMLCanvasElement }[];
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

/** Draws a little bat silhouette centered at (x, y). */
function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, tilt: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color;
  ctx.beginPath();
  // Body and ears
  ctx.moveTo(0, -14);
  ctx.lineTo(-6, -24);
  ctx.lineTo(-8, -12);
  // Left wing with scalloped edge
  ctx.quadraticCurveTo(-30, -26, -50, -8);
  ctx.quadraticCurveTo(-42, -4, -38, 6);
  ctx.quadraticCurveTo(-30, -2, -24, 8);
  ctx.quadraticCurveTo(-16, 0, -10, 12);
  ctx.quadraticCurveTo(-4, 8, 0, 18);
  // Right wing (mirror)
  ctx.quadraticCurveTo(4, 8, 10, 12);
  ctx.quadraticCurveTo(16, 0, 24, 8);
  ctx.quadraticCurveTo(30, -2, 38, 6);
  ctx.quadraticCurveTo(42, -4, 50, -8);
  ctx.quadraticCurveTo(30, -26, 8, -12);
  ctx.lineTo(6, -24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
 * Renders the finished print: the photo in a dark frame with a light
 * Halloween touch (a few bats, spooky title).
 */
export function renderPrint(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  text: FrameText,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext("2d")!;

  // Background with a soft purple glow behind the caption
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);
  const glow = ctx.createRadialGradient(PRINT_W / 2, PRINT_H, 50, PRINT_W / 2, PRINT_H, 700);
  glow.addColorStop(0, "rgba(120,60,170,0.35)");
  glow.addColorStop(1, "rgba(120,60,170,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  // Photo
  const radius = 28;
  const crop = coverCrop(srcW, srcH, PHOTO.w, PHOTO.h);
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
  // the corner pair first so the edge peekers (Nic, the bride) sit on top
  const ghosts = text.ghosts ?? [];
  const withPair = ghosts.some((g) => g.name === "man");
  const peeks = (g: { name: GhostName }) => g.name === "nic" || g.name === "bride";
  for (const g of ghosts.filter((g) => !peeks(g))) drawGhost(ctx, g.name, g.canvas, PHOTO);
  for (const g of ghosts.filter(peeks)) drawGhost(ctx, g.name, g.canvas, PHOTO, withPair);
  ctx.restore();

  // Thin orange outline around the photo
  ctx.save();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 5;
  roundRectPath(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, radius);
  ctx.stroke();
  ctx.restore();

  // Caption: one spooky line, or two balanced lines if it won't fit big
  const bandH = CAPTION.bottom - CAPTION.top;
  const centerY = CAPTION.top + bandH * 0.5;
  const maxW = PHOTO.w - 320;
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

  ctx.fillStyle = ORANGE;
  ctx.shadowColor = "rgba(255,122,26,0.55)";
  ctx.shadowBlur = 24;
  const lineH = size * 1.05;
  const firstY = centerY - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, PRINT_W / 2, firstY + i * lineH));
  ctx.shadowBlur = 0;
  const titleY = centerY;

  // Bats flanking the title
  const batColor = "#e9e3f2";
  drawBat(ctx, PHOTO.x + 70, titleY - 40, 110, -0.25, batColor);
  drawBat(ctx, PHOTO.x + 150, titleY - 95, 62, 0.15, batColor);
  drawBat(ctx, PHOTO.x + PHOTO.w - 70, titleY - 30, 96, 0.3, batColor);

  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))),
      "image/jpeg",
      0.92,
    );
  });
}
