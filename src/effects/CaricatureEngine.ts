// Real CaricatureEngine implementation (CLAUDE.md Phase 4, section 59).
// Builds per-feature control points from a detected face's landmarks and
// renders the warp via WebGL2, falling back to Canvas2D if WebGL2 is
// unavailable or a render call throws (section 11's "must have a Canvas2D
// fallback for environments where GPU features fail", section 49's
// "never crash - degrade gracefully").
//
// Nose, eyes, jaw, and ears are wired up so far, per the spec's
// incremental build order ("Implement one deformation first: nose
// enlargement. Then add: eyes, mouth, forehead, jaw, ears."). mouthScale/
// foreheadScale/cheekScale/eyebrowScale already exist on
// CaricatureConfiguration (Presets.ts) and are accepted here, but don't
// yet produce a control point. Adding the next feature is a matter of
// writing a buildXControlPoint (MeshWarp.ts) and pushing its result into
// `controlPoints` below - this engine, both renderers, and the tests
// don't need to change shape to support it.

import type { CaricatureEngine } from "./EffectEngine";
import type { CaricatureConfiguration } from "./Presets";
import type { FaceModel } from "../vision/VisionTypes";
import {
  buildEarControlPoints,
  buildEyeControlPoints,
  buildJawControlPoint,
  buildNoseControlPoint,
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
  return points;
}
