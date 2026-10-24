// Ghost cameos: cutouts turned into pale, see-through ghosts that haunt the
// photo. Each ghost has its own look and spot in the frame.

export type GhostMode = "off" | "toggle" | "random";
export type GhostName = "nic" | "bride" | "man" | "woman";

/** What the review button cycles through, in order. */
export const GHOST_CHOICES: GhostName[][] = [
  [],
  ["nic"],
  ["bride"],
  ["man", "woman"],
  ["nic", "bride", "man", "woman"],
];

export const GHOST_LABELS = [
  "Add a ghost",
  "Ghost: Nic",
  "Ghost: the bride",
  "Ghost: the couple",
  "Ghosts: everyone",
];

interface GhostStyle {
  url: string;
  /** overall opacity, 0-1 */
  opacity: number;
  /** where the fade-out at the bottom starts (0 top, 1 bottom) */
  fadeStart: number;
  /**
   * How much dark areas turn invisible (0 = not at all, 1 = fully). Dark
   * clothing vanishing while faces and collars glow is what makes a full
   * figure read as a spirit instead of a cutout.
   */
  darkFade: number;
}

const STYLES: Record<GhostName, GhostStyle> = {
  nic: { url: "./cameo/nic-cutout.png", opacity: 0.55, fadeStart: 0.55, darkFade: 0 },
  bride: { url: "./cameo/ghost-bride.png", opacity: 0.6, fadeStart: 0.85, darkFade: 0.1 },
  man: { url: "./cameo/victorian-man.png", opacity: 0.83, fadeStart: 0.4, darkFade: 0.7 },
  woman: { url: "./cameo/victorian-woman.png", opacity: 0.83, fadeStart: 0.4, darkFade: 0.7 },
};

const cache = new Map<GhostName, Promise<HTMLCanvasElement | null>>();

/** Loads and pre-processes a ghost once; later calls reuse it. */
export function loadGhost(name: GhostName): Promise<HTMLCanvasElement | null> {
  let p = cache.get(name);
  if (!p) {
    const style = STYLES[name];
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`ghost ${name} failed to load`));
      img.src = style.url;
    })
      .then((img) => ghostify(img, style))
      .catch(() => null);
    cache.set(name, p);
  }
  return p;
}

/**
 * Pale blue-white, see-through, soft edges, and the bottom fades away so it
 * reads as a floating spirit. Plain pixel math (not ctx.filter) so it works
 * on older iPads too.
 */
function ghostify(img: HTMLImageElement, style: GhostStyle): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Soften the cutout edge: blur just the alpha channel.
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = px[i * 4 + 3];
  const soft = boxBlur(boxBlur(alpha, w, h, 10), w, h, 10);

  const span = 1 - style.fadeStart;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const fade = t < style.fadeStart ? 1 : Math.max(0, 1 - (t - style.fadeStart) / span) ** 1.5;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      // feather the left and right 15% so cutouts clipped by their original
      // photo's edge don't leave a hard line
      const edge = Math.min(1, Math.min(x, w - 1 - x) / (w * 0.15));
      const side = edge * edge * (3 - 2 * edge);
      const lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
      // lift shadows and tint toward icy blue
      const v = 95 + lum * 0.7;
      px[o] = Math.min(255, v * 0.86);
      px[o + 1] = Math.min(255, v * 0.95);
      px[o + 2] = Math.min(255, v * 1.08 + 20);
      const bright = Math.min(1, lum / 140);
      const darkKeep = 1 - style.darkFade * (1 - bright);
      px[o + 3] = Math.min(soft[i], alpha[i]) * style.opacity * fade * darkKeep * side;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / span;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / span;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Where each ghost goes inside the photo area. The Victorian pair haunt the
 * top corners so the middle stays clear for guests' faces. Nic peeks in from
 * the left edge and the bride from the right edge, both lower down when the
 * pair is already up in the corners.
 */
export function ghostPlacement(name: GhostName, photo: Rect, ghostW: number, ghostH: number, withPair = false) {
  if (name === "man") {
    const w = photo.w * 0.3;
    const h = (w * ghostH) / ghostW;
    return { x: photo.x - w * 0.1, y: photo.y + photo.h * 0.02, w, h, tilt: 0 };
  }
  if (name === "woman") {
    const w = photo.w * 0.3;
    const h = (w * ghostH) / ghostW;
    return { x: photo.x + photo.w - w * 0.9, y: photo.y + photo.h * 0.08, w, h, tilt: 0 };
  }
  if (name === "bride") {
    // peeking in from the right edge, upright, bouquet in view
    const w = photo.w * 0.357; // 15% smaller than the original 0.42
    const h = (w * ghostH) / ghostW;
    return { x: photo.x + photo.w - w * 0.95, y: photo.y + photo.h * (withPair ? 0.36 : 0.12), w, h, tilt: 0 };
  }
  // Nic: small head peeking in from the left edge
  const w = photo.w * 0.4;
  const h = (w * ghostH) / ghostW;
  return { x: photo.x - w * 0.28, y: photo.y + photo.h * (withPair ? 0.4 : 0.16), w, h, tilt: 0.24 };
}

/** Draws a ghost; caller should already be clipped to the photo area. */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  name: GhostName,
  ghost: HTMLCanvasElement,
  photo: Rect,
  withPair = false,
) {
  const p = ghostPlacement(name, photo, ghost.width, ghost.height, withPair);
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(p.tilt);
  ctx.shadowColor = "rgba(170, 215, 255, 0.85)";
  ctx.shadowBlur = name === "nic" || name === "bride" ? 60 : 45;
  ctx.drawImage(ghost, -p.w / 2, -p.h / 2, p.w, p.h);
  ctx.restore();
}
