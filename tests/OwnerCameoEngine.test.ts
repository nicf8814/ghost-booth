import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerCameoEngine } from "../src/effects/OwnerCameoEngine";
import type { CameoKey } from "../src/effects/Cameos";

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
  it("returns the target untouched when key is null", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn();
    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/a.png" } as Record<CameoKey, string>);
    const target = fakeBitmap();
    const result = await engine.composite(target, null);
    expect(result).toBe(target);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("draws the target then the chosen cameo image on top, and returns a new bitmap", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap(100, 150, "cameo-0"));

    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/a.png" } as Record<CameoKey, string>);
    const target = fakeBitmap(400, 600, "target");
    const result = await engine.composite(target, "nicCutout");

    expect(FakeOffscreenCanvas.instances).toHaveLength(1);
    const canvas = FakeOffscreenCanvas.instances[0];
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(600);
    expect(canvas.lastCtx?.drawImage).toHaveBeenNthCalledWith(1, target, 0, 0);
    expect(canvas.lastCtx?.drawImage).toHaveBeenCalledTimes(2); // target, then the cameo
    expect(result).not.toBe(target);
  });

  it("loads each asset URL only once even across repeated composite() calls for the same key (caches the load)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());

    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/a.png", theRake: "/cameo/b.png" } as Record<CameoKey, string>);
    await engine.composite(fakeBitmap(), "nicCutout");
    await engine.composite(fakeBitmap(), "nicCutout");
    await engine.composite(fakeBitmap(), "theRake");

    expect(fetchMock).toHaveBeenCalledTimes(2); // once per distinct key, not once per composite() call
  });

  it("returns the target untouched when the chosen key's asset fails to load", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: false, status: 500, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());

    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/broken.png" } as Record<CameoKey, string>);
    const target = fakeBitmap();
    const result = await engine.composite(target, "nicCutout");

    expect(result).toBe(target);
    expect(FakeOffscreenCanvas.instances).toHaveLength(0); // never even opens a canvas
  });

  it("returns the target untouched when no 2D context is available", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap());
    FakeOffscreenCanvas.getContextReturnsNull = true;

    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/a.png" } as Record<CameoKey, string>);
    const target = fakeBitmap();
    const result = await engine.composite(target, "nicCutout");
    expect(result).toBe(target);
  });

  it("applies opacity, blur/saturate/brightness filter, and default cover-fill geometry that dominates the frame (not a small sticker)", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap(100, 200, "cameo"));

    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/a.png" } as Record<CameoKey, string>);
    await engine.composite(fakeBitmap(400, 600), "nicCutout", { opacity: 0.33, blurPx: 7, desaturate: 0.5, brightness: 1.3 });

    const ctx = FakeOffscreenCanvas.instances[0].lastCtx!;
    expect(ctx.globalAlpha).toBe(0.33);
    expect(ctx.filter).toBe("blur(7px) saturate(0.5) brightness(1.3)");
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();

    // Default (no explicit scale) covers the whole photo: the cameo's
    // shorter dimension exactly fills the corresponding photo dimension,
    // centered -- "these are not stickers."
    const [, x, y, w, h] = ctx.drawImage.mock.calls[1];
    const expectedWidth = Math.max(400, 600 * (100 / 200));
    const expectedHeight = expectedWidth * (200 / 100);
    expect(w).toBeCloseTo(expectedWidth, 6);
    expect(h).toBeCloseTo(expectedHeight, 6);
    expect(x).toBeCloseTo(400 * 0.5 - expectedWidth / 2, 6);
    expect(y).toBeCloseTo(600 * 0.5 - expectedHeight / 2, 6);
  });

  it("honors an explicit scale override instead of the default cover-fill", async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok: true, blob: async () => fakeBlob() }));
    (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async () => fakeBitmap(100, 200, "cameo"));

    const engine = new OwnerCameoEngine({ nicCutout: "/cameo/a.png" } as Record<CameoKey, string>);
    await engine.composite(fakeBitmap(400, 600), "nicCutout", { scale: 0.32, offsetXFrac: 0.78, offsetYFrac: 0.22 });

    const ctx = FakeOffscreenCanvas.instances[0].lastCtx!;
    const [, x, y, w, h] = ctx.drawImage.mock.calls[1];
    const expectedWidth = 400 * 0.32;
    const expectedHeight = expectedWidth * (200 / 100);
    expect(w).toBeCloseTo(expectedWidth, 6);
    expect(h).toBeCloseTo(expectedHeight, 6);
    expect(x).toBeCloseTo(400 * 0.78 - expectedWidth / 2, 6);
    expect(y).toBeCloseTo(600 * 0.22 - expectedHeight / 2, 6);
  });
});
