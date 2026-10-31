import { CAPTION, PHOTO, PRINT_H, PRINT_W, type Rect } from "./layout";

/** Border styles the booth can print with (chosen in the hidden settings). */
export type FrameId = "classic" | "parchment" | "filigree";

export const FRAME_IDS: FrameId[] = ["classic", "parchment", "filigree"];

export const FRAME_LABELS: Record<FrameId, string> = {
  classic: "Classic (dark with orange line and bats)",
  parchment: "Victorian parchment",
  filigree: "Victorian filigree on cream",
};

export interface FrameSpec {
  /** Where the photo sits, in 1200x1800 print coordinates. */
  photo: Rect;
  /** Vertical band for the caption below the photo. */
  captionTop: number;
  captionBottom: number;
  /** Plain background color (always painted first). */
  bg: string;
  /** Optional full-print background picture, stretched to the print. */
  bgImage?: string;
  /** Optional ornament picture drawn ON TOP of the photo, stretched to the print. */
  overlay?: string;
  textColor: string;
  /** Orange glow behind the caption and the purple wash (classic only). */
  glow: boolean;
  bats: boolean;
  outline: { color: string; width: number; radius: number };
  /**
   * "Soft edges" layout: the photo has no outline and its edges fade into the
   * background over `feather` pixels, so it can be a bit bigger.
   */
  soft?: { photo: Rect; feather: number };
}

export const FRAMES: Record<FrameId, FrameSpec> = {
  classic: {
    photo: PHOTO,
    captionTop: CAPTION.top,
    captionBottom: CAPTION.bottom,
    bg: "#0e0c12",
    textColor: "#ff7a1a",
    glow: true,
    bats: true,
    outline: { color: "#ff7a1a", width: 5, radius: 28 },
  },
  // The corner ornaments are drawn over the photo, so the photo can be large.
  // Tune these numbers to move the photo or caption inside the border.
  parchment: {
    photo: { x: 100, y: 130, w: 1000, h: 1310 },
    captionTop: 1450,
    captionBottom: 1700,
    bg: "#e9dcc0",
    bgImage: "./frames/parchment.jpg",
    overlay: "./frames/parchment-ink.png",
    textColor: "#1f140a",
    glow: false,
    bats: false,
    outline: { color: "#2a1c0e", width: 4, radius: 6 },
    soft: { photo: { x: 70, y: 105, w: 1060, h: 1350 }, feather: 80 },
  },
  filigree: {
    photo: { x: 80, y: 130, w: 1040, h: 1320 },
    captionTop: 1465,
    captionBottom: 1700,
    bg: "#efe3cd",
    overlay: "./frames/filigree.png",
    textColor: "#1f140a",
    glow: false,
    bats: false,
    outline: { color: "#2a1c0e", width: 4, radius: 6 },
    soft: { photo: { x: 60, y: 110, w: 1080, h: 1350 }, feather: 80 },
  },
};

export interface LoadedFrame {
  id: FrameId;
  spec: FrameSpec;
  bgImage?: HTMLImageElement;
  overlay?: HTMLImageElement;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Couldn't load ${url}`));
      img.src = url;
    });
    imageCache.set(url, p);
    // Let a failed load be retried next time.
    p.catch(() => imageCache.delete(url));
  }
  return p;
}

/** Loads (and caches) the pictures a frame style needs. Falls back to what loaded. */
export async function loadFrame(id: FrameId): Promise<LoadedFrame> {
  const spec = FRAMES[id] ?? FRAMES.classic;
  const [bgImage, overlay] = await Promise.all([
    spec.bgImage ? loadImage(spec.bgImage).catch(() => undefined) : undefined,
    spec.overlay ? loadImage(spec.overlay).catch(() => undefined) : undefined,
  ]);
  return { id, spec, bgImage, overlay };
}

/** Draws a picture stretched over the whole print. */
export function drawFullPrint(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  ctx.drawImage(img, 0, 0, PRINT_W, PRINT_H);
}
