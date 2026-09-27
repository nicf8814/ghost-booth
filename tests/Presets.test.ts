import { describe, expect, it } from "vitest";
import {
  NEUTRAL_CONFIG,
  PRESET_CONFIGS,
  SAFE_MAX_SCALE,
  SAFE_MIN_SCALE,
  clampToSafeLimits,
  randomWtfConfig,
  resolvePreset,
  scaleTowardNeutral,
  varyConfigForFace,
  type CaricatureConfiguration,
} from "../src/effects/Presets";

// A deterministic stand-in for the app's seeded rng (CLAUDE.md section 20)
// -- a fixed sequence of values fed out in order, so a test can assert
// exact outputs instead of just "within range". Falls back to repeating
// the last value once the sequence runs out, which is enough for these
// tests since none of them need more draws than they supply.
function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i++;
    return v;
  };
}

const SCALE_FIELDS: Array<keyof CaricatureConfiguration> = [
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
  "neckScale",
  "shoulderScale",
  "bodyScale",
];

describe("clampToSafeLimits", () => {
  it("clamps every *Scale field into [SAFE_MIN_SCALE, SAFE_MAX_SCALE]", () => {
    const wild: CaricatureConfiguration = {
      ...NEUTRAL_CONFIG,
      eyeScale: 0.1,
      noseScale: 10,
      mouthScale: SAFE_MIN_SCALE,
      foreheadScale: SAFE_MAX_SCALE,
      jawScale: -5,
      cheekScale: 999,
      earScale: 0.5,
      eyebrowScale: 2.4,
      faceWidth: 0,
      faceHeight: 100,
      neckScale: 1,
      shoulderScale: 1,
      bodyScale: 1,
      randomness: 0.5,
    };
    const clamped = clampToSafeLimits(wild);

    for (const field of SCALE_FIELDS) {
      expect(clamped[field]).toBeGreaterThanOrEqual(SAFE_MIN_SCALE);
      expect(clamped[field]).toBeLessThanOrEqual(SAFE_MAX_SCALE);
    }

    expect(clamped.eyeScale).toBe(SAFE_MIN_SCALE); // 0.1 clamped up
    expect(clamped.noseScale).toBe(SAFE_MAX_SCALE); // 10 clamped down
    expect(clamped.mouthScale).toBe(SAFE_MIN_SCALE); // already at the floor
    expect(clamped.foreheadScale).toBe(SAFE_MAX_SCALE); // already at the ceiling
    expect(clamped.jawScale).toBe(SAFE_MIN_SCALE); // negative clamped up
    expect(clamped.cheekScale).toBe(SAFE_MAX_SCALE);
    expect(clamped.faceWidth).toBe(SAFE_MIN_SCALE);
    expect(clamped.faceHeight).toBe(SAFE_MAX_SCALE);
  });

  it("clamps randomness into [0, 1] independently of the scale range", () => {
    expect(clampToSafeLimits({ ...NEUTRAL_CONFIG, randomness: -1 }).randomness).toBe(0);
    expect(clampToSafeLimits({ ...NEUTRAL_CONFIG, randomness: 5 }).randomness).toBe(1);
    expect(clampToSafeLimits({ ...NEUTRAL_CONFIG, randomness: 0.42 }).randomness).toBe(0.42);
  });

  it("leaves in-range values untouched", () => {
    const config: CaricatureConfiguration = { ...NEUTRAL_CONFIG, eyeScale: 1.35, noseScale: 1.55, randomness: 0.3 };
    expect(clampToSafeLimits(config)).toEqual(config);
  });
});

describe("scaleTowardNeutral", () => {
  const exaggerated: CaricatureConfiguration = {
    ...NEUTRAL_CONFIG,
    eyeScale: 1.4,
    noseScale: 2.0,
    mouthScale: 0.6,
    foreheadScale: 1.5,
    jawScale: 1.75,
    cheekScale: 1.2,
    earScale: 1.9,
    eyebrowScale: 1.3,
    faceWidth: 0.8,
    faceHeight: 1.2,
    neckScale: 1.1,
    shoulderScale: 0.75,
    bodyScale: 1.45,
    randomness: 0.5,
  };

  it("strength=0 collapses every *Scale field to neutral (1.0)", () => {
    const result = scaleTowardNeutral(exaggerated, 0);
    for (const field of SCALE_FIELDS) {
      expect(result[field]).toBe(1);
    }
  });

  it("strength=1 returns the config unchanged (aside from float rounding)", () => {
    const result = scaleTowardNeutral(exaggerated, 1);
    for (const field of SCALE_FIELDS) {
      expect(result[field]).toBeCloseTo(exaggerated[field], 10);
    }
  });

  it("lerps proportionally at an intermediate strength", () => {
    const result = scaleTowardNeutral(exaggerated, 0.5);
    // 1 + (2.0 - 1) * 0.5 = 1.5
    expect(result.noseScale).toBeCloseTo(1.5, 10);
    // 1 + (0.6 - 1) * 0.5 = 0.8 (works below 1.0 too)
    expect(result.mouthScale).toBeCloseTo(0.8, 10);
  });

  it("clamps out-of-range strength into [0, 1] instead of extrapolating", () => {
    const over = scaleTowardNeutral(exaggerated, 5);
    const atOne = scaleTowardNeutral(exaggerated, 1);
    expect(over).toEqual(atOne);

    const under = scaleTowardNeutral(exaggerated, -3);
    const atZero = scaleTowardNeutral(exaggerated, 0);
    expect(under).toEqual(atZero);
  });

  it("passes randomness through untouched regardless of strength", () => {
    expect(scaleTowardNeutral(exaggerated, 0).randomness).toBe(0.5);
    expect(scaleTowardNeutral(exaggerated, 0.5).randomness).toBe(0.5);
    expect(scaleTowardNeutral(exaggerated, 1).randomness).toBe(0.5);
  });
});

describe("resolvePreset", () => {
  const presetNames = Object.keys(PRESET_CONFIGS) as Array<keyof typeof PRESET_CONFIGS>;

  it.each(presetNames)("resolves %s to NEUTRAL_CONFIG merged with its PRESET_CONFIGS entry, clamped", (name) => {
    const rng = sequenceRng([0.123]); // named presets never consult rng
    const resolved = resolvePreset(name, rng);
    const expected = clampToSafeLimits({ ...NEUTRAL_CONFIG, ...PRESET_CONFIGS[name] });
    expect(resolved).toEqual(expected);
  });

  it('delegates "Random" to randomWtfConfig using the same rng', () => {
    const values = [0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.05, 0.15, 0.25, 0.35];
    const viaResolve = resolvePreset("Random", sequenceRng(values));
    const viaDirect = randomWtfConfig(sequenceRng(values));
    expect(viaResolve).toEqual(viaDirect);
  });

  it("every named preset stays within the safe scale range and full randomness range", () => {
    for (const name of presetNames) {
      const resolved = resolvePreset(name, sequenceRng([0]));
      for (const field of SCALE_FIELDS) {
        expect(resolved[field]).toBeGreaterThanOrEqual(SAFE_MIN_SCALE);
        expect(resolved[field]).toBeLessThanOrEqual(SAFE_MAX_SCALE);
      }
      expect(resolved.randomness).toBeGreaterThanOrEqual(0);
      expect(resolved.randomness).toBeLessThanOrEqual(1);
    }
  });
});

describe("randomWtfConfig", () => {
  it("always forces nose/jaw/ear into their documented ranges", () => {
    // rng() = 0 for every draw -> every range's low end.
    const low = randomWtfConfig(sequenceRng([0]));
    expect(low.noseScale).toBeCloseTo(1.8, 10);
    expect(low.jawScale).toBeCloseTo(1.5, 10);
    expect(low.earScale).toBeCloseTo(1.5, 10);

    // rng() just under 1 for every draw -> every range's high end.
    const high = randomWtfConfig(sequenceRng([0.999999]));
    expect(high.noseScale).toBeGreaterThan(2.15);
    expect(high.noseScale).toBeLessThanOrEqual(2.2);
    expect(high.jawScale).toBeGreaterThan(1.85);
    expect(high.jawScale).toBeLessThanOrEqual(1.9);
    expect(high.earScale).toBeGreaterThan(1.95);
    expect(high.earScale).toBeLessThanOrEqual(2.0);
  });

  it("picks the huge-eye branch when the coin flip lands below 0.5", () => {
    // Draw order: nose, jaw, ear, then eye's branch-check (< 0.5 -> huge
    // branch), then eye's within-branch roll: 1.5 + 0.5*0.5 = 1.75.
    const config = randomWtfConfig(sequenceRng([0.9, 0.9, 0.9, 0.2, 0.5]));
    expect(config.eyeScale).toBeCloseTo(1.75, 10);
    expect(config.eyeScale).toBeGreaterThanOrEqual(1.5);
    expect(config.eyeScale).toBeLessThanOrEqual(2.0);
  });

  it("picks the beady-eye branch when the coin flip lands at or above 0.5", () => {
    // branch-check = 0.5 (>= 0.5 -> beady branch), value = 0.5 -> 0.6 + 0.5*0.2 = 0.7.
    const config = randomWtfConfig(sequenceRng([0.9, 0.9, 0.9, 0.5, 0.5]));
    expect(config.eyeScale).toBeCloseTo(0.7, 10);
    expect(config.eyeScale).toBeGreaterThanOrEqual(0.6);
    expect(config.eyeScale).toBeLessThanOrEqual(0.8);
  });

  it("selects between 2 and 4 of the optional features, leaving the rest neutral", () => {
    const optional: Array<keyof CaricatureConfiguration> = [
      "mouthScale",
      "foreheadScale",
      "cheekScale",
      "eyebrowScale",
      "shoulderScale",
      "bodyScale",
    ];

    // Draw order: nose, jaw, ear, eye branch-check (0.9 -> beady), eye
    // value, then count = 2 + floor(rng() * 3); rng() = 0 -> count = 2.
    // Remaining draws (shuffle + feature values + randomness) use 0.5.
    const values = [0.9, 0.9, 0.9, 0.9, 0.9, 0, ...Array(20).fill(0.5)];
    const config = randomWtfConfig(sequenceRng(values));
    const touched = optional.filter((f) => config[f] !== 1);
    expect(touched.length).toBe(2);
    for (const field of touched) {
      expect(config[field]).toBeGreaterThanOrEqual(1.4);
      expect(config[field]).toBeLessThanOrEqual(1.9);
    }
  });

  it("sets randomness within [0.4, 0.7] and never exceeds safe clamp bounds even at rng extremes", () => {
    const configLow = randomWtfConfig(sequenceRng([0]));
    const configHigh = randomWtfConfig(sequenceRng([0.999999]));

    for (const config of [configLow, configHigh]) {
      expect(config.randomness).toBeGreaterThanOrEqual(0.4);
      expect(config.randomness).toBeLessThanOrEqual(0.7);
      for (const field of SCALE_FIELDS) {
        expect(config[field]).toBeGreaterThanOrEqual(SAFE_MIN_SCALE);
        expect(config[field]).toBeLessThanOrEqual(SAFE_MAX_SCALE);
      }
    }
  });

  it("is deterministic for a given rng sequence (seeded reproducibility, CLAUDE.md section 20)", () => {
    const values = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99, 0.12, 0.34, 0.56];
    const a = randomWtfConfig(sequenceRng(values));
    const b = randomWtfConfig(sequenceRng(values));
    expect(a).toEqual(b);
  });
});

describe("varyConfigForFace", () => {
  const base = resolvePreset("Goblin", sequenceRng([0]));

  it("stays within the safe scale range and full randomness range regardless of face index", () => {
    for (let i = 0; i < 6; i++) {
      const varied = varyConfigForFace(base, i, sequenceRng([0.3, 0.6, 0.9, 0.1, 0.5]));
      for (const field of SCALE_FIELDS) {
        expect(varied[field]).toBeGreaterThanOrEqual(SAFE_MIN_SCALE);
        expect(varied[field]).toBeLessThanOrEqual(SAFE_MAX_SCALE);
      }
    }
  });

  it("boosts a different signature feature depending on faceIndex (CLAUDE.md section 10)", () => {
    // rng() = 0.5 for every draw -> jitter is a no-op (1 + (0.5-0.5)*0.3 = 1)
    // and the signature boost is 1.6 + 0.5*0.5 = 1.85. Goblin's own
    // noseScale (2.1) already exceeds that floor, so index 1 (noseScale)
    // is skipped here -- index 2 (foreheadScale, Goblin base 1.35) isn't.
    const rng = () => 0.5;
    const person0 = varyConfigForFace(base, 0, rng); // eyeScale
    const person2 = varyConfigForFace(base, 2, rng); // foreheadScale
    const person3 = varyConfigForFace(base, 3, rng); // jawScale

    expect(person0.eyeScale).toBeCloseTo(1.85, 10);
    expect(person2.foreheadScale).toBeCloseTo(1.85, 10);
    expect(person3.jawScale).toBeCloseTo(1.85, 10);
  });

  it("cycles the signature feature list rather than running out past 6 faces", () => {
    const rng = () => 0.5;
    const person0 = varyConfigForFace(base, 0, rng);
    const person6 = varyConfigForFace(base, 6, rng); // wraps back to eyeScale
    expect(person6.eyeScale).toBeCloseTo(person0.eyeScale, 10);
  });

  it("never lowers the signature feature below its boosted floor even if the base preset already exceeds it", () => {
    // Witch's noseScale (2.15) is already above the 1.6-2.1 boost range --
    // varyConfigForFace must never *reduce* a feature the base preset
    // already exaggerated further than the guaranteed floor.
    const witch = resolvePreset("Witch", sequenceRng([0]));
    const rng = () => 0; // jitter -15%, boost floor at its minimum (1.6)
    const varied = varyConfigForFace(witch, 1, rng); // signature = noseScale
    expect(varied.noseScale).toBeGreaterThanOrEqual(witch.noseScale * 0.85 - 1e-9);
  });

  it("is deterministic for a given rng sequence and face index", () => {
    const values = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99, 0.12, 0.34, 0.56];
    const a = varyConfigForFace(base, 2, sequenceRng(values));
    const b = varyConfigForFace(base, 2, sequenceRng(values));
    expect(a).toEqual(b);
  });
});
