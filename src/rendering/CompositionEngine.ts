// CLAUDE.md sections 28-29: layered composition, GPU-tiered rendering.

import { drawFrame } from "../effects/Frames";
import { drawOverlays } from "../effects/Overlays";
import type { OverlayKey } from "../effects/HalloweenEffects";
import { seededRandom } from "../utils/random";

export interface CompositionConfig {
  background?: ImageBitmap;
  ghosts: ImageBitmap[]; // back-to-front order
  foreground: ImageBitmap; // caricatured people
  caption?: string;
  frame?: string; // key into public/frames
  /** Halloween overlays (CLAUDE.md section 24) to draw between the foreground and the caption -- "decorative effects" in section 28's layer order. Empty/omitted draws nothing. */
  overlays?: OverlayKey[];
  /** Seeds overlay placement (which corner a cobweb lands in, etc). Pass the same value across repeated compose() calls for one photo so toggling overlays on/off doesn't shuffle their layout; omit for a fixed default (fine for a one-off compose). */
  overlaySeed?: string;
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
 * guaranteed fallback when WebGL2/WebGPU are unavailable. Layers
 * background -> ghosts -> foreground -> overlays -> caption -> frame
 * (CLAUDE.md section 28).
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

    if (config.overlays && config.overlays.length > 0) {
      drawOverlays(ctx, config.overlays, canvas.width, canvas.height, seededRandom(config.overlaySeed ?? "overlay"));
    }

    if (config.caption) {
      drawCaption(ctx, config.caption, canvas.width, canvas.height);
    }

    if (config.frame) {
      drawFrame(ctx, config.frame, canvas.width, canvas.height);
    }

    return canvas.transferToImageBitmap();
  }
}

/**
 * Draws the same caption treatment `compose()` uses, but directly onto a
 * standalone bitmap (Poster Mode's own gradient/vignette grade -- see
 * effects/PosterEffect.ts -- doesn't go through `compose()`, since a frame
 * and Poster's vignette are mutually exclusive treatments; the caption
 * toggle is independent of that choice and applies to either path). Never
 * throws (CLAUDE.md section 49) -- returns the source bitmap untouched if a
 * 2D context isn't available.
 */
export async function drawCaptionOnBitmap(source: ImageBitmap, caption: string): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  drawCaption(ctx, caption, canvas.width, canvas.height);
  return canvas.transferToImageBitmap();
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
