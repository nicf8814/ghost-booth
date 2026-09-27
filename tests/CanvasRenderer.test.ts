import { describe, expect, it } from "vitest";
import { triangleAffineTransform } from "../src/rendering/CanvasRenderer";

function apply(t: { a: number; b: number; c: number; d: number; e: number; f: number }, p: [number, number]): [number, number] {
  return [t.a * p[0] + t.c * p[1] + t.e, t.b * p[0] + t.d * p[1] + t.f];
}

describe("triangleAffineTransform", () => {
  it("returns the identity when source and destination triangles are the same", () => {
    const s0: [number, number] = [0, 0];
    const s1: [number, number] = [10, 0];
    const s2: [number, number] = [0, 10];
    const t = triangleAffineTransform(s0, s1, s2, s0, s1, s2);
    expect(t).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it("maps every source vertex exactly onto its destination vertex", () => {
    const s0: [number, number] = [0, 0];
    const s1: [number, number] = [20, 5];
    const s2: [number, number] = [4, 30];
    const d0: [number, number] = [100, 50];
    const d1: [number, number] = [140, 40];
    const d2: [number, number] = [90, 120];

    const t = triangleAffineTransform(s0, s1, s2, d0, d1, d2);

    for (const [s, d] of [
      [s0, d0],
      [s1, d1],
      [s2, d2],
    ] as const) {
      const mapped = apply(t, s);
      expect(mapped[0]).toBeCloseTo(d[0], 6);
      expect(mapped[1]).toBeCloseTo(d[1], 6);
    }
  });

  it("recovers a pure uniform scale", () => {
    const s0: [number, number] = [0, 0];
    const s1: [number, number] = [10, 0];
    const s2: [number, number] = [0, 10];
    const d0: [number, number] = [0, 0];
    const d1: [number, number] = [20, 0];
    const d2: [number, number] = [0, 20];

    const t = triangleAffineTransform(s0, s1, s2, d0, d1, d2);
    expect(t.a).toBeCloseTo(2, 6);
    expect(t.d).toBeCloseTo(2, 6);
    expect(t.b).toBeCloseTo(0, 6);
    expect(t.c).toBeCloseTo(0, 6);
  });

  it("falls back to identity for a degenerate (zero-area) source triangle instead of NaN/Infinity", () => {
    const s0: [number, number] = [0, 0];
    const s1: [number, number] = [10, 0];
    const s2: [number, number] = [20, 0]; // collinear -> zero area
    const t = triangleAffineTransform(s0, s1, s2, [0, 0], [1, 1], [2, 2]);
    expect(t).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });
});
