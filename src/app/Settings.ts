// Operator-configurable settings (CLAUDE.md section 47).
// Persisted via storage/SettingsStore.ts.

import { CAPTIONS } from "../effects/HalloweenEffects";
import type { FilterKey } from "../effects/HorrorFilters";
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
  /** "Poster Mode" (beta): grades the photo like a horror movie poster --
   * pure color grade + vignette gradient, no text of its own (that was
   * dropped; the caption toggle below is the only source of text on a
   * photo now, and it applies independently of whether Poster Mode is on).
   * See effects/PosterEffect.ts. Turning this on makes the guest-facing
   * Poster toggle available at all (same on/off-availability pattern as
   * ownerCameoMode below); it no longer forces poster grading onto every
   * photo unconditionally -- the guest can flip it off per-photo to see
   * the plain candid instead (via the other toggles). Defaults to on for
   * a fresh photo when enabled here, matching the previous always-on
   * behavior out of the box. */
  posterMode: boolean;
  /** Horror Filters (whole-photo color grades -- VHS/noir/blood-moon/vintage,
   * see effects/HorrorFilters.ts) the operator wants available for this
   * event. Opt-in: empty by default, and when non-empty the guest gets a
   * Filter toggle on the result screen. Which filter a given photo uses is
   * picked once per photo from this list via the seeded rng
   * (CapturePipeline's recipe, same pattern as posterTint), not
   * guest-selectable -- keeps the toggle a simple on/off like the others
   * rather than adding a picker. Stacks with Poster Mode (filter grade
   * applied first, then poster grade on top) rather than being mutually
   * exclusive with it. */
  filters: FilterKey[];

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
  posterMode: false,
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
