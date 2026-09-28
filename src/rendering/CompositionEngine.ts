// CLAUDE.md sections 28-29: layered composition, GPU-tiered rendering.

export interface CompositionConfig {
  foreground: ImageBitmap; // caricatured people
  caption?: string;
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
 * foreground -> caption (CLAUDE.md section 28's full
 * layer order is background/fog/ghosts/foreground/decorative-effects/
 * caption/frame/branding -- this engine only implements the layers this
 * app actually populates today: "My Cameo" ghosts are composited directly
 * onto the foreground bitmap before it ever reaches here (see
 * OwnerCameoEngine.ts), not layered through a `ghosts` list, since Phase 6
 * person segmentation -- which the spec's translucent-echo ghost design
 * assumes -- was tried and reverted (see PROJECT_LOG.md). Background/fog
 * and date/branding layers were never populated by any caller and were
 * removed as dead config surface; revive them from git history
 * (pre-`drawCaptionOnBitmap` commits) if Phase 6 or a background feature
 * gets built later).
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

    ctx.drawImage(foreground, 0, 0);

    if (config.caption) {
      drawCaption(ctx, config.caption, canvas.width, canvas.height);
    }

    return canvas.transferToImageBitmap();
  }
}

/**
 * Draws the same caption treatment `compose()` uses, but directly onto a
 * standalone bitmap without going through the rest of `compose()`'s layers.
 * Not currently used by CapturePipeline.ts's composeSelectedBitmap -- Poster
 * Mode's grade (effects/PosterEffect.ts) is now applied to the *source*
 * before it reaches `compose()`, so the caption/overlay layers there handle
 * poster-graded photos the same as any other. Kept as a small standalone
 * utility (and its own tests) for anything that needs just the caption
 * treatment without the rest of the composition pipeline. Never throws
 * (CLAUDE.md section 49) -- returns the source bitmap untouched if a 2D
 * context isn't available.
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
