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
// "random" (a per-photo chance of appearing) is a planned follow-up to the
// initial always-on/off toggle; the type is already a union so adding it
// later won't need a settings migration.
export type OwnerCameoMode = "off" | "always";

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
  /** The booth owner's own ghostly cameo, composited into every photo when
   * enabled (public/cameo/nic-cutout.png, given a translucent/blurred
   * treatment matching the other ghosts). Off by default -- an operator
   * decision for each event, not a guest-facing default. */
  ownerCameoMode: OwnerCameoMode;

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

  caricatureStrength: 1.0,
  ghostStrength: 0.5,
  preset: "Random",
  frame: "classic",
  captionMode: "random",
  ownerCameoMode: "off",

  autoPrint: false,
  copies: 1,
  printLayout: "4x6",

  soundVolume: 0.7,
  photoRetentionMinutes: 30,
  attractModeEnabled: true,
  debugMode: false,
};
