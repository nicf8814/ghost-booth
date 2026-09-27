import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerCameoEngine } from "../src/effects/OwnerCameoEngine";

function makeFakeCtx() {
  return {
    globalAlpha: 1,
    filter: "none",
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
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
    return { __label: "cameo-composited" } as unknown as ImageBitmap;
  }
}

function fakeBitmap(width = 400, height = 600, label = "img"): ImageBitmap {
  return { width, height, __label: label } as unknown as ImageBitmap;
}

function fakeBlob(): Blob {
  return { __label: "blob" } as unknown as Blob;
}

beforeEach(() => {
  FakeOffscreenCanvas.instances = [];
  FakeOffscreenCanvas.getContextReturnsNull = false;
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OwnerCameoEngine.composite", () => {
  it("draws the target then a cameo image on top, and returns a new bitmap", async () => {
    let cameoCount = 0;
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap(100, 150, `cameo-${cameoCount++}`));

    const engine = new OwnerCameoEngine(["/cameo/a.png"]);
    const target = fakeBitmap(400, 600, "target");
    const result = await engine.composite(target);

    expect(FakeOffscreenCanvas.instances).toHaveLength(1);
    const canvas = FakeOffscreenCanvas.instances[0];
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(600);
    expect(canvas.lastCtx?.drawImage).toHaveBeenNthCalledWith(1, target, 0, 0);
    expect(canvas.lastCtx?.drawImage).toHaveBeenCalledTimes(2); // target, then the cameo
    expect(result).not.toBe(target);
  });

  it("loads each asset URL only once even across repeated composite() calls (caches imagesPromise)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());

    const engine = new OwnerCameoEngine(["/cameo/a.png", "/cameo/b.png"]);
    await engine.composite(fakeBitmap());
    await engine.composite(fakeBitmap());
    await engine.composite(fakeBitmap());

    expect(fetchMock).toHaveBeenCalledTimes(2); // once per asset, not once per composite() call
  });

  it("skips an asset that 404s and still composites successfully with the remaining ones", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async (url: string) => {
      if (url === "/cameo/broken.png") return { ok: false, status: 404, blob: async () => fakeBlob() };
      return { ok: true, blob: async () => fakeBlob() };
    });
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());

    const engine = new OwnerCameoEngine(["/cameo/broken.png", "/cameo/good.png"]);
    const target = fakeBitmap();
    const result = await engine.composite(target);

    // Compositing still happened (drew target + the one surviving cameo),
    // not a silent skip -- CLAUDE.md section 49's "degrade gracefully".
    expect(FakeOffscreenCanvas.instances[0].lastCtx?.drawImage).toHaveBeenCalledTimes(2);
    expect(result).not.toBe(target);
  });

  it("returns the target untouched when every asset fails to load", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: false, status: 500, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());

    const engine = new OwnerCameoEngine(["/cameo/broken.png"]);
    const target = fakeBitmap();
    const result = await engine.composite(target);

    expect(result).toBe(target);
    expect(FakeOffscreenCanvas.instances).toHaveLength(0); // never even opens a canvas
  });

  it("returns the target untouched when the engine has zero configured assets", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn();
    const engine = new OwnerCameoEngine([]);
    const target = fakeBitmap();
    const result = await engine.composite(target);
    expect(result).toBe(target);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns the target untouched when no 2D context is available", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());
    FakeOffscreenCanvas.getContextReturnsNull = true;

    const engine = new OwnerCameoEngine(["/cameo/a.png"]);
    const target = fakeBitmap();
    const result = await engine.composite(target);
    expect(result).toBe(target);
  });

  it("uses the given rng to pick among multiple cameo assets, modulo the count", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    let n = 0;
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap(100, 100, `cameo-${n++}`));

    const engine = new OwnerCameoEngine(["/cameo/a.png", "/cameo/b.png", "/cameo/c.png"]);

    // rng() = 0 -> index 0
    const first = await engine.composite(fakeBitmap(), {}, () => 0);
    // The second drawImage call (index 1, after drawing the target) is the cameo draw.
    const firstCameoArg = FakeOffscreenCanvas.instances[0].lastCtx?.drawImage.mock.calls[1][0];
    expect(firstCameoArg.__label).toBe("cameo-0");

    // rng() just under 1 with 3 cameos -> floor(0.999*3) = 2 -> index 2
    const second = await engine.composite(fakeBitmap(), {}, () => 0.999);
    const secondCameoArg = FakeOffscreenCanvas.instances[1].lastCtx?.drawImage.mock.calls[1][0];
    expect(secondCameoArg.__label).toBe("cameo-2");

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
  });

  it("applies opacity, blur/saturate/brightness filter, and default scale/offset-derived geometry", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap(100, 200, "cameo"));

    const engine = new OwnerCameoEngine(["/cameo/a.png"]);
    await engine.composite(fakeBitmap(400, 600), { opacity: 0.33, blurPx: 7, desaturate: 0.5, brightness: 1.3 });

    const ctx = FakeOffscreenCanvas.instances[0].lastCtx!;
    expect(ctx.globalAlpha).toBe(0.33);
    expect(ctx.filter).toBe("blur(7px) saturate(0.5) brightness(1.3)");
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();

    // Geometry: cameo drawn at (width*scale) wide, aspect-preserved height,
    // centered on the offset fractions.
    const [, x, y, w, h] = ctx.drawImage.mock.calls[1];
    const expectedWidth = 400 * 0.32; // default scale
    const expectedHeight = expectedWidth * (200 / 100); // cameo aspect ratio preserved
    expect(w).toBeCloseTo(expectedWidth, 6);
    expect(h).toBeCloseTo(expectedHeight, 6);
    expect(x).toBeCloseTo(400 * 0.78 - expectedWidth / 2, 6);
    expect(y).toBeCloseTo(600 * 0.22 - expectedHeight / 2, 6);
  });
});
