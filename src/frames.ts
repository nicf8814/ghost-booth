import { PRINT_H, PRINT_W, type Rect } from "./layout";

/**
 * The booth's one border: dark filigree linework (public/frames/filigree.png)
 * on cream. The ornament picture is drawn over the photo so its corners can
 * overlap it. Coordinates are in 1200x1800 print pixels; tune them here to move
 * the photo or the caption inside the border.
 */
export interface FrameSpec {
  /** Photo rectangle for the "sharp" look (thin outline around the photo). */
  photo: Rect;
  /** Vertical band for the caption below the photo. */
  captionTop: number;
  captionBottom: number;
  bg: string;
  /** Ornament picture drawn on top of the photo, stretched to the print. */
  overlay: string;
  textColor: string;
  outline: { color: string; width: number; radius: number };
  /** "Soft" look: no outline, the photo's edges fade into the paper. */
  soft: { photo: Rect; feather: number };
}

export const FRAME: FrameSpec = {
  photo: { x: 80, y: 130, w: 1040, h: 1320 },
  captionTop: 1465,
  captionBottom: 1700,
  bg: "#efe3cd",
  overlay: "./frames/filigree.png",
  textColor: "#1f140a",
  outline: { color: "#2a1c0e", width: 4, radius: 6 },
  soft: { photo: { x: 60, y: 110, w: 1080, h: 1350 }, feather: 80 },
};

export interface LoadedFrame {
  spec: FrameSpec;
  overlay?: HTMLImageElement;
}

let overlayPromise: Promise<HTMLImageElement> | null = null;

function loadOverlay(): Promise<HTMLImageElement> {
  if (!overlayPromise) {
    overlayPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't load the border picture"));
      img.src = FRAME.overlay;
    });
    // Let a failed load be retried next time.
    overlayPromise.catch(() => (overlayPromise = null));
  }
  return overlayPromise;
}

/** Loads (and caches) the border picture. If it can't load, the print still works without it. */
export async function loadFrame(): Promise<LoadedFrame> {
  const overlay = await loadOverlay().catch(() => undefined);
  return { spec: FRAME, overlay };
}

/** Draws a picture stretched over the whole print. */
export function drawFullPrint(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  ctx.drawImage(img, 0, 0, PRINT_W, PRINT_H);
}
