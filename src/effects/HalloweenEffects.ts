// Captions and processing-screen messages (CLAUDE.md sections 25-26).
// Kept as data so they're easy for an operator to extend without touching code.

export const CAPTIONS: readonly string[] = [
  "BAD DECISIONS WERE MADE.",
  "YOUR EX IS GOING TO SEE THIS.",
  "YOU LOOK LIKE TROUBLE.",
  "0% DIGNITY.",
  "HAUNTED AND THIRSTY.",
  "THIS SEEMED LIKE A GOOD IDEA.",
  "PLEASE DON'T TAG YOUR EMPLOYER.",
  "POSSESSED BY BAD DECISIONS.",
  "DEMONICALLY ATTRACTIVE.",
  "UNFIT FOR DAYLIGHT.",
  "WE HAVE QUESTIONS.",
  "YOUR MOTHER ASKED US NOT TO PRINT THIS.",
  "THE DEMONS APPROVE.",
  "HOTTER THAN A HAUNTED HOUSE.",
  "QUESTIONABLE AFTER DARK.",
];

export const PROCESSING_MESSAGES: readonly string[] = [
  "ANALYZING YOUR FACE...",
  "MEASURING BAD DECISIONS...",
  "CALCULATING DEMONIC PROPORTIONS...",
  "ENLARGING THINGS THAT DIDN'T NEED ENLARGING...",
  "SUMMONING YOUR INNER GOBLIN...",
  "ADDING QUESTIONABLE AMOUNTS OF FOREHEAD...",
  "CONSULTING THE DEMONS...",
  "FINALIZING YOUR POOR LIFE CHOICES...",
];

export const ATTRACT_MESSAGES: readonly string[] = [
  "WELCOME TO THE HAUNTED BOOTH",
  "GET YOUR FACE RUINED",
  "MAKE A TERRIBLE DECISION",
  "TAKE A PHOTO",
  "BECOME A GHOST",
  "YOUR FACE WILL NEVER BE THE SAME",
];

export const PRINT_FAILURE_MESSAGE = "THE PRINTER HAS BEEN POSSESSED.";

/**
 * Picks the caption for a photo given the operator's CaptionMode (CLAUDE.md
 * section 25). Typed as an inline union rather than importing CaptionMode
 * from app/Settings to avoid a circular import (effects/ is lower-level than
 * app/). Uses the caller's seeded rng so the choice is reproducible per-photo
 * (CLAUDE.md section 20) -- callers should pass the same rng instance used
 * for preset/ghost randomization, not a fresh Math.random().
 */
export function pickCaption(
  mode: "off" | "random" | "fixed",
  fixedCaption: string,
  rng: () => number,
): string | undefined {
  if (mode === "off") return undefined;
  if (mode === "fixed") return fixedCaption;
  const idx = Math.floor(rng() * CAPTIONS.length);
  return CAPTIONS[idx];
}

/** Overlay asset keys; actual files live in public/overlays and are added incrementally. */
export type OverlayKey =
  | "bloodSplatter"
  | "cobwebs"
  | "spiders"
  | "bats"
  | "skulls"
  | "eyeballs"
  | "horns"
  | "vampireFangs"
  | "graveyard"
  | "moon"
  | "candles"
  | "fog"
  | "crackedGlass"
  | "scratches"
  | "filmGrain"
  | "vignette";
