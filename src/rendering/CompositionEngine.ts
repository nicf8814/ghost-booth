// CLAUDE.md sections 28-29: layered composition, GPU-tiered rendering.

export interface CompositionConfig {
  background?: ImageBitmap;
  ghosts: ImageBitmap[]; // back-to-front order
  foreground: ImageBitmap; // caricatured people
  caption?: string;
  frame?: string; // key into public/frames
  brandingText?: string;
}

export interface CompositionEngine {
  compose(config: CompositionConfig): Promise<ImageBitmap>;
}

export type RenderTier = "webgpu" | "webgl2" | "canvas2d";

/** Feature-detects the best available rendering tier (CLAUDE.md section 29). */
export function detectRenderTier(): RenderTier {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    return "webgpu";
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    if (canvas.getContext("webgl2")) {
      return "webgl2";
    }
  }
  return "canvas2d";
}

/**
 * Canvas2D composition, used as the baseline implementation and as the
 * guaranteed fallback when WebGL2/WebGPU are unavailable. Currently just
 * layers the foreground over the background; ghosts/caption/frame are
 * layered in as those subsystems land (Phase 8).
 */
export class Canvas2DCompositionEngine implements CompositionEngine {
  async compose(config: CompositionConfig): Promise<ImageBitmap> {
    const { foreground } = config;
    const canvas = new OffscreenCanvas(foreground.width, foreground.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // No 2D context available at all: return the foreground untouched
      // rather than throwing (CLAUDE.md section 49).
      return foreground;
    }

    if (config.background) {
      ctx.drawImage(config.background, 0, 0, canvas.width, canvas.height);
    }
    for (const ghost of config.ghosts) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(ghost, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(foreground, 0, 0);

    if (config.caption) {
      drawCaption(ctx, config.caption, canvas.width, canvas.height);
    }

    return canvas.transferToImageBitmap();
  }
}

function drawCaption(
  ctx: OffscreenCanvasRenderingContext2D,
  caption: string,
  width: number,
  height: number,
): void {
  const fontSize = Math.round(width * 0.045);
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  const x = width / 2;
  const y = height - fontSize * 1.2;
  ctx.strokeText(caption, x, y);
  ctx.fillText(caption, x, y);
}
