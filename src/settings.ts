import type { FrameId } from "./frames";
import type { GhostMode } from "./ghost";
import type { Rotation } from "./layout";

export interface Settings {
  title: string;
  countdown: number;
  rotation: Rotation;
  ghost: GhostMode;
  /** Show the "Save HD" button on the review screen. */
  hd: "show" | "hide";
  /** Border style around the photo. */
  frame: FrameId;
  /** Victorian borders: fade the photo into the paper, or keep a hard edge. */
  edges: "soft" | "sharp";
}

const KEY = "ghost-booth-settings-v4";

export const DEFAULTS: Settings = {
  title: "Heisterkamp Halloween 2026",
  countdown: 3,
  rotation: "none",
  ghost: "toggle",
  hd: "show",
  frame: "classic",
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
