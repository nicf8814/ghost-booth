import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlPoint } from "../src/effects/MeshWarp";

// jsdom doesn't implement OffscreenCanvas or WebGL2 at all, so this test
// installs a minimal fake of both -- just enough surface for
// WebGLRenderer.ts to run against -- and uses it to verify the actual
// behavior the P2 cleanup changed: that expensive setup (context creation,
// shader compilation, program linking, and the buffers/texture whose
// *shape* never changes) happens once per renderer instance and is reused
// across repeated warp() calls, rather than being rebuilt from scratch
// every time (the original version's behavior, and a real cost for a
// group photo -- one warp() call per detected face, up to 6 per CLAUDE.md
// section 10).

let createContextCalls = 0;
let compileShaderCalls = 0;
let createProgramCalls = 0;
let createBufferCalls = 0;
let createTextureCalls = 0;
let createVertexArrayCalls = 0;
let bufferDataCalls = 0;
let texImage2DCalls = 0;
let drawElementsCalls = 0;
let offscreenCanvasConstructions = 0;

function resetCounters() {
  createContextCalls = 0;
  compileShaderCalls = 0;
  createProgramCalls = 0;
  createBufferCalls = 0;
  createTextureCalls = 0;
  createVertexArrayCalls = 0;
  bufferDataCalls = 0;
  texImage2DCalls = 0;
  drawElementsCalls = 0;
  offscreenCanvasConstructions = 0;
}

function makeFakeGl() {
  return {
    // constants -- arbitrary distinct values, WebGLRenderer.ts only passes
    // these through to this fake context, never branches on them itself.
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    ARRAY_BUFFER: 3,
    ELEMENT_ARRAY_BUFFER: 4,
    STATIC_DRAW: 5,
    DYNAMIC_DRAW: 6,
    TRIANGLES: 7,
    UNSIGNED_SHORT: 8,
    COLOR_BUFFER_BIT: 9,
    RGBA: 10,
    UNSIGNED_BYTE: 11,
    TEXTURE_2D: 12,
    TEXTURE_WRAP_S: 13,
    TEXTURE_WRAP_T: 14,
    CLAMP_TO_EDGE: 15,
    TEXTURE_MIN_FILTER: 16,
    TEXTURE_MAG_FILTER: 17,
    LINEAR: 18,
    UNPACK_FLIP_Y_WEBGL: 19,
    COMPILE_STATUS: 20,
    LINK_STATUS: 21,
    FLOAT: 22,

    createShader: vi.fn(() => ({ __shader: true })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(() => {
      compileShaderCalls++;
    }),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),

    createProgram: vi.fn(() => {
      createProgramCalls++;
      return { __program: true };
    }),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),

    createVertexArray: vi.fn(() => {
      createVertexArrayCalls++;
      return { __vao: true };
    }),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),

    createBuffer: vi.fn(() => {
      createBufferCalls++;
      return { __buffer: createBufferCalls };
    }),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(() => {
      bufferDataCalls++;
    }),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),

    createTexture: vi.fn(() => {
      createTextureCalls++;
      return { __texture: true };
    }),
    bindTexture: vi.fn(),
    deleteTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(() => {
      texImage2DCalls++;
    }),
    texParameteri: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawElements: vi.fn(() => {
      drawElementsCalls++;
    }),
  };
}

let fakeGl: ReturnType<typeof makeFakeGl>;

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    offscreenCanvasConstructions++;
  }
  getContext(kind: string) {
    if (kind !== "webgl2") return null;
    createContextCalls++;
    return fakeGl;
  }
  transferToImageBitmap() {
    return { __imageBitmap: true } as unknown as ImageBitmap;
  }
}

describe("WebGL2MeshWarpRenderer (fake WebGL2 context)", () => {
  let originalOffscreenCanvas: unknown;

  beforeEach(() => {
    resetCounters();
    fakeGl = makeFakeGl();
    originalOffscreenCanvas = (globalThis as Record<string, unknown>).OffscreenCanvas;
    (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).OffscreenCanvas = originalOffscreenCanvas;
  });

  it("creates the context, compiles the shaders, and links the program exactly once across multiple warp() calls", async () => {
    const { WebGL2MeshWarpRenderer } = await import("../src/rendering/WebGLRenderer");
    const renderer = new WebGL2MeshWarpRenderer();

    const image = { width: 100, height: 100 } as unknown as ImageBitmap;
    const controlPointsA: ControlPoint[] = [{ center: { x: 0.3, y: 0.3 }, radiusX: 0.1, radiusY: 0.1, scale: 1.5 }];
    const controlPointsB: ControlPoint[] = [{ center: { x: 0.6, y: 0.6 }, radiusX: 0.1, radiusY: 0.1, scale: 0.8 }];

    await renderer.warp(image, controlPointsA);
    await renderer.warp(image, controlPointsB);
    await renderer.warp(image, controlPointsA);

    // Setup work happens once, not once per call.
    expect(offscreenCanvasConstructions).toBe(1);
    expect(createContextCalls).toBe(1);
    expect(compileShaderCalls).toBe(2); // vertex + fragment, compiled once total
    expect(createProgramCalls).toBe(1);
    expect(createVertexArrayCalls).toBe(1);
    expect(createTextureCalls).toBe(1);
    // uv buffer, position buffer, index buffer -- three total, not three per call.
    expect(createBufferCalls).toBe(3);

    // Per-call work (the data that actually changes) happens every call.
    expect(texImage2DCalls).toBe(3);
    expect(drawElementsCalls).toBe(3);
    // uvBuffer + indexBuffer uploaded once each during setup (2), plus
    // posBuffer re-uploaded on every warp() call (3) = 5.
    expect(bufferDataCalls).toBe(5);
  });

  it("resizes the backing canvas when a later call's image is a different size, without recreating the context", async () => {
    const { WebGL2MeshWarpRenderer } = await import("../src/rendering/WebGLRenderer");
    const renderer = new WebGL2MeshWarpRenderer();
    const controlPoints: ControlPoint[] = [];

    await renderer.warp({ width: 100, height: 100 } as unknown as ImageBitmap, controlPoints);
    await renderer.warp({ width: 200, height: 150 } as unknown as ImageBitmap, controlPoints);

    expect(createContextCalls).toBe(1); // still just one context
    expect(drawElementsCalls).toBe(2);
  });

  it("dispose() releases every cached GL object", async () => {
    const { WebGL2MeshWarpRenderer } = await import("../src/rendering/WebGLRenderer");
    const renderer = new WebGL2MeshWarpRenderer();
    await renderer.warp({ width: 100, height: 100 } as unknown as ImageBitmap, []);

    renderer.dispose();

    expect(fakeGl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(fakeGl.deleteBuffer).toHaveBeenCalledTimes(3); // uv, pos, and index buffers
    expect(fakeGl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(fakeGl.deleteProgram).toHaveBeenCalledTimes(1);

    // Calling dispose() again is a safe no-op (nothing left to release).
    renderer.dispose();
    expect(fakeGl.deleteTexture).toHaveBeenCalledTimes(1);
  });
});
