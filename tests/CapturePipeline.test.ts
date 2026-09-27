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
    ghost: false,
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
      ownerCameoEngine: { composite: vi.fn() },
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
      ownerCameoEngine: { composite: vi.fn() },
    };

    const result = await analyzeAndWarpPhoto(master, deps, baseSettings);

    expect(warp).not.toHaveBeenCalled();
    expect(result.caricatured).toBe(master);
    expect(result.faces).toHaveLength(0);
  });

  it("only computes ghost variants when ownerCameoMode is enabled", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
      ownerCameoEngine: { composite: vi.fn().mockResolvedValue(fakeBitmap("ghost")) },
    };

    const off = await analyzeAndWarpPhoto(master, deps, { ...baseSettings, ownerCameoMode: "off" });
    expect(off.originalGhost).toBeNull();
    expect(off.caricaturedGhost).toBeNull();
    expect(off.options.ghost).toBe(false);
    expect(deps.ownerCameoEngine.composite).not.toHaveBeenCalled();

    const on = await analyzeAndWarpPhoto(master, deps, { ...baseSettings, ownerCameoMode: "always" });
    expect(on.originalGhost).not.toBeNull();
    expect(on.caricaturedGhost).not.toBeNull();
    expect(on.options.ghost).toBe(true);
    expect(deps.ownerCameoEngine.composite).toHaveBeenCalledTimes(2);
  });

  it("uses the same cameo pick for both the original and caricatured ghost variants", async () => {
    const master = fakeBitmap("master");
    const composite = vi.fn().mockResolvedValue(fakeBitmap("ghost"));
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
      ownerCameoEngine: { composite },
    };

    await analyzeAndWarpPhoto(master, deps, { ...baseSettings, ownerCameoMode: "always" });

    // Both calls' rng argument (3rd param) should resolve to the same
    // number -- one cameo pick reused for both variants, not two
    // independent rolls (see the "candid and goofy show the same ghost"
    // comment in CapturePipeline.ts).
    const rngA = composite.mock.calls[0][2] as () => number;
    const rngB = composite.mock.calls[1][2] as () => number;
    expect(rngA()).toBe(rngB());
  });

  it("builds a recipe respecting the operator's caption mode, and exposes the available frame/overlay/poster/filter options and defaults", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
      ownerCameoEngine: { composite: vi.fn() },
    };

    const result = await analyzeAndWarpPhoto(master, deps, baseSettings);

    expect(CAPTIONS).toContain(result.recipe.caption);
    expect(result.recipe.overlaySeed).toEqual(expect.any(String));

    expect(result.options.frameOptions).toEqual(["none", "classic", "filmStrip"]);
    expect(result.options.overlayOptions).toEqual(["bats", "cobwebs"]);
    expect(result.options.posterTints).toEqual(["crimson", "teal", "moonlight"]);
    expect(result.options.filterOptions).toEqual(["vhs", "noir"]);

    expect(result.defaults.frameKey).toBe("classic");
    expect(result.defaults.overlayKeys).toEqual(["bats", "cobwebs"]);
    expect(result.defaults.posterTint).toBeNull();
    expect(result.defaults.filterKey).toBeNull();
  });

  it("omits the caption when captionMode is off, and options reflect operator config", async () => {
    const master = fakeBitmap("master");
    const deps: AnalyzePhotoDeps = {
      faceDetector: { detect: vi.fn().mockResolvedValue([]) },
      caricatureEngine: { warp: vi.fn() },
      ownerCameoEngine: { composite: vi.fn() },
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
      ghost: false,
      caption: false,
      frameOptions: ["none", "classic", "filmStrip"],
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
      ownerCameoEngine: { composite: vi.fn() },
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
      originalGhost: fakeBitmap("originalGhost"),
      caricaturedGhost: fakeBitmap("caricaturedGhost"),
    };
  }

  it("picks the caricatured bitmap when goofy is on and original when off", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ goofy: true }), { compositionEngine: { compose } });
    expect(compose.mock.calls[0][0].foreground).toBe(b.caricatured);

    await composeSelectedBitmap(b, recipe, baseSelection({ goofy: false }), { compositionEngine: { compose } });
    expect(compose.mock.calls[1][0].foreground).toBe(b.original);
  });

  it("falls back to the plain (non-ghost) variant when ghost is requested but unavailable for this photo", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const b = base();
    b.originalGhost = null;
    b.caricaturedGhost = null;

    await composeSelectedBitmap(b, recipe, baseSelection({ goofy: false, ghost: true }), {
      compositionEngine: { compose },
    });

    expect(compose.mock.calls[0][0].foreground).toBe(b.original);
  });

  it("passes frame/overlays/caption through to compose() with the picked keys", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const b = base();

    await composeSelectedBitmap(
      b,
      recipe,
      baseSelection({ frameKey: "classic", overlayKeys: ["bats"], captioned: true }),
      { compositionEngine: { compose } },
    );
    expect(compose.mock.calls[0][0]).toMatchObject({
      frame: "classic",
      overlays: ["bats"],
      caption: "HAUNTED AND THIRSTY.",
    });

    await composeSelectedBitmap(b, recipe, baseSelection(), { compositionEngine: { compose } });
    expect(compose.mock.calls[1][0]).toMatchObject({
      frame: "none",
      overlays: [],
      caption: undefined,
    });
  });

  it("uses Poster Mode instead of compose() when a posterTint is picked, and never calls compose()", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const b = base();

    const bitmap = await composeSelectedBitmap(
      b,
      recipe,
      baseSelection({ frameKey: "classic", overlayKeys: ["bats"], posterTint: "crimson" }),
      { compositionEngine: { compose } },
    );

    expect(compose).not.toHaveBeenCalled();
    expect(bitmap).not.toBeNull();
  });

  it("grades the source through the horror filter before compose() when a filterKey is picked", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ filterKey: "vhs" }), {
      compositionEngine: { compose },
    });

    // applyHorrorFilter runs through the faked OffscreenCanvas and always
    // resolves to "canvas-output" -- confirms compose() received the
    // graded bitmap, not the original source, when a filter is picked.
    expect(compose.mock.calls[0][0].foreground).not.toBe(b.caricatured);
  });

  it("skips the horror filter when a posterTint is also picked (both are whole-photo grades)", async () => {
    const compose = vi.fn().mockResolvedValue(fakeBitmap("composed"));
    const b = base();

    await composeSelectedBitmap(b, recipe, baseSelection({ posterTint: "crimson", filterKey: "vhs" }), {
      compositionEngine: { compose },
    });

    // Poster Mode replaces compose() entirely, so it should still never be
    // called even though a filterKey is also picked.
    expect(compose).not.toHaveBeenCalled();
  });

  it("returns null when there is no base bitmap yet (nothing captured)", async () => {
    const compose = vi.fn();
    const bitmap = await composeSelectedBitmap(
      { original: null as unknown as ImageBitmap, caricatured: null as unknown as ImageBitmap, originalGhost: null, caricaturedGhost: null },
      recipe,
      baseSelection(),
      { compositionEngine: { compose } },
    );
    expect(bitmap).toBeNull();
    expect(compose).not.toHaveBeenCalled();
  });
});
