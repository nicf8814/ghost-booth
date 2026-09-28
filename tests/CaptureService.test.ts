import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureMasterFrame } from "../src/camera/CaptureService";
import type { GetUserMediaCameraManager } from "../src/camera/CameraManager";

// jsdom has no OffscreenCanvas/2D-context at all -- same auto-mock pattern
// as CompositionEngine.test.ts, this file's dependency's own test.
function makeAutoMockCtx() {
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        if (typeof prop !== "string") return undefined;
        const fn = vi.fn((...args: unknown[]) => {
          calls.push({ method: prop, args });
        });
        (target as Record<string, unknown>)[prop] = fn;
        return fn;
      },
    },
  ) as unknown as OffscreenCanvasRenderingContext2D & Record<string, unknown>;
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
    return { width: this.width, height: this.height, __label: "transferred", close: vi.fn() } as unknown as ImageBitmap;
  }
}

function fakeBitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function fakeCamera(frame: ImageBitmap): GetUserMediaCameraManager {
  return { captureFrame: vi.fn(async () => frame) } as unknown as GetUserMediaCameraManager;
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

beforeEach(() => {
  FakeOffscreenCanvas.instances = [];
  FakeOffscreenCanvas.getContextReturnsNull = false;
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureMasterFrame", () => {
  it("rotates a landscape-shaped capture to portrait when the viewport is portrait", async () => {
    setViewport(1080, 1920); // portrait viewport
    const raw = fakeBitmap(1920, 1080); // landscape frame -- the iOS quirk
    const camera = fakeCamera(raw);

    await captureMasterFrame(camera, { mirrorPreview: false });

    // First canvas allocated is the rotation canvas, with dimensions swapped.
    expect(FakeOffscreenCanvas.instances[0].width).toBe(1080);
    expect(FakeOffscreenCanvas.instances[0].height).toBe(1920);
    // The raw (now-superseded) bitmap is closed rather than leaked.
    expect(raw.close).toHaveBeenCalled();
  });

  it("does not rotate when the capture already matches the portrait viewport", async () => {
    setViewport(1080, 1920);
    const raw = fakeBitmap(1080, 1920); // already portrait
    const camera = fakeCamera(raw);

    const result = await captureMasterFrame(camera, { mirrorPreview: false });

    expect(FakeOffscreenCanvas.instances).toHaveLength(0);
    expect(result).toBe(raw);
    expect(raw.close).not.toHaveBeenCalled();
  });

  it("does not rotate when the viewport itself is landscape", async () => {
    setViewport(1920, 1080); // landscape viewport
    const raw = fakeBitmap(1920, 1080);
    const camera = fakeCamera(raw);

    const result = await captureMasterFrame(camera, { mirrorPreview: false });

    expect(FakeOffscreenCanvas.instances).toHaveLength(0);
    expect(result).toBe(raw);
  });

  it("rotates the opposite direction when rotateCounterClockwise is set", async () => {
    setViewport(1080, 1920);
    const raw = fakeBitmap(1920, 1080);
    const camera = fakeCamera(raw);

    await captureMasterFrame(camera, { mirrorPreview: false, rotateCounterClockwise: true });

    const rotateCall = FakeOffscreenCanvas.instances[0].lastCtx!.calls.find((c) => c.method === "rotate");
    expect(rotateCall?.args[0]).toBeCloseTo(-Math.PI / 2, 6);
  });

  it("still un-mirrors after rotating, and closes every intermediate bitmap", async () => {
    setViewport(1080, 1920);
    const raw = fakeBitmap(1920, 1080);
    const camera = fakeCamera(raw);

    const result = await captureMasterFrame(camera, { mirrorPreview: true });

    // Two canvases: one for the rotation, one for the un-mirror.
    expect(FakeOffscreenCanvas.instances).toHaveLength(2);
    expect(raw.close).toHaveBeenCalled();
    expect((result as unknown as { __label: string }).__label).toBe("transferred");
  });
});
