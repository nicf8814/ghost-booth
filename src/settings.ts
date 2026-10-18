import type { GhostMode } from "./ghost";
import type { Rotation } from "./layout";

export interface Settings {
  title: string;
  countdown: number;
  rotation: Rotation;
  ghost: GhostMode;
}

const KEY = "ghost-booth-settings-v4";

export const DEFAULTS: Settings = {
  title: "Heisterkamp Halloween 2026",
  countdown: 3,
  rotation: "none",
  ghost: "toggle",
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
