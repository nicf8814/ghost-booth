import { CAPTION, PHOTO, PRINT_H, PRINT_W, coverCrop } from "./layout";

export const ORANGE = "#ff7a1a";
const BG = "#0e0c12";
const MUTED = "#b9b2c6";

export interface FrameText {
  title: string;
  subtitle: string;
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

/** A faint cobweb tucked into the top-right corner of the photo. */
function drawCornerWeb(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 2.5;
  const spokes = 6;
  const start = Math.PI / 2; // pointing down
  const end = Math.PI; // pointing left
  const angles: number[] = [];
  for (let i = 0; i <= spokes; i++) angles.push(start + ((end - start) * i) / spokes);
  for (const a of angles) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (r * ring) / 4.4;
    ctx.beginPath();
    for (let i = 0; i < angles.length; i++) {
      const px = cx + Math.cos(angles[i]) * rr;
      const py = cy + Math.sin(angles[i]) * rr;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        // sag toward the center between spokes
        const mid = (angles[i] + angles[i - 1]) / 2;
        const sag = rr * 0.86;
        ctx.quadraticCurveTo(cx + Math.cos(mid) * sag, cy + Math.sin(mid) * sag, px, py);
      }
    }
    ctx.stroke();
  }
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
 * Halloween touch (corner cobweb, a few bats, spooky title).
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
  drawCornerWeb(ctx, PHOTO.x + PHOTO.w, PHOTO.y, 230);
  ctx.restore();

  // Thin orange outline around the photo
  ctx.save();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 5;
  roundRectPath(ctx, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, radius);
  ctx.stroke();
  ctx.restore();

  // Caption
  const bandH = CAPTION.bottom - CAPTION.top;
  const titleY = CAPTION.top + bandH * 0.5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ORANGE;
  ctx.shadowColor = "rgba(255,122,26,0.55)";
  ctx.shadowBlur = 24;
  let titleSize = 112;
  ctx.font = `${titleSize}px Creepster, Impact, sans-serif`;
  while (ctx.measureText(text.title).width > PHOTO.w - 320 && titleSize > 48) {
    titleSize -= 4;
    ctx.font = `${titleSize}px Creepster, Impact, sans-serif`;
  }
  ctx.fillText(text.title, PRINT_W / 2, titleY);
  ctx.shadowBlur = 0;

  ctx.fillStyle = MUTED;
  ctx.font = "600 40px Inter, Helvetica, Arial, sans-serif";
  ctx.letterSpacing = "6px";
  ctx.fillText(text.subtitle.toUpperCase(), PRINT_W / 2, titleY + titleSize * 0.78);
  ctx.letterSpacing = "0px";

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
