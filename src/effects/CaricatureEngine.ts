// Real CaricatureEngine implementation (CLAUDE.md Phase 4, section 59).
// Builds per-feature control points from a detected face's landmarks and
// renders the warp via WebGL2, falling back to Canvas2D if WebGL2 is
// unavailable or a render call throws (section 11's "must have a Canvas2D
// fallback for environments where GPU features fail", section 49's
// "never crash - degrade gracefully").
//
// All of Phase 4's per-face deformations are wired up: nose, eyes, jaw,
// and ears first (the spec's incremental build order), then mouth,
// forehead, cheeks, and eyebrows once those had their own
// buildXControlPoint(s) in MeshWarp.ts. Shoulder/body ("CLAUDE.md section
// 14's body caricature) are landmark-anchored approximations rather than
// a true silhouette edit, since Phase 6 person segmentation doesn't exist
// in this build (tried and reverted -- see PROJECT_LOG.md); see
// buildShoulderControlPoint/buildBodyControlPoint's own docstrings.
// faceWidth/faceHeight/neckScale remain unwired: they'd need an
// anisotropic (non-radially-symmetric) warp, which this engine's
// spherize-based ControlPoint doesn't support -- noted as a possible
// follow-up, not attempted here.

import type { CaricatureEngine } from "./EffectEngine";
import type { CaricatureConfiguration } from "./Presets";
import type { FaceModel } from "../vision/VisionTypes";
import {
  buildBodyControlPoint,
  buildCheekControlPoints,
  buildEarControlPoints,
  buildEyebrowControlPoints,
  buildEyeControlPoints,
  buildForeheadControlPoint,
  buildJawControlPoint,
  buildMouthControlPoint,
  buildNoseControlPoint,
  buildShoulderControlPoint,
  type ControlPoint,
} from "./MeshWarp";
import { WebGL2MeshWarpRenderer } from "../rendering/WebGLRenderer";
import { Canvas2DMeshWarpRenderer } from "../rendering/CanvasRenderer";
import { logger } from "../utils/logger";

interface MeshWarpRenderer {
  warp(image: ImageBitmap, controlPoints: readonly ControlPoint[]): Promise<ImageBitmap>;
}

export class MeshWarpCaricatureEngine implements CaricatureEngine {
  private renderer: MeshWarpRenderer | null = null;

  async warp(image: ImageBitmap, face: FaceModel, config: CaricatureConfiguration): Promise<ImageBitmap> {
    const controlPoints = buildControlPoints(face, config);
    if (controlPoints.length === 0) {
      // No usable landmarks: nothing to warp. Graceful degradation, not an
      // error (CLAUDE.md section 49) - the caller already treats "no
      // faces" the same way by skipping this call entirely.
      return image;
    }

    try {
      return await this.getRenderer().warp(image, controlPoints);
    } catch (err) {
      logger.warn("Mesh warp renderer failed; retrying once on the Canvas2D fallback.", err);
      const fallback = new Canvas2DMeshWarpRenderer();
      this.renderer = fallback;
      try {
        return await fallback.warp(image, controlPoints);
      } catch (fallbackErr) {
        logger.error("Canvas2D mesh warp fallback also failed; returning the unmodified photo.", fallbackErr);
        return image;
      }
    }
  }

  private getRenderer(): MeshWarpRenderer {
    if (this.renderer) return this.renderer;
    if (WebGL2MeshWarpRenderer.isSupported()) {
      this.renderer = new WebGL2MeshWarpRenderer();
    } else {
      logger.warn("WebGL2 unavailable; using the Canvas2D mesh warp fallback.");
      this.renderer = new Canvas2DMeshWarpRenderer();
    }
    return this.renderer;
  }
}

function buildControlPoints(face: FaceModel, config: CaricatureConfiguration): ControlPoint[] {
  const points: ControlPoint[] = [];
  const nose = buildNoseControlPoint(face, config);
  if (nose) points.push(nose);
  points.push(...buildEyeControlPoints(face, config));
  const jaw = buildJawControlPoint(face, config);
  if (jaw) points.push(jaw);
  points.push(...buildEarControlPoints(face, config));
  const mouth = buildMouthControlPoint(face, config);
  if (mouth) points.push(mouth);
  const forehead = buildForeheadControlPoint(face, config);
  if (forehead) points.push(forehead);
  points.push(...buildCheekControlPoints(face, config));
  points.push(...buildEyebrowControlPoints(face, config));
  const shoulder = buildShoulderControlPoint(face, config);
  if (shoulder) points.push(shoulder);
  const body = buildBodyControlPoint(face, config);
  if (body) points.push(body);
  return points;
}
