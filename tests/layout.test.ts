import { describe, expect, it } from "vitest";
import { CAPTION, PHOTO, PRINT_H, PRINT_W, SAFE, coverCrop, rotatedSize } from "../src/layout";

describe("print layout", () => {
  it("is 2:3 portrait for the Kodak 2x3 paper", () => {
    expect(PRINT_W / PRINT_H).toBeCloseTo(2 / 3);
  });

  it("keeps photo and caption inside the safe margin", () => {
    expect(PHOTO.x).toBeGreaterThanOrEqual(SAFE);
    expect(PHOTO.x + PHOTO.w).toBeLessThanOrEqual(PRINT_W - SAFE);
    expect(CAPTION.top).toBe(PHOTO.y + PHOTO.h);
    expect(CAPTION.bottom).toBeLessThanOrEqual(PRINT_H - SAFE);
    expect(CAPTION.bottom - CAPTION.top).toBeGreaterThan(250);
  });
});

describe("coverCrop", () => {
  it("trims the sides of a wide source", () => {
    const r = coverCrop(1920, 1080, 1000, 1000);
    expect(r).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
  });

  it("trims top and bottom of a tall source", () => {
    const r = coverCrop(1000, 2000, 1000, 1000);
    expect(r).toEqual({ x: 0, y: 500, w: 1000, h: 1000 });
  });

  it("keeps the destination aspect ratio", () => {
    const r = coverCrop(1440, 1920, PHOTO.w, PHOTO.h);
    expect(r.w / r.h).toBeCloseTo(PHOTO.w / PHOTO.h);
  });
});

describe("rotatedSize", () => {
  it("leaves the frame alone by default", () => {
    expect(rotatedSize(1440, 1920, "none")).toEqual({ w: 1440, h: 1920 });
  });
  it("swaps width and height when turning", () => {
    expect(rotatedSize(1920, 1440, "cw")).toEqual({ w: 1440, h: 1920 });
    expect(rotatedSize(1920, 1440, "ccw")).toEqual({ w: 1440, h: 1920 });
  });
});
