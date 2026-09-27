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

/**
 * Builds control points for eye enlargement (CLAUDE.md section 59's second
 * deformation). FaceModel only carries a single centroid point per eye
 * (`leftEye`/`rightEye`), not an eye contour, so the radius is derived
 * geometrically instead of from a bounding box: interocular distance (the
 * gap between the two eyes) scales with face size regardless of camera
 * distance, so it's a stable proxy for "how big should the eye region be"
 * without needing per-eye contour points.
 */
export function buildEyeControlPoints(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "eyeScale">,
): ControlPoint[] {
  const { leftEye, rightEye } = face;
  if (!leftEye && !rightEye) return [];

  const interocular =
    leftEye && rightEye ? distance(leftEye, rightEye) : face.boundingBox.width * 0.45;
  const radiusX = Math.max(interocular * 0.32, 0.01);
  const radiusY = Math.max(interocular * 0.24, 0.01); // eyes are wider than tall

  const points: ControlPoint[] = [];
  for (const center of [leftEye, rightEye]) {
    if (!center) continue;
    points.push({ center, radiusX, radiusY, scale: config.eyeScale });
  }
  return points;
}

/**
 * Builds the control point for jaw/chin enlargement from the face contour
 * (the dlib 68-point scheme's jaw curve: 17 points from ear to ear, with
 * index 8 -- the middle one -- at the chin). Centering on the chin and
 * sizing from the jaw curve's own span keeps the effect anchored to the
 * lower face rather than bleeding up into the cheeks/mouth.
 */
export function buildJawControlPoint(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "jawScale">,
): ControlPoint | null {
  const contour = face.faceContour;
  if (contour.length < 17) return null;

  const chin = contour[8];
  const jawLeft = contour[0];
  const jawRight = contour[16];
  const halfWidth = Math.abs(jawRight.x - jawLeft.x) / 2;
  // The jaw curve only spans ear-to-ear at chin height, so its own height
  // is ~0; use a fraction of the face's bounding box instead for radiusY.
  const halfHeight = face.boundingBox.height * 0.16;

  return {
    center: chin,
    radiusX: Math.max(halfWidth * 1.15, 0.01),
    radiusY: Math.max(halfHeight * 1.6, 0.01),
    scale: config.jawScale,
  };
}

/**
 * Builds (approximate) control points for ear enlargement. The dlib
 * 68-point scheme this project's detector uses has no ear landmarks at
 * all, so ears can't be located precisely -- instead, the two ends of the
 * jaw contour (indices 0 and 16, roughly at ear height) are pushed
 * further outward from the face's horizontal center as a stand-in anchor.
 * This is an approximation in service of a cartoonish "outward bulge near
 * the side of the head" (CLAUDE.md section 13's "apply controlled
 * outward deformation"), not a precise ear location.
 */
export function buildEarControlPoints(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "earScale">,
): ControlPoint[] {
  const contour = face.faceContour;
  if (contour.length < 17) return [];

  const faceCenterX = face.boundingBox.x + face.boundingBox.width / 2;
  const radius = Math.max(face.boundingBox.width * 0.13, 0.01);

  return [contour[0], contour[16]].map((anchor) => {
    const direction = anchor.x >= faceCenterX ? 1 : -1;
    const center: Point = {
      x: anchor.x + direction * face.boundingBox.width * 0.09,
      y: anchor.y - face.boundingBox.height * 0.02,
    };
    return { center, radiusX: radius, radiusY: radius * 1.3, scale: config.earScale };
  });
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
