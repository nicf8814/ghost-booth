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

  it("trims a portrait source's height to fit a 2:3 shape, keeping width", () => {
    const rect = computeCoverCropRect(1080, 1920, 2 / 3);
    expect(rect.width).toBe(1080);
    expect(rect.height).toBeCloseTo(1080 * 1.5, 6);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo((1920 - rect.height) / 2, 6);
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
