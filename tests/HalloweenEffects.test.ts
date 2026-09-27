import { describe, expect, it } from "vitest";
import { CAPTIONS, pickCaption } from "../src/effects/HalloweenEffects";

function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("pickCaption", () => {
  it('returns undefined for mode "off", never consulting rng', () => {
    let called = false;
    const rng = () => {
      called = true;
      return 0;
    };
    expect(pickCaption("off", "whatever", rng)).toBeUndefined();
    expect(called).toBe(false);
  });

  it('returns the fixed caption verbatim for mode "fixed", never consulting rng', () => {
    let called = false;
    const rng = () => {
      called = true;
      return 0;
    };
    expect(pickCaption("fixed", "HAUNTED AND THIRSTY.", rng)).toBe("HAUNTED AND THIRSTY.");
    expect(called).toBe(false);
  });

  it('mode "fixed" returns the fixed caption even when it is empty', () => {
    expect(pickCaption("fixed", "", () => 0.5)).toBe("");
  });

  it('mode "random" picks a caption from CAPTIONS using the rng', () => {
    const result = pickCaption("random", "", () => 0);
    expect(result).toBe(CAPTIONS[0]);
  });

  it('mode "random" maps rng values across the full CAPTIONS list deterministically', () => {
    for (let i = 0; i < CAPTIONS.length; i++) {
      // Pick an rng value that lands floor(rng * length) === i.
      const rngValue = (i + 0.5) / CAPTIONS.length;
      const result = pickCaption("random", "", () => rngValue);
      expect(result).toBe(CAPTIONS[i]);
    }
  });

  it('mode "random" never indexes out of bounds even at the rng edge (just under 1)', () => {
    const result = pickCaption("random", "", () => 0.999999999);
    expect(result).toBe(CAPTIONS[CAPTIONS.length - 1]);
    expect(result).not.toBeUndefined();
  });

  it('mode "random" only consumes a single rng draw', () => {
    const rng = sequenceRng([0.42, 999]); // second value should never be reached
    const result = pickCaption("random", "", rng);
    expect(CAPTIONS).toContain(result);
  });

  it("CAPTIONS is non-empty and contains only non-empty strings", () => {
    expect(CAPTIONS.length).toBeGreaterThan(0);
    for (const caption of CAPTIONS) {
      expect(typeof caption).toBe("string");
      expect(caption.length).toBeGreaterThan(0);
    }
  });
});
