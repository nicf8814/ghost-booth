import { describe, expect, it } from "vitest";
import { GHOST_CHOICES, RANDOM_GHOSTS, RANDOM_GHOST_CHANCE, RANDOM_GHOST_WEIGHTS, pickRandomGhost } from "../src/ghost";

// A small seeded generator so the odds test is repeatable.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("ghost choices", () => {
  it("has no Nic ghost and includes Kristen and the Kristen and Ryan couple", () => {
    const names = GHOST_CHOICES.flat() as string[];
    expect(names).not.toContain("nic");
    expect(GHOST_CHOICES).toContainEqual(["kristen"]);
    expect(GHOST_CHOICES).toContainEqual(["kristenryan"]);
    expect(GHOST_CHOICES).toContainEqual(["ryan"]);
    expect(GHOST_CHOICES).toContainEqual(["clinton"]);
  });

  it("finds every random ghost in the button cycle", () => {
    for (const w of RANDOM_GHOST_WEIGHTS) expect(w.index).toBeGreaterThan(0);
  });
});

describe("random ghost odds", () => {
  it("never picks the everyone group", () => {
    const everyone = GHOST_CHOICES.length - 1;
    const rng = seeded(7);
    for (let i = 0; i < 5000; i++) expect(pickRandomGhost(rng)).not.toBe(everyone);
  });

  it("adds a ghost to about 75% of photos, split equally across all six ghosts", () => {
    const rng = seeded(2026);
    const N = 120_000;
    const counts = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const pick = pickRandomGhost(rng);
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    const none = counts.get(0) ?? 0;
    const ghosted = N - none;
    expect(RANDOM_GHOST_CHANCE).toBe(0.75);
    expect(Math.abs(ghosted / N - 0.75)).toBeLessThan(0.01);
    expect(Math.abs(none / N - 0.25)).toBeLessThan(0.01);
    expect(RANDOM_GHOSTS).toHaveLength(6);
    for (const w of RANDOM_GHOST_WEIGHTS) {
      // each of the six gets 1/6 of the ghosted photos (12.5% of all photos)
      expect(Math.abs((counts.get(w.index) ?? 0) / ghosted - 1 / 6)).toBeLessThan(0.01);
    }
  });
});
