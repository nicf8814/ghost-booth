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
// (CLAUDE.md section 12). MeshWarp.ts's radial remap is strictly
// monotonic for *any* positive scale, so folding isn't actually a risk at
// higher values -- this range is a taste/legibility ceiling (how far a
// feature can stretch before it stops reading as "exaggerated face" and
// starts reading as "broken photo"), not a mathematical necessity.
export const SAFE_MIN_SCALE = 0.5;
export const SAFE_MAX_SCALE = 2.4;

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

// Every preset sets an eyeScale/noseScale/jawScale/earScale: those four
// were the first deformations wired up (CLAUDE.md section 59's
// incremental build order). mouthScale/foreheadScale/cheekScale/
// eyebrowScale/shoulderScale/bodyScale are now wired up too
// (CaricatureEngine.ts), so a preset that left one at the neutral 1.0
// would look like that feature simply wasn't part of the effect. Values
// lean toward the top of the safe range by design (CLAUDE.md section 63's
// "dark Halloween... absurd... cartoonish" personality, and the booth's
// own goofy/scary-witch mix) rather than a restrained "tasteful" amount -
// an operator who wants subtler results has the Caricature Strength
// slider for that, rather than needing every preset re-authored softer.
export const PRESET_CONFIGS: Record<Exclude<CaricaturePreset, "Random">, Partial<CaricatureConfiguration>> = {
  Goblin: { eyeScale: 0.75, noseScale: 2.1, mouthScale: 0.85, foreheadScale: 1.35, jawScale: 1.75, earScale: 1.95, shoulderScale: 0.75, bodyScale: 0.85 },
  Demon: { eyeScale: 1.65, noseScale: 1.65, mouthScale: 1.4, foreheadScale: 1.5, jawScale: 1.75, earScale: 1.35, shoulderScale: 1.35, bodyScale: 1.2 },
  HotMess: { eyeScale: 1.45, noseScale: 1.55, mouthScale: 1.6, jawScale: 1.3, cheekScale: 1.5, earScale: 1.3, bodyScale: 1.2, randomness: 0.35 },
  // Witch leans into the classic long-nose/pointed-chin silhouette.
  Witch: { eyeScale: 1.3, noseScale: 2.15, jawScale: 1.55, eyebrowScale: 1.55, foreheadScale: 1.15, earScale: 1.2, shoulderScale: 0.85 },
  Vampire: { eyeScale: 1.3, noseScale: 1.35, mouthScale: 1.3, cheekScale: 0.85, jawScale: 1.2, earScale: 1.45, shoulderScale: 1.15 },
  // "Pumpkin body" is CLAUDE.md section 14's own example for body
  // caricature, so this preset is where bodyScale leans hardest.
  PumpkinHead: { faceWidth: 1.45, faceHeight: 1.35, cheekScale: 1.45, mouthScale: 1.3, noseScale: 1.35, eyeScale: 1.2, jawScale: 1.3, earScale: 1.2, shoulderScale: 0.85, bodyScale: 1.45 },
  CartoonVillain: { eyebrowScale: 1.65, jawScale: 1.55, noseScale: 1.65, eyeScale: 1.25, earScale: 1.35, shoulderScale: 1.25 },
  DrunkUncle: { noseScale: 1.95, cheekScale: 1.55, eyeScale: 0.85, mouthScale: 1.2, jawScale: 1.3, earScale: 1.5, shoulderScale: 0.8, bodyScale: 1.3 },
  EvilPromQueen: { eyeScale: 1.5, noseScale: 1.35, mouthScale: 1.4, eyebrowScale: 1.4, faceWidth: 0.85, jawScale: 1.2, earScale: 1.15, shoulderScale: 0.85, bodyScale: 0.9 },
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
  // nose/eyes/jaw/ears are forced into every roll, at a near-maxed range,
  // rather than left to chance, so a "random" photo always visibly does
  // something to the four most legible features. The rest of the wired-up
  // features (mouth/forehead/cheek/eyebrow/shoulder/body) are randomized
  // on top, a subset per roll, for variety between photos.
  const config = { ...NEUTRAL_CONFIG };
  config.noseScale = 1.8 + rng() * 0.4; // 1.8..2.2
  config.jawScale = 1.5 + rng() * 0.4; // 1.5..1.9
  config.earScale = 1.5 + rng() * 0.5; // 1.5..2.0
  // Eyes randomly go huge (cartoon) or beady (goblin/witch) rather than
  // always enlarging, since both read as "caricature" for eyes
  // specifically.
  config.eyeScale = rng() < 0.5 ? 1.5 + rng() * 0.5 : 0.6 + rng() * 0.2;

  const otherFeatures: Array<keyof CaricatureConfiguration> = [
    "mouthScale",
    "foreheadScale",
    "cheekScale",
    "eyebrowScale",
    "shoulderScale",
    "bodyScale",
  ];
  const count = 2 + Math.floor(rng() * 3); // 2..4, on top of the four always-rolled features above
  for (const feature of shuffle(otherFeatures, rng).slice(0, count)) {
    config[feature] = 1.4 + rng() * 0.5; // 1.4..1.9
  }

  config.randomness = 0.4 + rng() * 0.3;
  return clampToSafeLimits(config);
}

// CLAUDE.md section 10: "Every face gets its own effect parameters... Do
// not apply one deformation uniformly to every face." One `feature per
// person" example straight from that section: Person 1 -> giant eyes,
// Person 2 -> giant nose, Person 3 -> giant forehead, Person 4 -> enormous
// jaw -- extended here with ears/cheeks for a 5th/6th guest (CLAUDE.md
// section 10's 1-6 person target).
const SIGNATURE_FEATURES: Array<keyof CaricatureConfiguration> = [
  "eyeScale",
  "noseScale",
  "foreheadScale",
  "jawScale",
  "earScale",
  "cheekScale",
];

/**
 * Derives one face's caricature config from the photo's shared base preset
 * (CapturePipeline.ts resolves the preset once per photo, then calls this
 * once per detected face). Two things differentiate a face from its
 * neighbors sharing the same preset: a small random jitter on every *Scale
 * field, so two Goblins standing next to each other don't come out
 * pixel-identical, and a guaranteed "signature" feature -- boosted to a
 * clearly-exaggerated floor regardless of what the base preset set it to --
 * cycling through the list above by the face's position in the group so a
 * group photo reads as several different distorted people rather than one
 * effect stamped onto everyone. Always clamped back into the safe range.
 */
export function varyConfigForFace(
  base: CaricatureConfiguration,
  faceIndex: number,
  rng: () => number,
): CaricatureConfiguration {
  const jitterable: Array<keyof CaricatureConfiguration> = [
    "eyeScale",
    "noseScale",
    "mouthScale",
    "foreheadScale",
    "jawScale",
    "cheekScale",
    "earScale",
    "eyebrowScale",
    "faceWidth",
    "faceHeight",
    "shoulderScale",
    "bodyScale",
  ];
  const varied = { ...base };
  for (const key of jitterable) {
    const jitter = 1 + (rng() - 0.5) * 0.3; // +/- 15%
    varied[key] = varied[key] * jitter;
  }

  const signature = SIGNATURE_FEATURES[faceIndex % SIGNATURE_FEATURES.length];
  varied[signature] = Math.max(varied[signature], 1.6 + rng() * 0.5);

  return clampToSafeLimits(varied);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
