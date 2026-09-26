// Deterministic, seeded randomization (CLAUDE.md section 20).
// A seed is generated per photograph so every downstream choice
// (feature selection, deformation strength, ghost params, caption,
// frame, overlays) can be reproduced for debugging.

export function createSeed(): string {
  return crypto.randomUUID();
}

/**
 * Small, fast, deterministic PRNG (mulberry32) seeded from a string.
 * Not cryptographic; purely for reproducible visual randomness.
 */
export function seededRandom(seed: string): () => number {
  let a = hashStringToUint32(seed);
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToUint32(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Pick a random element deterministically from a seeded rng. */
export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}
