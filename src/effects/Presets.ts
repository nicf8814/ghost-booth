import type { CaricaturePreset } from "../app/Settings";

// CLAUDE.md sections 12, 15-19: caricature parameters and named presets.
// Normal (no-op) value for every scale is 1.0.

export interface CaricatureConfiguration {
  eyeScale: number;
  noseScale: number;
  mouthScale: number;
  foreheadScale: number;
  jawScale: number;
  cheekScale: number;
  earScale: number;
  eyebrowScale: number;
  faceWidth: number;
  faceHeight: number;
  neckScale: number;
  shoulderScale: number;
  bodyScale: number;
  randomness: number;
}

export const NEUTRAL_CONFIG: CaricatureConfiguration = {
  eyeScale: 1,
  noseScale: 1,
  mouthScale: 1,
  foreheadScale: 1,
  jawScale: 1,
  cheekScale: 1,
  earScale: 1,
  eyebrowScale: 1,
  faceWidth: 1,
  faceHeight: 1,
  neckScale: 1,
  shoulderScale: 1,
  bodyScale: 1,
  randomness: 0,
};

// Safe limits: the mesh warp must never be asked to fold over itself
// (CLAUDE.md section 12).
export const SAFE_MIN_SCALE = 0.6;
export const SAFE_MAX_SCALE = 1.8;

export function clampToSafeLimits(config: CaricatureConfiguration): CaricatureConfiguration {
  const clamp = (v: number) => Math.min(SAFE_MAX_SCALE, Math.max(SAFE_MIN_SCALE, v));
  return {
    eyeScale: clamp(config.eyeScale),
    noseScale: clamp(config.noseScale),
    mouthScale: clamp(config.mouthScale),
    foreheadScale: clamp(config.foreheadScale),
    jawScale: clamp(config.jawScale),
    cheekScale: clamp(config.cheekScale),
    earScale: clamp(config.earScale),
    eyebrowScale: clamp(config.eyebrowScale),
    faceWidth: clamp(config.faceWidth),
    faceHeight: clamp(config.faceHeight),
    neckScale: clamp(config.neckScale),
    shoulderScale: clamp(config.shoulderScale),
    bodyScale: clamp(config.bodyScale),
    randomness: Math.min(1, Math.max(0, config.randomness)),
  };
}

export const PRESET_CONFIGS: Record<Exclude<CaricaturePreset, "Random">, Partial<CaricatureConfiguration>> = {
  Goblin: { eyeScale: 0.85, noseScale: 1.65, mouthScale: 0.9, foreheadScale: 1.25, jawScale: 1.45, earScale: 1.5 },
  Demon: { eyeScale: 1.4, noseScale: 1.3, mouthScale: 1.25, foreheadScale: 1.4, jawScale: 1.5 },
  HotMess: { eyeScale: 1.25, noseScale: 1.2, mouthScale: 1.4, jawScale: 1.15, cheekScale: 1.35, randomness: 0.35 },
  Witch: { noseScale: 1.5, jawScale: 1.2, eyebrowScale: 1.4, foreheadScale: 1.1 },
  Vampire: { eyeScale: 1.15, mouthScale: 1.2, cheekScale: 0.9, jawScale: 1.1 },
  PumpkinHead: { faceWidth: 1.3, faceHeight: 1.2, cheekScale: 1.3, mouthScale: 1.2 },
  CartoonVillain: { eyebrowScale: 1.5, jawScale: 1.3, noseScale: 1.2, eyeScale: 1.1 },
  DrunkUncle: { noseScale: 1.4, cheekScale: 1.4, eyeScale: 0.9, mouthScale: 1.15 },
  EvilPromQueen: { eyeScale: 1.3, mouthScale: 1.3, eyebrowScale: 1.3, faceWidth: 0.9 },
};

/**
 * Applies the operator's `caricatureStrength` setting (0..1): scales every
 * *Scale field toward 1.0 (no-op) as strength drops toward 0, so an
 * operator can dial the effect down to "barely there" without picking a
 * different preset. `randomness` is left alone since it's not a *Scale
 * field and already has its own per-preset meaning.
 */
export function scaleTowardNeutral(config: CaricatureConfiguration, strength: number): CaricatureConfiguration {
  const s = Math.min(1, Math.max(0, strength));
  const lerp = (v: number) => 1 + (v - 1) * s;
  return {
    eyeScale: lerp(config.eyeScale),
    noseScale: lerp(config.noseScale),
    mouthScale: lerp(config.mouthScale),
    foreheadScale: lerp(config.foreheadScale),
    jawScale: lerp(config.jawScale),
    cheekScale: lerp(config.cheekScale),
    earScale: lerp(config.earScale),
    eyebrowScale: lerp(config.eyebrowScale),
    faceWidth: lerp(config.faceWidth),
    faceHeight: lerp(config.faceHeight),
    neckScale: lerp(config.neckScale),
    shoulderScale: lerp(config.shoulderScale),
    bodyScale: lerp(config.bodyScale),
    randomness: config.randomness,
  };
}

/** Resolves a named preset (or "Random") into a safe, complete configuration. */
export function resolvePreset(
  preset: CaricaturePreset,
  rng: () => number,
): CaricatureConfiguration {
  if (preset === "Random") {
    return randomWtfConfig(rng);
  }
  return clampToSafeLimits({ ...NEUTRAL_CONFIG, ...PRESET_CONFIGS[preset] });
}

/** WTF mode (CLAUDE.md section 19): pick 2-5 features and exaggerate them. */
export function randomWtfConfig(rng: () => number): CaricatureConfiguration {
  const features: Array<keyof CaricatureConfiguration> = [
    "eyeScale",
    "noseScale",
    "mouthScale",
    "foreheadScale",
    "jawScale",
    "earScale",
    "cheekScale",
  ];
  const count = 2 + Math.floor(rng() * 4); // 2..5
  const chosen = shuffle(features, rng).slice(0, count);

  const config = { ...NEUTRAL_CONFIG };
  for (const feature of chosen) {
    config[feature] = 1.3 + rng() * 0.45; // 1.3..1.75
  }
  config.randomness = 0.4 + rng() * 0.3;
  return clampToSafeLimits(config);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
