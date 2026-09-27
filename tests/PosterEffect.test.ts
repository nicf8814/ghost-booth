import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POSTER_TINTS, applyPosterEffect, type PosterTint } from "../src/effects/PosterEffect";

function makeFakeCtx() {
  return {
    filter: "none",
    fillStyle: "",
    globalCompositeOperation: "source-over",
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  lastCtx: ReturnType<typeof makeFakeCtx> | null = null;
  static instances: FakeOffscreenCanvas[] = [];
  static getContextReturnsNull = false;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.instances.push(this);
  }
  getContext(kind: string) {
    if (kind !== "2d") return null;
    if (FakeOffscreenCanvas.getContextReturnsNull) return null;
    this.lastCtx = makeFakeCtx();
    return this.lastCtx;
  }
  transferToImageBitmap() {
    return { __label: "poster-output" } as unknown as ImageBitmap;
  }
}

function fakeBitmap(width = 400, height = 600): ImageBitmap {
  return { width, height, __label: "source" } as unknown as ImageBitmap;
}

beforeEach(() => {
  FakeOffscreenCanvas.instances = [];
  FakeOffscreenCanvas.getContextReturnsNull = false;
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyPosterEffect", () => {
  it("sizes the working canvas to match the source and draws the source onto it", async () => {
    const source = fakeBitmap(320, 480);
    await applyPosterEffect(source, { tint: "crimson" });

    expect(FakeOffscreenCanvas.instances).toHaveLength(1);
    const canvas = FakeOffscreenCanvas.instances[0];
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(480);
    expect(canvas.lastCtx?.drawImage).toHaveBeenCalledWith(source, 0, 0, 320, 480);
  });

  it("returns the source bitmap untouched when no 2D context is available (CLAUDE.md section 49)", async () => {
    FakeOffscreenCanvas.getContextReturnsNull = true;
    const source = fakeBitmap();
    const result = await applyPosterEffect(source, { tint: "teal" });
    expect(result).toBe(source);
  });

  it("applies a multiply-blended tint fill and a radial-gradient vignette", async () => {
    await applyPosterEffect(fakeBitmap(), { tint: "moonlight" });
    const ctx = FakeOffscreenCanvas.instances[0].lastCtx!;
    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    // fillRect is used twice: once for the tint multiply pass, once for the vignette.
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it("resets globalCompositeOperation back to source-over after the multiply tint pass", async () => {
    await applyPosterEffect(fakeBitmap(), { tint: "crimson" });
    const ctx = FakeOffscreenCanvas.instances[0].lastCtx!;
    // The last thing the effect does with this field is set it back for
    // the vignette fill, which uses normal (not multiplied) painting.
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it.each(POSTER_TINTS)("produces a result for every documented tint (%s)", async (tint: PosterTint) => {
    const result = await applyPosterEffect(fakeBitmap(), { tint });
    expect(result).toBeTruthy();
  });

  it("never throws even if setting the grade filter string throws (unsupported filter strings)", async () => {
    // Only the first assignment (the actual grayscale/contrast/brightness
    // string) is wrapped in try/catch in the source -- that's the
    // realistic failure mode this guards against (an engine rejecting an
    // unrecognized filter value), not the later `ctx.filter = "none"`
    // reset, which is always a value every implementation accepts.
    FakeOffscreenCanvas.instances = [];
    class ThrowingFilterCanvas extends FakeOffscreenCanvas {
      getContext(kind: string) {
        const ctx = super.getContext(kind) as ReturnType<typeof makeFakeCtx> | null;
        if (!ctx) return null;
        let value = "none";
        Object.defineProperty(ctx, "filter", {
          set(v: string) {
            if (v !== "none") throw new Error("unsupported filter");
            value = v;
          },
          get() {
            return value;
          },
        });
        return ctx;
      }
    }
    (globalThis as Record<string, unknown>).OffscreenCanvas = ThrowingFilterCanvas;

    await expect(applyPosterEffect(fakeBitmap(), { tint: "crimson" })).resolves.toBeTruthy();
  });
});
