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
import { resolvePreset, scaleTowardNeutral } from "../effects/Presets";
import { pickCaption, type OverlayKey } from "../effects/HalloweenEffects";
import { FRAME_KEYS, type FrameKey } from "../effects/Frames";
import { applyPosterEffect, POSTER_TINTS, type PosterTint } from "../effects/PosterEffect";
import { applyHorrorFilter, type FilterKey } from "../effects/HorrorFilters";
import type { CompositionEngine } from "../rendering/CompositionEngine";
import { drawCaptionOnBitmap } from "../rendering/CompositionEngine";
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
  ghost: boolean;
  caption: boolean;
  frameOptions: FrameKey[];
  overlayOptions: OverlayKey[];
  posterTints: PosterTint[];
  filterOptions: FilterKey[];
}

/** The guest's starting selection for a fresh photo -- frame/overlays default to the operator's configured defaults (on), poster/filter default off so the guest opts into those more dramatic whole-photo treatments deliberately. */
export interface DefaultSelection {
  frameKey: FrameKey;
  overlayKeys: OverlayKey[];
  posterTint: PosterTint | null;
  filterKey: FilterKey | null;
}

export interface AnalyzedPhoto {
  faces: FaceModel[];
  original: ImageBitmap;
  caricatured: ImageBitmap;
  originalGhost: ImageBitmap | null;
  caricaturedGhost: ImageBitmap | null;
  recipe: PhotoRecipe;
  options: PhotoOptions;
  defaults: DefaultSelection;
}

export interface AnalyzePhotoDeps {
  faceDetector: Pick<FaceDetector, "detect">;
  caricatureEngine: Pick<CaricatureEngine, "warp">;
  ownerCameoEngine: Pick<OwnerCameoEngine, "composite">;
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
  const config = scaleTowardNeutral(resolvePreset(settings.preset, rng), settings.caricatureStrength);

  // Each detected face is warped in turn against the same working bitmap
  // -- faces don't overlap in a normal group photo, so sequential per-face
  // warps on one bitmap are equivalent to warping them independently.
  let working: ImageBitmap = master;
  for (const face of faces) {
    const warped = await deps.caricatureEngine.warp(working, face, config);
    if (warped !== working) {
      working = warped;
    }
  }

  // "My Cameo" ghost layer, only computed when the operator has it
  // enabled -- composite() doesn't mutate its input, so `master`/`working`
  // stay valid for the non-ghost variants regardless. When there are
  // several cameo images, one is picked per photo and reused for both
  // variants below so the candid and goofy versions of one photo show the
  // same "ghost" rather than two different ones.
  const ghostAvailable = settings.ownerCameoMode !== "off";
  let originalGhost: ImageBitmap | null = null;
  let caricaturedGhost: ImageBitmap | null = null;
  if (ghostAvailable) {
    const cameoPick = rng();
    const pickRng = () => cameoPick;
    originalGhost = await deps.ownerCameoEngine.composite(master, {}, pickRng);
    caricaturedGhost = await deps.ownerCameoEngine.composite(working, {}, pickRng);
  }

  const caption = pickCaption(settings.captionMode, settings.fixedCaption, rng);
  const recipe: PhotoRecipe = {
    caption,
    overlaySeed: createSeed(),
  };

  return {
    faces,
    original: master,
    caricatured: working,
    originalGhost,
    caricaturedGhost,
    recipe,
    options: {
      ghost: ghostAvailable,
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
    },
  };
}

/** The four bitmaps `analyzeAndWarpPhoto` produced for one photo -- everything `composeSelectedBitmap` picks between. */
export interface PhotoBaseBitmaps {
  original: ImageBitmap;
  caricatured: ImageBitmap;
  originalGhost: ImageBitmap | null;
  caricaturedGhost: ImageBitmap | null;
}

/** The guest's current picks for the photo currently showing. */
export interface PhotoSelection {
  goofy: boolean;
  ghost: boolean;
  captioned: boolean;
  frameKey: FrameKey;
  overlayKeys: OverlayKey[];
  posterTint: PosterTint | null;
  filterKey: FilterKey | null;
}

export interface ComposeSelectionDeps {
  compositionEngine: Pick<CompositionEngine, "compose">;
}

/**
 * Composes the guest's current picks into the one bitmap that should be
 * shown/printed. A non-null posterTint replaces the regular
 * frame+overlay+filter composition entirely (its own vignette would clash
 * with a frame border, and stacking a color grade on top of a filter's own
 * color grade would look muddy) -- otherwise the chosen filter (if any)
 * grades the source first, then frame/overlays (if any) are drawn on top of
 * that via the regular composition. The caption toggle is independent of
 * that choice and, when on, is drawn on top of either path -- compose()'s
 * own caption layer for the regular treatment, or drawCaptionOnBitmap for
 * the poster-graded one, since Poster Mode itself is pure color
 * grade/gradient with no text of its own. Returns null only when the base
 * bitmaps aren't ready yet (no photo captured), which callers should treat
 * as "nothing to display", not an error.
 */
export async function composeSelectedBitmap(
  base: PhotoBaseBitmaps,
  recipe: PhotoRecipe,
  selection: PhotoSelection,
  deps: ComposeSelectionDeps,
): Promise<ImageBitmap | null> {
  const ghostVariant = selection.goofy ? base.caricaturedGhost : base.originalGhost;
  const plainVariant = selection.goofy ? base.caricatured : base.original;
  // Falls back to the non-ghost variant if ghost was requested but isn't
  // available for this photo (cameo disabled), so a stray ghost=true can
  // never resolve to a missing bitmap.
  const source = (selection.ghost && ghostVariant) || plainVariant;
  if (!source) return null;

  const postered = selection.posterTint !== null;

  const filteredSource =
    selection.filterKey && !postered
      ? await applyHorrorFilter(source, { key: selection.filterKey })
      : source;

  let bitmap = postered
    ? await applyPosterEffect(source, { tint: selection.posterTint as PosterTint })
    : await deps.compositionEngine.compose({
        foreground: filteredSource,
        caption: selection.captioned ? recipe.caption : undefined,
        frame: selection.frameKey,
        overlays: selection.overlayKeys,
        overlaySeed: recipe.overlaySeed,
      });

  if (postered && selection.captioned && recipe.caption) {
    bitmap = await drawCaptionOnBitmap(bitmap, recipe.caption);
  }

  return bitmap;
}
