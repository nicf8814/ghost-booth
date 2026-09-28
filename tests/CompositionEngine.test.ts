import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Canvas2DCompositionEngine,
  drawCaptionOnBitmap,
  type CompositionConfig,
} from "../src/rendering/CompositionEngine";

// jsdom has no OffscreenCanvas/2D-context at all. The fake context
// auto-mocks any method it's asked for via a Proxy, rather than
// hand-listing every ctx.* call compose() makes.
function makeAutoMockCtx() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        if (typeof prop !== "string") return undefined;
        const fn = vi.fn(() => {
          if (prop === "drawImage") calls.push("drawImage");
        });
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      },
      set(target, prop, value) {
        (target as Record<string, unknown>)[prop] = value;
        return true;
      },
    },
  ) as unknown as OffscreenCanvasRenderingContext2D & Record<string, unknown>;
  // A couple of calls need real return shapes rather than a bare vi.fn().
  (ctx as unknown as Record<string, unknown>).createRadialGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  (ctx as unknown as Record<string, unknown>).createLinearGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  return { ctx, calls };
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  lastCtx: ReturnType<typeof makeAutoMockCtx> | null = null;
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
    this.lastCtx = makeAutoMockCtx();
    return this.lastCtx.ctx;
  }
  transferToImageBitmap() {
    return { __label: "composed" } as unknown as ImageBitmap;
  }
}

function fakeBitmap(width = 400, height = 600): ImageBitmap {
  return { width, height, __label: "foreground" } as unknown as ImageBitmap;
}

beforeEach(() => {
  FakeOffscreenCanvas.instances = [];
  FakeOffscreenCanvas.getContextReturnsNull = false;
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Canvas2DCompositionEngine.compose", () => {
  it("always draws the foreground onto a canvas sized to match it", async () => {
    const engine = new Canvas2DCompositionEngine();
    const foreground = fakeBitmap(320, 480);
    await engine.compose({ foreground });

    expect(FakeOffscreenCanvas.instances).toHaveLength(1);
    const canvas = FakeOffscreenCanvas.instances[0];
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(480);
    expect(canvas.lastCtx?.ctx.drawImage).toHaveBeenCalledWith(foreground, 0, 0);
  });

  it("returns the foreground untouched when no 2D context is available (CLAUDE.md section 49)", async () => {
    FakeOffscreenCanvas.getContextReturnsNull = true;
    const engine = new Canvas2DCompositionEngine();
    const foreground = fakeBitmap();
    const result = await engine.compose({ foreground });
    expect(result).toBe(foreground);
  });

  it("skips the caption stroke when no caption is given", async () => {
    const engine = new Canvas2DCompositionEngine();
    await engine.compose({ foreground: fakeBitmap() });
    for (const canvas of FakeOffscreenCanvas.instances) {
      expect(canvas.lastCtx?.ctx.strokeText).not.toHaveBeenCalled();
    }
  });

  it("draws the caption with fill + stroke text when a caption is given, and skips it otherwise", async () => {
    const engine = new Canvas2DCompositionEngine();
    await engine.compose({ foreground: fakeBitmap(), caption: "BAD DECISIONS WERE MADE." });
    const withCaption = FakeOffscreenCanvas.instances[0].lastCtx!.ctx;
    expect(withCaption.fillText).toHaveBeenCalledWith("BAD DECISIONS WERE MADE.", expect.any(Number), expect.any(Number));
    expect(withCaption.strokeText).toHaveBeenCalledWith("BAD DECISIONS WERE MADE.", expect.any(Number), expect.any(Number));

    await engine.compose({ foreground: fakeBitmap() });
    const withoutCaption = FakeOffscreenCanvas.instances[1].lastCtx!.ctx;
    expect(withoutCaption.fillText).not.toHaveBeenCalled();
  });

  it("layers foreground -> caption in that order (CLAUDE.md section 28)", async () => {
    const engine = new Canvas2DCompositionEngine();
    const order: string[] = [];
    const foreground = fakeBitmap();
    await engine.compose({
      foreground,
      caption: "0% DIGNITY.",
    });
    const ctx = FakeOffscreenCanvas.instances[0].lastCtx!.ctx as unknown as Record<string, ReturnType<typeof vi.fn>>;

    // drawImage(foreground) happens before any caption call -- verified by
    // construction order since the Proxy lazily creates each mock on first
    // access, so accessing .mock.invocationCallOrder on drawImage vs
    // fillText gives us the order.
    const drawImageOrder = ctx.drawImage.mock.invocationCallOrder[0];
    const fillTextOrder = ctx.fillText.mock.invocationCallOrder[0];
    order.push("drawImage:" + drawImageOrder, "fillText:" + fillTextOrder);
    expect(drawImageOrder).toBeLessThan(fillTextOrder);
  });

  it("passes CompositionConfig fields straight through with no unexpected mutation", async () => {
    const engine = new Canvas2DCompositionEngine();
    const config: CompositionConfig = {
      foreground: fakeBitmap(),
      caption: "HAUNTED AND THIRSTY.",
    };
    const snapshot = { ...config };
    await engine.compose(config);
    expect(config).toEqual(snapshot);
  });
});

describe("drawCaptionOnBitmap", () => {
  it("draws the source bitmap then the caption text onto a matching-size canvas", async () => {
    const source = fakeBitmap(200, 300);
    await drawCaptionOnBitmap(source, "THE DEMONS APPROVE.");

    const canvas = FakeOffscreenCanvas.instances[0];
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(300);
    expect(canvas.lastCtx?.ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(canvas.lastCtx?.ctx.fillText).toHaveBeenCalledWith("THE DEMONS APPROVE.", expect.any(Number), expect.any(Number));
  });

  it("returns the source bitmap untouched when no 2D context is available", async () => {
    FakeOffscreenCanvas.getContextReturnsNull = true;
    const source = fakeBitmap();
    const result = await drawCaptionOnBitmap(source, "WE HAVE QUESTIONS.");
    expect(result).toBe(source);
  });
});
