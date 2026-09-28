import { describe, expect, it } from "vitest";
import { computeCoverCropRect } from "../src/printing/PrintLayout";

describe("computeCoverCropRect", () => {
  it("returns the source unchanged when it already matches the target ratio", () => {
    // 1200x1800 is already exactly 2:3.
    const rect = computeCoverCropRect(1200, 1800, 2 / 3);
    expect(rect).toEqual({ x: 0, y: 0, width: 1200, height: 1800 });
  });

  it("trims a landscape source's width to fit a 2:3 (portrait-ratio) shape, keeping height", () => {
    // A 1920x1080 landscape capture (16:9) cropped to 2:3 (Kodak Mini 2
    // Retro / 4x6) shape, staying landscape -- so the target ratio is
    // applied as height:width = 2:3, i.e. width = height / (2/3) = height * 1.5.
    const rect = computeCoverCropRect(1920, 1080, 2 / 3);
    expect(rect.height).toBe(1080);
    expect(rect.width).toBeCloseTo(1080 * 1.5, 6);
    // Centered horizontally, full height used.
    expect(rect.y).toBe(0);
    expect(rect.x).toBeCloseTo((1920 - rect.width) / 2, 6);
  });

  it("trims a portrait source's height to fit a 2:3 shape, keeping width, anchored to the bottom", () => {
    const rect = computeCoverCropRect(1080, 1920, 2 / 3);
    expect(rect.width).toBe(1080);
    expect(rect.height).toBeCloseTo(1080 * 1.5, 6);
    expect(rect.x).toBe(0);
    // Anchored to the bottom edge (y = source height - crop height), not
    // centered -- see computeCoverCropRect's comment: a height trim would
    // otherwise clip straight through CompositionEngine.compose()'s caption,
    // which always sits in a strip at the very bottom of the full photo.
    expect(rect.y).toBeCloseTo(1920 - rect.height, 6);
  });

  it("trims a landscape source's height to fit a 2:3 shape, keeping width, anchored to the bottom", () => {
    // A landscape capture whose actual aspect ratio isn't quite 16:9 (e.g.
    // getUserMedia's { ideal: 1920x1080 } constraint wasn't honored exactly
    // -- see CameraManager.ts) can be relatively "fatter" than the 2:3
    // target, which trims HEIGHT instead of width. This is the case that
    // was silently slicing captions off Kodak prints: a plain centered crop
    // trims equally from top and bottom, right through the caption strip at
    // the bottom of the frame.
    const rect = computeCoverCropRect(1440, 1080, 2 / 3);
    expect(rect.width).toBe(1440);
    expect(rect.height).toBeCloseTo(1440 * (2 / 3), 6);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(1080 - rect.height, 6);
    expect(rect.y).toBeGreaterThan(0); // confirms height is actually being trimmed in this case
  });

  it("forcePortrait: crops a wide landscape source down to a portrait 2:3 shape, keeping full height", () => {
    // The booth is physically mounted portrait and the Kodak Mini 2 Retro
    // only ever outputs portrait 2x3 -- forcePortrait is the safety net for
    // a capture that comes back landscape anyway (see CameraManager.ts's
    // portrait-ideal constraints, the primary fix). A 1920x1080 (16:9)
    // source is "wider" than the 2:3 target, so width gets trimmed hard
    // while the full height (and the caption strip at its bottom) survives.
    const rect = computeCoverCropRect(1920, 1080, 2 / 3, true);
    expect(rect.height).toBe(1080);
    expect(rect.width).toBeCloseTo(1080 * (2 / 3), 6);
    expect(rect.width).toBeLessThan(rect.height); // actually portrait-shaped
    expect(rect.y).toBe(0);
    expect(rect.x).toBeCloseTo((1920 - rect.width) / 2, 6);
  });

  it("forcePortrait: on an already-portrait source, behaves like the unforced case (height trimmed, anchored to bottom)", () => {
    const forced = computeCoverCropRect(1080, 1920, 2 / 3, true);
    const unforced = computeCoverCropRect(1080, 1920, 2 / 3, false);
    expect(forced).toEqual(unforced);
  });

  it("crops a landscape source to a square, trimming the width", () => {
    const rect = computeCoverCropRect(1920, 1080, 1);
    expect(rect.width).toBe(1080);
    expect(rect.height).toBe(1080);
    expect(rect.y).toBe(0);
    expect(rect.x).toBeCloseTo((1920 - 1080) / 2, 6);
  });

  it("never produces a crop rect larger than the source", () => {
    const rect = computeCoverCropRect(1920, 1080, 2 / 6);
    expect(rect.width).toBeLessThanOrEqual(1920);
    expect(rect.height).toBeLessThanOrEqual(1080);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it("falls back to the full source for degenerate/invalid input instead of NaN", () => {
    expect(computeCoverCropRect(0, 100, 2 / 3)).toEqual({ x: 0, y: 0, width: 0, height: 100 });
    expect(computeCoverCropRect(100, 100, 0)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
