// Operator-configurable settings (CLAUDE.md section 47).
// Persisted via storage/SettingsStore.ts.

export type CaricaturePreset =
  | "Goblin"
  | "Demon"
  | "HotMess"
  | "Witch"
  | "Vampire"
  | "PumpkinHead"
  | "CartoonVillain"
  | "DrunkUncle"
  | "EvilPromQueen"
  | "Random";

export type CaptionMode = "off" | "random" | "fixed";
export type PrintLayout = "4x6" | "square" | "2x6strip";

export interface BoothSettings {
  // Camera
  cameraDeviceId?: string;

  // Flow
  countdownSeconds: number;
  autoStart: boolean;
  idleTimeoutSeconds: number;

  // Effects
  caricatureStrength: number; // 0..1, scales all *Scale params toward 1.0
  ghostStrength: number; // 0..1
  preset: CaricaturePreset;
  frame: string; // key into public/frames
  captionMode: CaptionMode;

  // Printing
  printerId?: string;
  autoPrint: boolean;
  copies: number;
  printLayout: PrintLayout;

  // Misc
  soundVolume: number; // 0..1
  photoRetentionMinutes: number;
  attractModeEnabled: boolean;
  debugMode: boolean;
}

export const defaultSettings: BoothSettings = {
  countdownSeconds: 3,
  autoStart: true,
  idleTimeoutSeconds: 45,

  caricatureStrength: 0.7,
  ghostStrength: 0.5,
  preset: "Random",
  frame: "classic",
  captionMode: "random",

  autoPrint: false,
  copies: 1,
  printLayout: "4x6",

  soundVolume: 0.7,
  photoRetentionMinutes: 30,
  attractModeEnabled: true,
  debugMode: false,
};
