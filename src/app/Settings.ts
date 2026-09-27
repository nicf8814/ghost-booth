// Operator-configurable settings (CLAUDE.md section 47).
// Persisted via storage/SettingsStore.ts.

import type { FrameKey } from "../effects/Frames";
import { CAPTIONS } from "../effects/HalloweenEffects";

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
// Which PhotoPrinter adapter (src/printing/) actually handles Print taps.
// CLAUDE.md sections 37-39 require this to be operator-configurable rather
// than assumed, since the exact printer/browser combination decides what's
// even possible (no Web Bluetooth in Safari, no SDK for most consumer
// photo printers). The confirmed hardware for this booth is a Kodak Mini 2
// Retro (Bluetooth-only, no AirPrint, no SDK), so the default is
// "shareSheet" -- the operator can still flip to "mock" for testing without
// the printer nearby, or to "browserPrint"/"airPrint" if that ever changes.
export type PrinterAdapterKind = "mock" | "shareSheet" | "browserPrint" | "airPrint";
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
  frame: FrameKey;
  captionMode: CaptionMode;
  /** Caption text used when captionMode is "fixed". */
  fixedCaption: string;
  /** The booth owner's own ghostly cameo, composited into every photo when
   * enabled (public/cameo/nic-cutout.png, given a translucent/blurred
   * treatment matching the other ghosts). Off by default -- an operator
   * decision for each event, not a guest-facing default. */
  ownerCameoMode: OwnerCameoMode;
  /** "Poster Mode" (beta): grades the photo like a horror movie poster
   * (color grade, vignette, title/tagline typography) instead of the
   * regular caption+frame treatment. See effects/PosterEffect.ts. An
   * operator-wide style choice for the event, not a per-photo guest
   * toggle, to avoid multiplying the cached bitmap combinations. */
  posterMode: boolean;

  // Printing
  printerId?: string;
  /** Which PhotoPrinter adapter handles a Print tap -- see PrinterAdapterKind. */
  printerAdapter: PrinterAdapterKind;
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
  fixedCaption: CAPTIONS[0],
  ownerCameoMode: "off",
  posterMode: false,

  printerAdapter: "shareSheet",
  autoPrint: false,
  copies: 1,
  printLayout: "4x6",

  soundVolume: 0.7,
  photoRetentionMinutes: 30,
  attractModeEnabled: true,
  debugMode: false,
};
