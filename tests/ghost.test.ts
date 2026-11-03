import { describe, expect, it } from "vitest";
import { GHOST_CHOICES, RANDOM_GHOST_CHANCE, pickRandomGhost } from "../src/ghost";

// A small seeded generator so the odds test is repeatable.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("random ghost odds", () => {
  it("only ever picks no ghost, Nic, the bride or the couple", () => {
    const rng = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const pick = pickRandomGhost(rng);
      expect([0, 1, 2, 3]).toContain(pick);
    }
    expect(GHOST_CHOICES[1]).toEqual(["nic"]);
    expect(GHOST_CHOICES[2]).toEqual(["bride"]);
    expect(GHOST_CHOICES[3]).toEqual(["man", "woman"]);
    // Ryan is only on the button cycle for now, never in random mode
    expect(GHOST_CHOICES[4]).toEqual(["ryan"]);
  });

  it("adds a ghost to about 60% of photos, split couple 40 / bride 40 / Nic 20", () => {
    const rng = seeded(2026);
    const N = 50_000;
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) counts[pickRandomGhost(rng)]++;
    const ghosted = N - counts[0];
    expect(RANDOM_GHOST_CHANCE).toBe(0.6);
    expect(ghosted / N).toBeCloseTo(0.6, 1);
    expect(Math.abs(ghosted / N - 0.6)).toBeLessThan(0.01);
    expect(Math.abs(counts[3] / ghosted - 0.4)).toBeLessThan(0.015);
    expect(Math.abs(counts[2] / ghosted - 0.4)).toBeLessThan(0.015);
    expect(Math.abs(counts[1] / ghosted - 0.2)).toBeLessThan(0.015);
  });
});
