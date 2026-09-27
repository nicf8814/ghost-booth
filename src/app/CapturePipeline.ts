// The non-React "business logic" behind a single photo: turning a freshly
// captured master bitmap into caricatured/ghost variants plus a per-photo
// "recipe" (CLAUDE.md section 27's vision -> caricature -> ghost stages,
// plus the decisions -- caption/frame/overlays/poster tint -- section 20
// says to make once per photo from the seeded rng), and turning the
// guest's current toggle selection into the one composed bitmap that
// actually gets shown/printed (section 28's composition stage).
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
import type { FrameKey } from "../effects/Frames";
import { applyPosterEffect, POSTER_TINTS, type PosterTint } from "../effects/PosterEffect";
import { applyHorrorFilter, type FilterKey } from "../effects/HorrorFilters";
import type { CompositionEngine } from "../rendering/CompositionEngine";
import { drawCaptionOnBitmap } from "../rendering/CompositionEngine";
import { createSeed, pick, seededRandom } from "../utils/random";
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

/** Decided once per photo from the seeded rng (CLAUDE.md section 20) and reused across every later toggle recompose, so flipping Frame/Overlays/Poster on and off never reshuffles which caption/overlay-layout/tint the photo uses. */
export interface PhotoRecipe {
  caption?: string;
  frame: FrameKey;
  overlays: OverlayKey[];
  overlaySeed: string;
  posterTint: PosterTint;
  filterKey: FilterKey;
}

/** Which of the recipe-dependent guest toggles should even be shown/on by default for a fresh photo, given what the operator has configured. */
export interface ToggleAvailability {
  ghost: boolean;
  frame: boolean;
  overlays: boolean;
  poster: boolean;
  caption: boolean;
  filter: boolean;
}

export interface AnalyzedPhoto {
  faces: FaceModel[];
  original: ImageBitmap;
  caricatured: ImageBitmap;
  originalGhost: ImageBitmap | null;
  caricaturedGhost: ImageBitmap | null;
  recipe: PhotoRecipe;
  availability: ToggleAvailability;
}

export interface AnalyzePhotoDeps {
  faceDetector: Pick<FaceDetector, "detect">;
  caricatureEngine: Pick<CaricatureEngine, "warp">;
  ownerCameoEngine: Pick<OwnerCameoEngine, "composite">;
}

/**
 * Runs face detection, per-face caricature warping, "My Cameo" ghost
 * compositing, and picks this photo's caption/frame/overlay-seed/poster
 * tint -- everything that only needs to happen once, right after capture,
 * regardless of which toggles the guest ends up flipping afterward. Never
 * throws on a detection/warp/cameo failure in a way that would lose the
 * photo (CLAUDE.md section 49): a face detector that returns no faces or a
 * cameo engine with nothing loaded both degrade to sensible fallbacks
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
  // deformation strength, cameo pick, caption, poster tint) so a given
  // photo's result can be reproduced for debugging by logging the seed
  // (CLAUDE.md section 20).
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
    frame: settings.frame,
    overlays: settings.overlays,
    overlaySeed: createSeed(),
    posterTint: pick(POSTER_TINTS, rng),
    // Picked once per photo, same as posterTint above, so toggling the
    // Filter button on/off doesn't reshuffle which look this photo got.
    // Falls back to "vhs" when the operator hasn't enabled any filters --
    // unused in that case since availability.filter is false below.
    filterKey: settings.filters.length > 0 ? pick(settings.filters, rng) : "vhs",
  };

  return {
    faces,
    original: master,
    caricatured: working,
    originalGhost,
    caricaturedGhost,
    recipe,
    availability: {
      ghost: ghostAvailable,
      frame: settings.frame !== "none",
      overlays: settings.overlays.length > 0,
      poster: settings.posterMode,
      caption: settings.captionMode !== "off",
      filter: settings.filters.length > 0,
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

/** The guest's current combination of result-screen toggles. */
export interface PhotoSelection {
  goofy: boolean;
  ghost: boolean;
  framed: boolean;
  overlaid: boolean;
  postered: boolean;
  captioned: boolean;
  filtered: boolean;
}

export interface ComposeSelectionDeps {
  compositionEngine: Pick<CompositionEngine, "compose">;
}

/**
 * Composes the currently-selected combination of guest toggles into the
 * one bitmap that should be shown/printed. Poster Mode, when on, replaces
 * the regular frame+overlay composition entirely (its own vignette would
 * clash with a frame border); otherwise frame/overlays are drawn (or not)
 * on top of the base bitmap. The caption toggle is independent of that
 * choice and, when on, is drawn on top of either path -- compose()'s own
 * caption layer for the regular treatment, or drawCaptionOnBitmap for the
 * poster-graded one, since Poster Mode itself is pure color grade/gradient
 * with no text of its own. The Filter toggle, when on, grades the source
 * bitmap (effects/HorrorFilters.ts) before it reaches the regular
 * frame/overlay/caption composition -- skipped whenever Poster Mode is also
 * on, since Poster is already a full grade of its own and stacking two
 * would look muddy (the same mutual-exclusivity App.tsx already applies to
 * Frame/Overlays while Poster is live). Returns null only when the base
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

  const filteredSource =
    selection.filtered && !selection.postered
      ? await applyHorrorFilter(source, { key: recipe.filterKey })
      : source;

  let bitmap = selection.postered
    ? await applyPosterEffect(source, { tint: recipe.posterTint })
    : await deps.compositionEngine.compose({
        foreground: filteredSource,
        caption: selection.captioned ? recipe.caption : undefined,
        frame: selection.framed ? recipe.frame : "none",
        overlays: selection.overlaid ? recipe.overlays : [],
        overlaySeed: recipe.overlaySeed,
      });

  if (selection.postered && selection.captioned && recipe.caption) {
    bitmap = await drawCaptionOnBitmap(bitmap, recipe.caption);
  }

  return bitmap;
}
