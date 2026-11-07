import type { GhostMode } from "./ghost";
import type { Rotation } from "./layout";

export interface Settings {
  title: string;
  countdown: number;
  rotation: Rotation;
  ghost: GhostMode;
  /** Show the "AirDrop to your phone" button (shares the 4K copy) on the review screen. */
  hd: "show" | "hide";
  /** Show the Print button. Hidden when the printer paper runs out; guests AirDrop instead. */
  print: "show" | "hide";
  /** Fade the photo into the border paper, or keep a hard edge. */
  edges: "soft" | "sharp";
}

const KEY = "ghost-booth-settings-v4";

export const DEFAULTS: Settings = {
  title: "Heisterkamp Halloween 2026",
  countdown: 3,
  rotation: "none",
  ghost: "toggle",
  hd: "show",
  print: "show",
  edges: "soft",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // storage unavailable, fall back to defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore, settings just won't persist
  }
}
