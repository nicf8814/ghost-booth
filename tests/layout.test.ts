import { describe, expect, it } from "vitest";
import { FRAME } from "../src/frames";
import { HD_SCALE, PRINT_H, PRINT_W, coverCrop, rotatedSize } from "../src/layout";

// The photo area the ghosts are placed against (the default soft-edge look).
const PHOTO = FRAME.soft.photo;

describe("print layout", () => {
  it("is 2:3 portrait for the Kodak 2x3 paper", () => {
    expect(PRINT_W / PRINT_H).toBeCloseTo(2 / 3);
  });

  it("keeps the photo and caption of the border inside the print", () => {
    for (const photo of [FRAME.photo, FRAME.soft.photo]) {
      expect(photo.x).toBeGreaterThanOrEqual(0);
      expect(photo.y).toBeGreaterThanOrEqual(0);
      expect(photo.x + photo.w).toBeLessThanOrEqual(PRINT_W);
      expect(photo.y + photo.h).toBeLessThanOrEqual(FRAME.captionTop + 20);
    }
    expect(FRAME.captionBottom).toBeLessThanOrEqual(PRINT_H);
    expect(FRAME.captionBottom - FRAME.captionTop).toBeGreaterThan(200);
  });
});

describe("hi-res export", () => {
  it("is 4K tall and keeps the 2:3 shape", () => {
    expect(Math.round(PRINT_H * HD_SCALE)).toBe(3840);
    expect(Math.round(PRINT_W * HD_SCALE)).toBe(2560);
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

import { splitBalanced } from "../src/frame";

describe("splitBalanced", () => {
  it("splits into two even lines", () => {
    expect(splitBalanced("Heisterkamp Halloween 2026")).toEqual(["Heisterkamp", "Halloween 2026"]);
  });
  it("leaves a single word alone", () => {
    expect(splitBalanced("Boo")).toEqual(["Boo"]);
  });
});

import { ghostPlacement } from "../src/ghost";
const P = PHOTO;

describe("ghostPlacement", () => {
  it("peeks in from the left, partly off the photo, below the top", () => {
    const g = ghostPlacement("nic", P, 700, 785);
    expect(g.x).toBeLessThan(P.x);
    expect(g.x + g.w).toBeGreaterThan(P.x);
    expect(g.w).toBeLessThan(P.w * 0.5);
    expect(g.y).toBeGreaterThan(P.y);
    expect(g.y + g.h).toBeLessThan(P.y + P.h);
  });
});

describe("Victorian pair placement", () => {
  it("keeps them in the top corners, clear of the center", () => {
    const man = ghostPlacement("man", P, 345, 963);
    const woman = ghostPlacement("woman", P, 375, 860);
    const center = P.x + P.w / 2;
    expect(man.x + man.w).toBeLessThan(center - P.w * 0.1);
    expect(woman.x).toBeGreaterThan(center + P.w * 0.1);
  });
  it("moves Nic down when the gentleman is in the left corner", () => {
    expect(ghostPlacement("nic", P, 700, 785, true).y).toBeGreaterThan(ghostPlacement("nic", P, 700, 785).y);
  });
});
