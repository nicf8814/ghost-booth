import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeAndWarpPhoto,
  composeSelectedBitmap,
  type AnalyzePhotoDeps,
  type CapturePipelineSettings,
  type PhotoBaseBitmaps,
  type PhotoRecipe,
  type PhotoSelection,
} from "../src/app/CapturePipeline";
import type { FaceModel } from "../src/vision/VisionTypes";
import { CAPTIONS } from "../src/effects/HalloweenEffects";

// jsdom doesn't provide createImageBitmap or OffscreenCanvas at all.
// analyzeAndWarpPhoto uses createImageBitmap once (to clone the master
// bitmap before handing it to the face detector, matching how the real
// WorkerFaceDetector takes ownership of what it's given) -- stubbed to
// just hand back its input, since the identity of the "clone" doesn't
// matter here, only that detect() gets called with something.
// composeSelectedBitmap's Poster Mode path goes through
// effects/PosterEffect.ts and rendering/CompositionEngine.ts's
// drawCaptionOnBitmap, both of which build an OffscreenCanvas + 2D context
// directly -- stubbed with a permissive fake that accepts every call
// either module makes and hands back a fake bitmap, since these tests care
// about *which path got called with what data*, not the actual pixels.
class FakeOffscreenCanvas2D {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(kind: string) {
    if (kind !== "2d") return null;
    return {
      filter: "none",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "left",
      shadowColor: "",
      shadowBlur: 0,
      globalCompositeOperation: "source-over",
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      save: vi.fn(),
      restore: vi.fn(),
      strokeText: vi.fn(),
      fillText: vi.fn(),
    };
  }
  transferToImageBitmap() {
    return fakeBitmap("canvas-output");
  }
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).createImageBitmap = vi.fn(async (img: unknown) => img);
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas2D;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeBitmap(label: string): ImageBitmap {
  return { __label: label } as unknown as ImageBitmap;
}

function fakeFace(): FaceModel {
  return {
    boundingBox: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
    leftEye: { x: 0.35, y: 0.3 },
    rightEye: { x: 0.45, y: 0.3 },
    faceContour: [],
    noseContour: [],
    outerLips: [],
    innerLips: [],
  };
}

const baseSettings: CapturePipelineSettings = {
  preset: "Goblin",
  caricatureStrength: 1,
  ownerCameoMode: "off",
  captionMode: "random",
  fixedCaption: CAPTIONS[0],
  frame: "classic",
  overlays: ["bats", "cobwebs"],
  posterMode: true,
  filters: ["vhs", "noir"],
};

function baseSelection(overrides: Partial<PhotoSelection> = {}): PhotoSelection {
  return {
    goofy: false,
    ghostKey: null,
    captioned: false,
    frameKey: "none",
    overlayKeys: [],
    posterTint: null,
    filterKey: null,
    ...overrides,
  };
}

describe("analyzeAndWarpPhoto", () => {
  it("warps every detected face in sequence and returns the final bitmap as `caricatured`", async () => {
    const master = fakeBitmap("master");
    const warped1 = fakeBitmap("warped1");
    const warped2 = fakeBitmap("warped2");
    const warp = vi.fn().mockResolvedValueOnce(warped1).mockResolvedValueOnce(warped2);
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([fakeFace(), fakeFace()]) },
      caricatureEngine: { warp },
    };

    const result = await analyzeAndWarpPhoto(master, deps, baseSettings);

    expect(warp).toHaveBeenCalledTimes(2);
    // Second call's `working` image is the first call's warped output, not
    // the original master -- confirms faces are warped against the
    // accumulating result, not independently against the master each time.
    expect(warp.mock.calls[1][0]).toBe(warped1);
    expect(result.caricatured).toBe(warped2);
    expect(result.original).toBe(master);
    expect(result.faces).toHaveLength(2);
  });

  it("passes the master bitmap through unmodified when no faces are detected (CLAUDE.md section 49 fallback)", async () => {
    const master = fakeBitmap("master");
    const warp = vi.fn();
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp },
    };

    const result = await analyzeAndWarpPhoto(master, deps, baseSettings);

    expect(warp).not.toHaveBeenCalled();
    expect(result.caricatured).toBe(master);
    expect(result.faces).toHaveLength(0);
  });

  it("exposes ghost cameo options only when ownerCameoMode is enabled, with no ghost picked by default", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
    };

    const off = await analyzeAndWarpPhoto(master, deps, { ...baseSettings, ownerCameoMode: "off" });
    expect(off.options.ghostOptions).toEqual([]);
    expect(off.defaults.ghostKey).toBeNull();

    const on = await analyzeAndWarpPhoto(master, deps, { ...baseSettings, ownerCameoMode: "always" });
    expect(on.options.ghostOptions.length).toBeGreaterThan(0);
    expect(on.defaults.ghostKey).toBeNull();
  });

  it("builds a recipe respecting the operator's caption mode, and exposes the available frame/overlay/poster/filter options and defaults", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
    };

    const result = await analyzeAndWarpPhoto(master, deps, baseSettings);

    expect(CAPTIONS).toContain(result.recipe.caption);
    expect(result.recipe.overlaySeed).toEqual(expect.any(String));

    expect(result.options.frameOptions).toEqual(["none", "classic", "filmStrip", "polaroid", "spooky", "torn", "heisterkamp"]);
    expect(result.options.overlayOptions).toEqual(["bats", "cobwebs"]);
    expect(result.options.posterTints).toEqual([
      "crimson",
      "teal",
      "moonlight",
      "toxicGreen",
      "violetHaze",
      "amberInferno",
      "grimGrey",
      "bubblegumGore",
    ]);
    expect(result.options.filterOptions).toEqual(["vhs", "noir"]);

    expect(result.defaults.frameKey).toBe("classic");
    expect(result.defaults.overlayKeys).toEqual(["bats", "cobwebs"]);
    expect(result.defaults.posterTint).toBeNull();
    expect(result.defaults.filterKey).toBeNull();
    expect(result.defaults.ghostKey).toBeNull();
  });

  it("omits the caption when captionMode is off, and options reflect operator config", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
    };

    const result = await analyzeAndWarpPhoto(master, deps, {
      ...baseSettings,
      captionMode: "off",
      frame: "none",
      overlays: [],
      posterMode: false,
      filters: [],
    });

    expect(result.recipe.caption).toBeUndefined();
    expect(result.options).toEqual({
      ghostOptions: [],
      caption: false,
      frameOptions: ["none", "classic", "filmStrip", "polaroid", "spooky", "torn", "heisterkamp"],
      overlayOptions: [],
      posterTints: [],
      filterOptions: [],
    });
  });

  it("two calls with different seeds produce independent results (not memoized/cached)", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => analyzeAndWarpPhoto(master, deps, baseSettings)),
    );
    const seeds = new Set(results.map((r) => r.recipe.overlaySeed));
    // 20 independent createSeed() calls landing on the same UUID would be
    // astronomically unlikely -- this just guards against an accidental
    // shared/cached seed.
    expect(seeds.size).toBe(20);
  });
});

describe("composeSelectedBitmap", () => {
  const recipe: PhotoRecipe = {
    caption: "HAUNTED AND THIRSTY.",
    overlaySeed: "seed-123",
  };

  function base(): PhotoBaseBitmaps {
    return {
      original: fakeBitmap("original"),
      caricatured: fakeBitmap("caricatured"),
    };
  }

  // ownerCameoEngine.composite is a pass-through by default (no ghost
  // picked in most of these tests, and a stub that never mutates the
  // bitmap keeps assertions about the *plain* pipeline stages unaffected).
  function noopCameoEngine() {
    return { composite: vi.fn(async (bitmap: ImageBitmap) => bitmap) };
  }

  it("picks the caricatured bitmap when goofy is on and original when off", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const ownerCameoEngine = noopCameoEngine();
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ goofy: true }), { compositionEngine: { compose }, ownerCameoEngine });
    expect(compose.mock.calls[0][0].foreground).toBe(b.caricatured);

    await composeSelectedBitmap(b, recipe, baseSelection({ goofy: false }), { compositionEngine: { compose }, ownerCameoEngine });
    expect(compose.mock.calls[1][0].foreground).toBe(b.original);
  });

  it("composites the picked ghost cameo onto the source before compose(), and skips it when ghostKey is null", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const composite = vi.fn(async () => fakeBitmap("ghosted"));
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ ghostKey: "theRake" }), {
      compositionEngine: { compose },
      ownerCameoEngine: { composite },
    });
    expect(composite).toHaveBeenCalledWith(b.original, "theRake");
    expect(compose.mock.calls[0][0].foreground).not.toBe(b.original);

    composite.mockClear();
    await composeSelectedBitmap(b, recipe, baseSelection({ ghostKey: null }), {
      compositionEngine: { compose },
      ownerCameoEngine: { composite },
    });
    expect(composite).toHaveBeenCalledWith(b.original, null);
  });

  it("passes frame/overlays/caption through to compose() with the picked keys", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const ownerCameoEngine = noopCameoEngine();
    const b = base();

    await composeSelectedBitmap(
      b,
      recipe,
      baseSelection({ frameKey: "classic", overlayKeys: ["bats"], captioned: true }),
      { compositionEngine: { compose }, ownerCameoEngine },
    );
    expect(compose.mock.calls[0][0]).toMatchObject({
      frame: "classic",
      overlays: ["bats"],
      caption: "HAUNTED AND THIRSTY.",
    });

    await composeSelectedBitmap(b, recipe, baseSelection(), { compositionEngine: { compose }, ownerCameoEngine });
    expect(compose.mock.calls[1][0]).toMatchObject({
      frame: "none",
      overlays: [],
      caption: undefined,
    });
  });

  it("still routes through compose() when a posterTint is picked, but forces frame to \"none\"", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const ownerCameoEngine = noopCameoEngine();
    const b = base();

    const bitmap = await composeSelectedBitmap(
      b,
      recipe,
      baseSelection({ frameKey: "classic", overlayKeys: ["bats"], posterTint: "crimson" }),
      { compositionEngine: { compose }, ownerCameoEngine },
    );

    // Poster grades the source before compose() runs (via the faked
    // OffscreenCanvas, always resolving to "canvas-output"), so compose()
    // receives the poster-graded bitmap, not the plain caricatured one --
    // and frame is forced off even though "classic" was picked, while
    // overlays still pass through untouched.
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose.mock.calls[0][0].foreground).not.toBe(b.caricatured);
    expect(compose.mock.calls[0][0]).toMatchObject({ frame: "none", overlays: ["bats"] });
    expect(bitmap).not.toBeNull();
  });

  it("grades the source through the horror filter before compose() when a filterKey is picked", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const ownerCameoEngine = noopCameoEngine();
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ filterKey: "vhs" }), {
      compositionEngine: { compose },
      ownerCameoEngine,
    });

    // applyHorrorFilter runs through the faked OffscreenCanvas and always
    // resolves to "canvas-output" -- confirms compose() received the
    // graded bitmap, not the original source, when a filter is picked.
    expect(compose.mock.calls[0][0].foreground).not.toBe(b.caricatured);
  });

  it("stacks the horror filter and Poster Mode instead of treating them as mutually exclusive", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const ownerCameoEngine = noopCameoEngine();
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ posterTint: "crimson", filterKey: "vhs" }), {
      compositionEngine: { compose },
      ownerCameoEngine,
    });

    // Both grades run (filter first, then poster on top) and compose()
    // still receives the result -- filter is no longer skipped just
    // because a poster tint is also picked.
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose.mock.calls[0][0].foreground).not.toBe(b.caricatured);
  });

  it("returns null when there is no base bitmap yet (nothing captured)", async () => {
    const compose = vi.fn();
    const bitmap = await composeSelectedBitmap(
      { original: null as unknown as ImageBitmap, caricatured: null as unknown as ImageBitmap },
      recipe,
      baseSelection(),
      { compositionEngine: { compose }, ownerCameoEngine: noopCameoEngine() },
    );
    expect(bitmap).toBeNull();
    expect(compose).not.toHaveBeenCalled();
  });
});
