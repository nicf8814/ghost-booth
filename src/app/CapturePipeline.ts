// The non-React "business logic" behind a single photo: turning a freshly
// captured master bitmap into caricatured/ghost variants plus a per-photo
// "recipe" (CLAUDE.md section 27's vision -> caricature -> ghost stages,
// plus the caption/overlay-seed choices section 20 says to make once per
// photo from the seeded rng), and turning the guest's current selection of
// which specific frame/overlays/poster-tint/filter to apply into the one
// composed bitmap that actually gets shown/printed (section 28's
// composition stage).
//
// Frame/Overlays/Poster/Filter are guest-driven pickers, not just on/off
// toggles: the guest chooses the specific frame, which individual overlays,
// which poster tint, and which filter they want, from whatever the operator
// has made available for the event (CapturePipelineSettings below). Only
// the caption and "My Cameo" ghost stay as simple availability-gated
// booleans -- picking a specific caption line or a specific cameo image
// isn't something the guest controls.
//
// Pulled out of App.tsx, which used to have all of this inline in
// handleCountdownComplete/applyPhotoSelection -- CLAUDE.md section 55 says
// not to put business logic in React components, and having it tangled
// into a component also meant it could only be exercised by driving the
// whole app through a browser (see PROJECT_LOG.md's "Verification
// approach" section -- that's how every past round of work on this
// pipeline got checked). The two functions here take plain data and
// interfaces, so they can be unit tested directly against mocked engines,
// no DOM/camera/React/WebGL required. App.tsx now only holds the
// refs/state/dispatch glue around calling them.

import type { FaceModel } from "../vision/VisionTypes";
import type { FaceDetector } from "../vision/FaceDetector";
import type { CaricatureEngine } from "../effects/EffectEngine";
import type { OwnerCameoEngine } from "../effects/OwnerCameoEngine";
import { CAMEO_KEYS, type CameoKey } from "../effects/Cameos";
import { resolvePreset, scaleTowardNeutral, varyConfigForFace } from "../effects/Presets";
import { pickCaption, type OverlayKey } from "../effects/HalloweenEffects";
import { FRAME_KEYS, type FrameKey } from "../effects/Frames";
import { applyPosterEffect, POSTER_TINTS, type PosterTint } from "../effects/PosterEffect";
import { applyHorrorFilter, type FilterKey } from "../effects/HorrorFilters";
import type { CompositionEngine } from "../rendering/CompositionEngine";
import { createSeed, seededRandom } from "../utils/random";
import type { CaptionMode, CaricaturePreset, OwnerCameoMode } from "./Settings";

/** The subset of a photo's operator settings this pipeline's analysis stage needs. */
export interface CapturePipelineSettings {
  preset: CaricaturePreset;
  caricatureStrength: number;
  ownerCameoMode: OwnerCameoMode;
  captionMode: CaptionMode;
  fixedCaption: string;
  frame: FrameKey;
  overlays: OverlayKey[];
  posterMode: boolean;
  filters: FilterKey[];
}

/** Decided once per photo from the seeded rng (CLAUDE.md section 20) and reused across every later recompose, so re-picking frame/overlays/poster/filter never reshuffles which caption or overlay layout the photo uses. */
export interface PhotoRecipe {
  caption?: string;
  overlaySeed: string;
}

/**
 * What the guest can choose from for this photo, given what the operator
 * configured for the event. Frame options are always the full fixed set
 * (frames are free procedural decoration, not operator-curated content like
 * overlays/filters are); overlay/filter options are whichever subset the
 * operator enabled; poster tints are the full fixed set when Poster Mode is
 * on at all, empty otherwise.
 */
export interface PhotoOptions {
  /** Which specific cameos the guest can choose from (CapturePipeline.ts's ghost picker) -- empty when the operator has the feature off entirely. */
  ghostOptions: CameoKey[];
  caption: boolean;
  frameOptions: FrameKey[];
  overlayOptions: OverlayKey[];
  posterTints: PosterTint[];
  filterOptions: FilterKey[];
}

/** The guest's starting selection for a fresh photo -- frame/overlays default to the operator's configured defaults (on), poster/filter/ghost default off so the guest opts into those more dramatic whole-photo treatments deliberately. */
export interface DefaultSelection {
  frameKey: FrameKey;
  overlayKeys: OverlayKey[];
  posterTint: PosterTint | null;
  filterKey: FilterKey | null;
  ghostKey: CameoKey | null;
}

export interface AnalyzedPhoto {
  faces: FaceModel[];
  original: ImageBitmap;
  caricatured: ImageBitmap;
  recipe: PhotoRecipe;
  options: PhotoOptions;
  defaults: DefaultSelection;
}

export interface AnalyzePhotoDeps {
  faceDetector: Pick<FaceDetector, "detect">;
  caricatureEngine: Pick<CaricatureEngine, "warp">;
}

/**
 * Runs face detection, per-face caricature warping, "My Cameo" ghost
 * compositing, and picks this photo's caption and overlay-placement seed --
 * everything that only needs to happen once, right after capture, regardless
 * of which frame/overlays/poster/filter the guest ends up picking afterward.
 * Never throws on a detection/warp/cameo failure in a way that would lose
 * the photo (CLAUDE.md section 49): a face detector that returns no faces or
 * a cameo engine with nothing loaded both degrade to sensible fallbacks
 * already, at the engine level, not here.
 */
export async function analyzeAndWarpPhoto(
  master: ImageBitmap,
  deps: AnalyzePhotoDeps,
  settings: CapturePipelineSettings,
): Promise<AnalyzedPhoto> {
  // detect() takes ownership of the bitmap it's given (transferred into
  // the worker in the real WorkerFaceDetector), so hand it a clone and
  // keep `master` intact for the result photo, printing, and the
  // non-caricatured base bitmap below.
  const detectionCopy = await createImageBitmap(master);
  const faces = await deps.faceDetector.detect(detectionCopy);

  // A fresh per-photo seed drives every choice below (preset selection,
  // deformation strength, cameo pick, caption) so a given photo's result
  // can be reproduced for debugging by logging the seed (CLAUDE.md
  // section 20).
  const seed = createSeed();
  const rng = seededRandom(seed);
  const baseConfig = resolvePreset(settings.preset, rng);

  // Each detected face is warped in turn against the same working bitmap
  // -- faces don't overlap in a normal group photo, so sequential per-face
  // warps on one bitmap are equivalent to warping them independently.
  // Sorted left-to-right first so "Person 1/2/3..." (and their signature
  // feature below) is stable for a given photo rather than depending on
  // whatever order the face detector happened to return -- CLAUDE.md
  // section 10's 1-6 person target says every face gets its own effect
  // parameters, not one config stamped onto everyone in the group.
  const orderedFaces = [...faces].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
  let working: ImageBitmap = master;
  for (let i = 0; i < orderedFaces.length; i++) {
    const face = orderedFaces[i];
    const config = scaleTowardNeutral(varyConfigForFace(baseConfig, i, rng), settings.caricatureStrength);
    const warped = await deps.caricatureEngine.warp(working, face, config);
    if (warped !== working) {
      working = warped;
    }
  }

  // Ghost cameos are no longer baked in here -- the guest picks a specific
  // cameo from a menu (like Frame/Overlays/Poster/Filter) and
  // composeSelectedBitmap applies it on demand, so it can be swapped
  // without re-running detection/warp. ghostAvailable just gates whether
  // that menu has anything in it at all.
  const ghostAvailable = settings.ownerCameoMode !== "off";

  const caption = pickCaption(settings.captionMode, settings.fixedCaption, rng);
  const recipe: PhotoRecipe = {
    caption,
    overlaySeed: createSeed(),
  };

  return {
    faces,
    original: master,
    caricatured: working,
    recipe,
    options: {
      ghostOptions: ghostAvailable ? CAMEO_KEYS : [],
      caption: settings.captionMode !== "off",
      frameOptions: FRAME_KEYS,
      overlayOptions: settings.overlays,
      posterTints: settings.posterMode ? POSTER_TINTS : [],
      filterOptions: settings.filters,
    },
    defaults: {
      frameKey: settings.frame,
      overlayKeys: settings.overlays,
      posterTint: null,
      filterKey: null,
      ghostKey: null,
    },
  };
}

/** The two bitmaps `analyzeAndWarpPhoto` produced for one photo -- everything `composeSelectedBitmap` picks between. Ghost cameos are no longer baked in as separate variants; the chosen cameo is composited on demand in composeSelectedBitmap instead. */
export interface PhotoBaseBitmaps {
  original: ImageBitmap;
  caricatured: ImageBitmap;
}

/** The guest's current picks for the photo currently showing. */
export interface PhotoSelection {
  goofy: boolean;
  /** Which specific cameo (if any) is composited in -- null means no ghost. */
  ghostKey: CameoKey | null;
  /** 0..1 - how visible the ghost cameo is, straight from the operator's
   * "Ghost Strength" setting (CLAUDE.md section 47) so it can be adjusted
   * live on the current photo, not baked in at capture time. Ignored when
   * ghostKey is null. */
  ghostOpacity: number;
  captioned: boolean;
  frameKey: FrameKey;
  overlayKeys: OverlayKey[];
  posterTint: PosterTint | null;
  filterKey: FilterKey | null;
}

export interface ComposeSelectionDeps {
  compositionEngine: Pick<CompositionEngine, "compose">;
  ownerCameoEngine: Pick<OwnerCameoEngine, "composite">;
}

/**
 * Composes the guest's current picks into the one bitmap that should be
 * shown/printed. Pipeline order: the chosen ghost cameo (if any) is
 * composited onto the goofy/plain source first, then the chosen filter (if
 * any) grades that, then the chosen poster tint (if any) grades on top of
 * that -- Filter and Poster can both be live on the same photo, stacking as
 * two color grades rather than being mutually exclusive. Frame stays
 * mutually exclusive with Poster (a frame border on top of Poster's own
 * vignette still clutters it the way the original design avoided), so a
 * poster tint forces the frame off regardless of what the guest picked
 * there; overlays and the caption are unaffected by Poster and always draw
 * on top via the regular composition. Returns null only when the base
 * bitmaps aren't ready yet (no photo captured), which callers should treat
 * as "nothing to display", not an error.
 */
export async function composeSelectedBitmap(
  base: PhotoBaseBitmaps,
  recipe: PhotoRecipe,
  selection: PhotoSelection,
  deps: ComposeSelectionDeps,
): Promise<ImageBitmap | null> {
  const source = selection.goofy ? base.caricatured : base.original;
  if (!source) return null;

  const ghosted = await deps.ownerCameoEngine.composite(source, selection.ghostKey, {
    opacity: selection.ghostOpacity,
  });

  const postered = selection.posterTint !== null;

  const filteredSource = selection.filterKey
    ? await applyHorrorFilter(ghosted, { key: selection.filterKey })
    : ghosted;

  const gradedSource = postered
    ? await applyPosterEffect(filteredSource, { tint: selection.posterTint as PosterTint })
    : filteredSource;

  return deps.compositionEngine.compose({
    foreground: gradedSource,
    caption: selection.captioned ? recipe.caption : undefined,
    frame: postered ? "none" : selection.frameKey,
    overlays: selection.overlayKeys,
    overlaySeed: recipe.overlaySeed,
  });
}
