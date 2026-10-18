// Ghost cameo: Nic's face cutout, turned into a pale see-through ghost that
// peeks into the photo from the left edge.

export type GhostMode = "off" | "toggle" | "random";

const CUTOUT_URL = "./cameo/nic-cutout.png";

let ghostPromise: Promise<HTMLCanvasElement | null> | null = null;

/** Loads and pre-processes the ghost once; later calls reuse it. */
export function loadGhost(): Promise<HTMLCanvasElement | null> {
  ghostPromise ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("ghost image failed to load"));
    img.src = CUTOUT_URL;
  })
    .then(ghostify)
    .catch(() => null);
  return ghostPromise;
}

/**
 * Pale blue-white, see-through, soft edges, and the bottom fades away so it
 * reads as a floating spirit instead of a pasted-on head. Done with plain
 * pixel math (not ctx.filter) so it works on older iPads too.
 */
function ghostify(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Soften the cutout edge: blur just the alpha channel a few pixels.
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = px[i * 4 + 3];
  const soft = boxBlur(boxBlur(alpha, w, h, 10), w, h, 10);

  for (let y = 0; y < h; y++) {
    // fade out the bottom 45% so it trails off like a wisp
    const t = y / h;
    const fade = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45) ** 1.5;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      const lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
      // lift shadows and tint toward icy blue
      const v = 95 + lum * 0.7;
      px[o] = Math.min(255, v * 0.86);
      px[o + 1] = Math.min(255, v * 0.95);
      px[o + 2] = Math.min(255, v * 1.08 + 20);
      px[o + 3] = Math.min(soft[i], alpha[i]) * 0.55 * fade;
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

/** Where the ghost goes inside the photo area: peeking in from the left. */
export function ghostPlacement(photo: { x: number; y: number; w: number; h: number }, ghostW: number, ghostH: number) {
  const w = photo.w * 0.4;
  const h = (w * ghostH) / ghostW;
  return {
    x: photo.x - w * 0.28, // partly hidden behind the left edge
    y: photo.y + photo.h * 0.16,
    w,
    h,
    tilt: 0.24, // radians, leaning in
  };
}

/** Draws the ghost; caller should already be clipped to the photo area. */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  ghost: HTMLCanvasElement,
  photo: { x: number; y: number; w: number; h: number },
) {
  const p = ghostPlacement(photo, ghost.width, ghost.height);
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(p.tilt);
  ctx.shadowColor = "rgba(170, 215, 255, 0.85)";
  ctx.shadowBlur = 60;
  ctx.drawImage(ghost, -p.w / 2, -p.h / 2, p.w, p.h);
  ctx.restore();
}
