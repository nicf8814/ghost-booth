import type { Rotation } from "./layout";

export interface Settings {
  title: string;
  subtitle: string;
  countdown: number;
  rotation: Rotation;
}

const KEY = "ghost-booth-settings-v3";

export const DEFAULTS: Settings = {
  title: "Human Photobooth",
  subtitle: `Halloween ${new Date().getFullYear()}`,
  countdown: 3,
  rotation: "none",
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
