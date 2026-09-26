import { defaultSettings, type BoothSettings } from "../app/Settings";
import { idbGet, idbSet, STORES } from "./IndexedDB";

const SETTINGS_KEY = "operator-settings";

export async function loadSettings(): Promise<BoothSettings> {
  try {
    const stored = await idbGet<BoothSettings>(STORES.settings, SETTINGS_KEY);
    return stored ? { ...defaultSettings, ...stored } : defaultSettings;
  } catch {
    // IndexedDB unavailable or blocked: fall back to defaults rather than
    // failing booth startup (CLAUDE.md section 49).
    return defaultSettings;
  }
}

export async function saveSettings(settings: BoothSettings): Promise<void> {
  try {
    await idbSet(STORES.settings, SETTINGS_KEY, settings);
  } catch {
    // Best-effort persistence; the booth still runs with in-memory settings.
  }
}
