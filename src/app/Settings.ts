// Operator-configurable settings (CLAUDE.md section 47).
// Persisted via storage/SettingsStore.ts.

import { CAPTIONS } from "../effects/HalloweenEffects";
import type { StyleKey } from "../effects/Styles";
import type { PrintLayout } from "../printing/PrintLayout";

export type { PrintLayout } from "../printing/PrintLayout";

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
  /** The booth is mounted portrait, and iOS Safari can still hand back a
   * landscape-shaped raw capture despite that (see
   * camera/CaptureService.ts's maybeRotateToPortrait) -- when that happens
   * it's auto-rotated 90deg to match. This flips which direction that
   * correction turns. There's no reliable way to predict the front
   * camera's sensor-mounting offset from code, so this exists purely for
   * an operator to flip on-site (Operator Panel) if a test photo comes
   * back upside-down or sideways the wrong way after the auto-rotation. */
  rotateCaptureCounterClockwise: boolean;

  // Flow
  countdownSeconds: number;
  autoStart: boolean;
  idleTimeoutSeconds: number;

  // Effects
  caricatureStrength: number; // 0..1, scales all *Scale params toward 1.0
  ghostStrength: number; // 0..1
  preset: CaricaturePreset;
  captionMode: CaptionMode;
  /** Caption text used when captionMode is "fixed". */
  fixedCaption: string;
  /** The booth owner's own ghostly cameo(s), composited into every photo
   * when enabled (public/cameo/*.png, given a translucent/blurred
   * treatment). When more than one cameo image is configured
   * (App.tsx's CAMEO_ASSET_FILENAMES), a different one is picked per photo.
   * Off by default -- an operator decision for each event, not a
   * guest-facing default. A real per-guest ghost generated live from each
   * guest's own segmented photo was tried and reverted (didn't look great,
   * wasn't reliable enough); this fixed-asset approach replaced it. */
  ownerCameoMode: OwnerCameoMode;
  /** "Filters" -- a single merged list of whole-photo grade presets the
   * operator wants available for this event, combining what used to be
   * two separate features: Horror Filters (VHS/noir/blood-moon/vintage,
   * effects/HorrorFilters.ts) and Poster Mode's tint+vignette grades
   * (effects/PosterEffect.ts). See effects/Styles.ts for the merged type.
   * Opt-in: empty by default, and when non-empty the guest gets one
   * Filters picker on the result screen listing whichever of these the
   * operator checked here -- picking one grades the whole photo; there's
   * no stacking two grades at once anymore now that this is one feature
   * instead of two. */
  filters: StyleKey[];

  // Printing
  printerId?: string;
  /** Which PhotoPrinter adapter handles a Print tap -- see PrinterAdapterKind. */
  printerAdapter: PrinterAdapterKind;
  autoPrint: boolean;
  copies: number;
  /** Physical shape to crop the photo to right before printing (see
   * printing/PrintLayout.ts) -- doesn't affect what the guest sees on the
   * result screen, only the copy actually handed to the printer adapter.
   * "2x3" and "4x6" are the same aspect ratio (2:3), just different
   * physical sizes -- "2x3" is the default since that's what the connected
   * Kodak Mini 2 Retro actually outputs. */
  printLayout: PrintLayout;

  // Misc
  soundVolume: number; // 0..1
  photoRetentionMinutes: number;
  attractModeEnabled: boolean;
  debugMode: boolean;
}

export const defaultSettings: BoothSettings = {
  rotateCaptureCounterClockwise: false,
  countdownSeconds: 3,
  autoStart: true,
  // Was 45s; bumped up now that the result screen's picker is a carousel a
  // guest browses in place (ghost/filter/poster) rather than a
  // quick on/off tap -- see App.tsx's activityTick for the actual fix
  // (browsing the carousel now re-arms this timer), this just gives a more
  // comfortable floor for "photo's up, nobody's touched anything yet."
  idleTimeoutSeconds: 90,

  caricatureStrength: 1.0,
  ghostStrength: 0.5,
  preset: "Random",
  captionMode: "random",
  fixedCaption: CAPTIONS[0],
  ownerCameoMode: "off",
  filters: [],

  printerAdapter: "shareSheet",
  autoPrint: false,
  copies: 1,
  printLayout: "2x3",

  soundVolume: 0.7,
  photoRetentionMinutes: 30,
  attractModeEnabled: true,
  debugMode: false,
};
