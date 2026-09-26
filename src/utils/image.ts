// Small shared image helpers to avoid repeatedly resizing/re-encoding the
// same bitmap across the capture -> processing -> print pipeline
// (CLAUDE.md sections 7, 40).

export async function canvasToImageBitmap(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<ImageBitmap> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.transferToImageBitmap();
  }
  return createImageBitmap(canvas);
}

export async function imageBitmapToBlob(
  bitmap: ImageBitmap,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context unavailable for image encoding");
  }
  ctx.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type, quality });
}

/** Fits `width`x`height` into a target box while preserving aspect ratio. */
export function fitContain(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
