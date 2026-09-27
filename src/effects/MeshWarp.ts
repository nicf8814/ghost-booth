// CLAUDE.md section 11: face landmarks -> control points -> deformation
// field -> mesh warp -> render. This file is the pure, renderer-agnostic
// math: it knows nothing about Canvas2D/WebGL2/WebGPU, which is what lets
// both a GPU renderer and a Canvas2D fallback produce the same result from
// the same control points, and lets the deformation itself be unit tested
// without a browser.
//
// The warp is a radial "spherize" around each control point: distance from
// the point's center is remapped by a power curve, r' = R * (r/R)^power
// with power = 1/scale. This is deliberately the same family of warp used
// by tools like Photoshop's Spherize/GIMP's Whirl-and-Pinch:
//   - scale > 1 (enlarge)  -> power < 1 -> points move further from center.
//   - scale < 1 (shrink)   -> power > 1 -> points move closer to center.
//   - scale === 1          -> power === 1 -> identity (no-op).
// r'(r) is strictly increasing in r whenever power > 0, so two points that
// start at different distances from the center can never swap order after
// warping - the mesh cannot fold over itself (CLAUDE.md section 12's "do
// not allow the mesh to fold over itself"), independent of how extreme
// `scale` is, as long as it stays positive. Presets.ts additionally clamps
// scale to [SAFE_MIN_SCALE, SAFE_MAX_SCALE] as a second layer of safety.
// Points exactly at or beyond the radius are untouched (r'=r there), so the
// warp blends seamlessly into unaffected skin with no visible seam.

import type { FaceModel, Point } from "../vision/VisionTypes";
import type { CaricatureConfiguration } from "./Presets";

export interface ControlPoint {
  /** Normalized (0..1) center of the deformation, relative to the image. */
  center: Point;
  /** Normalized (0..1) horizontal/vertical radius of influence (an ellipse, not a circle, since facial features aren't square). */
  radiusX: number;
  radiusY: number;
  /** 1.0 = no-op. >1 enlarges the region, <1 shrinks it. */
  scale: number;
}

/**
 * Warps a single normalized point against one or more control points,
 * applied in sequence. For non-overlapping regions (the common case: one
 * point per facial feature) the order doesn't matter; overlapping regions
 * compose left-to-right, which is an acceptable approximation for now and
 * can be revisited (e.g. weighted blending) if later phases show seams
 * where two features' falloff radii intersect.
 */
export function warpPoint(point: Point, controlPoints: readonly ControlPoint[]): Point {
  let result = point;
  for (const cp of controlPoints) {
    result = warpPointSingle(result, cp);
  }
  return result;
}

function warpPointSingle(point: Point, cp: ControlPoint): Point {
  const { center, radiusX, radiusY, scale } = cp;
  if (radiusX <= 0 || radiusY <= 0 || scale === 1) {
    return point;
  }

  const dx = (point.x - center.x) / radiusX;
  const dy = (point.y - center.y) / radiusY;
  const n = Math.sqrt(dx * dx + dy * dy);

  if (n === 0 || n >= 1) {
    // Dead center (no direction to push in) or outside the ellipse of
    // influence: leave untouched.
    return point;
  }

  const power = 1 / safeScale(scale);
  const nPrime = Math.pow(n, power);
  const ratio = nPrime / n;

  return {
    x: center.x + dx * ratio * radiusX,
    y: center.y + dy * ratio * radiusY,
  };
}

/** Guards against a caller passing a non-positive scale, which would make `power` non-finite or negative and break the no-fold guarantee. */
function safeScale(scale: number): number {
  return scale > 0.01 ? scale : 0.01;
}

/** A regular triangulated grid over the unit square, used as the base mesh for both the WebGL2 and Canvas2D renderers. */
export interface GridMesh {
  /** Flat [x0, y0, x1, y1, ...] normalized (0..1) source positions == UVs. */
  positions: Float32Array;
  cols: number;
  rows: number;
  /** Flat triangle index list, 3 indices per triangle, into `positions`. */
  indices: Uint16Array;
}

export function generateGridMesh(cols: number, rows: number): GridMesh {
  if (cols < 1 || rows < 1) {
    throw new Error("generateGridMesh requires cols >= 1 and rows >= 1");
  }
  const vertsX = cols + 1;
  const vertsY = rows + 1;
  const positions = new Float32Array(vertsX * vertsY * 2);

  let p = 0;
  for (let y = 0; y < vertsY; y++) {
    for (let x = 0; x < vertsX; x++) {
      positions[p++] = x / cols;
      positions[p++] = y / rows;
    }
  }

  const indices = new Uint16Array(cols * rows * 6);
  let idx = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const topLeft = y * vertsX + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + vertsX;
      const bottomRight = bottomLeft + 1;
      indices[idx++] = topLeft;
      indices[idx++] = bottomLeft;
      indices[idx++] = topRight;
      indices[idx++] = topRight;
      indices[idx++] = bottomLeft;
      indices[idx++] = bottomRight;
    }
  }

  return { positions, cols, rows, indices };
}

/** Applies `warpPoint` to every vertex of a grid mesh, returning a new flat position array (the mesh's own `positions` are left untouched so they can keep serving as UVs). */
export function warpMeshPositions(mesh: GridMesh, controlPoints: readonly ControlPoint[]): Float32Array {
  const out = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 2) {
    const warped = warpPoint({ x: mesh.positions[i], y: mesh.positions[i + 1] }, controlPoints);
    out[i] = warped.x;
    out[i + 1] = warped.y;
  }
  return out;
}

/**
 * Builds the control point for nose enlargement (CLAUDE.md section 59: the
 * first deformation to implement) from a detected face's landmarks.
 *
 * Center is the centroid of the nose contour (falls back to `face.nose` if
 * the contour is missing, e.g. a detector that doesn't provide one). The
 * radius is the nose contour's own bounding box, expanded by a margin so
 * the falloff blends into the surrounding cheeks/lip area rather than
 * producing a hard-edged nose-shaped cutout.
 */
export function buildNoseControlPoint(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "noseScale">,
): ControlPoint | null {
  const contour = face.noseContour;
  const center = contour.length > 0 ? centroid(contour) : face.nose;
  if (!center) return null;

  let halfWidth: number;
  let halfHeight: number;
  if (contour.length > 0) {
    const xs = contour.map((p) => p.x);
    const ys = contour.map((p) => p.y);
    halfWidth = (Math.max(...xs) - Math.min(...xs)) / 2;
    halfHeight = (Math.max(...ys) - Math.min(...ys)) / 2;
  } else {
    // No contour to size the radius from: fall back to a fraction of the
    // face's own bounding box so the control point still has a sensible
    // extent instead of collapsing to zero.
    halfWidth = face.boundingBox.width * 0.12;
    halfHeight = face.boundingBox.height * 0.12;
  }

  // Wider than a tight fit around the nose contour so the falloff has
  // room to blend into the cheeks/lip area instead of the enlargement
  // reading as a hard-edged cutout.
  const margin = 2.2;
  return {
    center,
    radiusX: Math.max(halfWidth * margin, 0.01),
    radiusY: Math.max(halfHeight * margin, 0.01),
    scale: config.noseScale,
  };
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
