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
