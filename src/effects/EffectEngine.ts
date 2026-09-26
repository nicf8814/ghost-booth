import type { FaceModel } from "../vision/VisionTypes";
import type { CaricatureConfiguration } from "./Presets";

/** Per-face caricature deformation. Phase 4/5. */
export interface CaricatureEngine {
  warp(image: ImageBitmap, face: FaceModel, config: CaricatureConfiguration): Promise<ImageBitmap>;
}

/** Ghost/apparition generation from a segmented person. Phase 7. */
export interface GhostEngine {
  generate(image: ImageBitmap, echoCount: number, seed: string): Promise<ImageBitmap[]>;
}

/**
 * Coordinates the full effect pipeline stage
 * (vision -> caricature -> ghost -> halloween overlays), independent of how
 * each stage is implemented (Canvas2D/WebGL2/WebGPU). CLAUDE.md section 27.
 */
export interface EffectEngine {
  caricature: CaricatureEngine;
  ghost: GhostEngine;
}

/** Pass-through stub: returns the source image unmodified. Used until Phase 4-7 land. */
export class NullCaricatureEngine implements CaricatureEngine {
  async warp(image: ImageBitmap, _face: FaceModel, _config: CaricatureConfiguration): Promise<ImageBitmap> {
    return image;
  }
}

export class NullGhostEngine implements GhostEngine {
  async generate(_image: ImageBitmap, _echoCount: number, _seed: string): Promise<ImageBitmap[]> {
    return [];
  }
}
