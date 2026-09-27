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
 * Warps a single normalized point against one or more control points.
 *
 * Each control point's displacement is computed independently against the
 * point's *original* position, then all displacements are summed. This
 * used to instead chain control points sequentially (each one's output
 * fed in as the next one's input), which meant a later control point's
 * falloff was measured from an already-displaced position -- so two
 * overlapping regions (e.g. an eye and a nose whose falloff radii cross on
 * a turned face, or the newer cheek/jaw/mouth regions, which sit closer
 * together than eyes/nose/ears did) would compound in an order-dependent
 * way that read as "melted" rather than cartoonish (see PROJECT_LOG.md).
 * Summing independent displacements removes both the order-dependence and
 * the cascading-through-already-warped-space effect: the result for a
 * given point no longer depends on which order its control points are
 * listed in (see the "is independent of control point order" test below).
 */
export function warpPoint(point: Point, controlPoints: readonly ControlPoint[]): Point {
  let dx = 0;
  let dy = 0;
  for (const cp of controlPoints) {
    const warped = warpPointSingle(point, cp);
    dx += warped.x - point.x;
    dy += warped.y - point.y;
  }
  return { x: point.x + dx, y: point.y + dy };
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

/**
 * Builds the control point for mouth enlargement from the lip contours
 * (dlib 68-point scheme's outerLips/innerLips, exposed on FaceModel).
 * Centered on the combined outer+inner lip centroid; sized from the outer
 * lip contour's own bounding box, same margin-for-blending approach as
 * `buildNoseControlPoint`. The vertical margin is wider than the
 * horizontal one since mouth exaggeration (CLAUDE.md section 13's "smile
 * curvature") reads through the lips' vertical motion more than a tight
 * bounding box around a resting, closed mouth would suggest.
 */
export function buildMouthControlPoint(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "mouthScale">,
): ControlPoint | null {
  const contour = face.outerLips;
  const center = contour.length > 0 ? centroid([...contour, ...face.innerLips]) : face.mouth;
  if (!center) return null;

  let halfWidth: number;
  let halfHeight: number;
  if (contour.length > 0) {
    const xs = contour.map((p) => p.x);
    const ys = contour.map((p) => p.y);
    halfWidth = (Math.max(...xs) - Math.min(...xs)) / 2;
    halfHeight = (Math.max(...ys) - Math.min(...ys)) / 2;
  } else {
    halfWidth = face.boundingBox.width * 0.14;
    halfHeight = face.boundingBox.height * 0.06;
  }

  const margin = 2.0;
  return {
    center,
    radiusX: Math.max(halfWidth * margin, 0.01),
    radiusY: Math.max(halfHeight * margin * 1.4, 0.01),
    scale: config.mouthScale,
  };
}

/**
 * Builds the control point for forehead enlargement. The dlib 68-point
 * scheme has no forehead/hairline landmarks at all (CLAUDE.md section 13:
 * "Use eyebrow position, face contour, and an estimated hairline region to
 * stretch the upper face") -- so unlike the other builders this region is
 * estimated rather than measured: centered above the eyebrow line, with
 * its vertical extent taken from the gap between the eyebrows and the top
 * of the detector's own bounding box (face detectors typically size their
 * box to include the forehead, so that gap is a reasonable proxy for "how
 * much forehead is in frame" without dedicated hairline landmarks).
 */
export function buildForeheadControlPoint(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "foreheadScale">,
): ControlPoint | null {
  const browCenter =
    face.leftEyebrow && face.rightEyebrow
      ? centroid([face.leftEyebrow, face.rightEyebrow])
      : (face.leftEyebrow ?? face.rightEyebrow);
  if (!browCenter) return null;

  const gap = Math.max(browCenter.y - face.boundingBox.y, face.boundingBox.height * 0.1);
  // Anchored above the brow line, partway into the estimated hairline gap
  // rather than at its very top, so the falloff reaches down into the
  // brows and up toward the hairline without a hard edge at either.
  const center: Point = { x: browCenter.x, y: Math.max(browCenter.y - gap * 0.55, 0) };

  return {
    center,
    radiusX: Math.max(face.boundingBox.width * 0.32, 0.01),
    radiusY: Math.max(gap * 1.1, 0.01),
    scale: config.foreheadScale,
  };
}

/**
 * Builds control points for cheek enlargement (CLAUDE.md section 13's
 * "cheek width", split out from jaw as its own knob). Like ears, the dlib
 * 68-point scheme has no cheek landmark -- approximated per side as the
 * midpoint between that eye and the jaw contour point roughly at
 * cheekbone height (index 2/14 of the 17-point jaw curve; inboard of the
 * index 0/16 anchors `buildEarControlPoints` uses).
 */
export function buildCheekControlPoints(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "cheekScale">,
): ControlPoint[] {
  const contour = face.faceContour;
  const { leftEye, rightEye } = face;
  if (contour.length < 17 || (!leftEye && !rightEye)) return [];

  const pairs: Array<[Point | undefined, Point]> = [
    [leftEye, contour[2]],
    [rightEye, contour[14]],
  ];

  const radius = Math.max(face.boundingBox.width * 0.16, 0.01);
  const points: ControlPoint[] = [];
  for (const [eye, jawAnchor] of pairs) {
    if (!eye) continue;
    const center: Point = { x: (eye.x + jawAnchor.x) / 2, y: (eye.y + jawAnchor.y) / 2 };
    points.push({ center, radiusX: radius, radiusY: radius * 1.15, scale: config.cheekScale });
  }
  return points;
}

/**
 * Builds control points for eyebrow exaggeration (CLAUDE.md section 13),
 * centered directly on each eyebrow's own centroid landmark -- unlike
 * mouth/forehead/cheek, dlib 68 gives eyebrows a real landmark range
 * (17-21/22-26), so no positional approximation is needed here, only a
 * radius (sized from interocular distance, same stable proxy
 * `buildEyeControlPoints` uses).
 */
export function buildEyebrowControlPoints(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "eyebrowScale">,
): ControlPoint[] {
  const { leftEyebrow, rightEyebrow, leftEye, rightEye } = face;
  if (!leftEyebrow && !rightEyebrow) return [];

  const interocular =
    leftEye && rightEye ? distance(leftEye, rightEye) : face.boundingBox.width * 0.45;
  const radiusX = Math.max(interocular * 0.26, 0.01);
  const radiusY = Math.max(interocular * 0.14, 0.01);

  const points: ControlPoint[] = [];
  for (const center of [leftEyebrow, rightEyebrow]) {
    if (!center) continue;
    points.push({ center, radiusX, radiusY, scale: config.eyebrowScale });
  }
  return points;
}

/**
 * Builds the control point for shoulder width (CLAUDE.md section 14's
 * "tiny shoulders / giant shoulders"). No person segmentation exists in
 * this build (Phase 6 was tried and reverted -- see PROJECT_LOG.md), so
 * like ears and cheeks this is a landmark-anchored approximation, not a
 * true silhouette edit: it warps whatever is actually in the image at the
 * estimated shoulder band below the chin (clothing, background, or actual
 * shoulders), the same tradeoff already accepted for ears. Wide and
 * comparatively flat (radiusY well under radiusX) so it reads as a
 * horizontal band rather than a circular region.
 */
export function buildShoulderControlPoint(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "shoulderScale">,
): ControlPoint | null {
  const contour = face.faceContour;
  if (contour.length < 17) return null;
  const chin = contour[8];

  const center: Point = {
    x: chin.x,
    y: Math.min(chin.y + face.boundingBox.height * 0.55, 0.98),
  };

  return {
    center,
    radiusX: Math.max(face.boundingBox.width * 1.1, 0.01),
    radiusY: Math.max(face.boundingBox.height * 0.5, 0.01),
    scale: config.shoulderScale,
  };
}

/**
 * Builds the control point for overall body/torso width (CLAUDE.md
 * section 14's "barrel-chest silhouette / cartoon body proportions"),
 * anchored lower and taller than `buildShoulderControlPoint` so the two
 * can be dialed independently (e.g. wide shoulders tapering to a narrow
 * waist). Same landmark-approximation caveat as the shoulder control
 * point above -- see its docstring.
 */
export function buildBodyControlPoint(
  face: FaceModel,
  config: Pick<CaricatureConfiguration, "bodyScale">,
): ControlPoint | null {
  const contour = face.faceContour;
  if (contour.length < 17) return null;
  const chin = contour[8];

  const center: Point = {
    x: chin.x,
    y: Math.min(chin.y + face.boundingBox.height * 1.15, 0.99),
  };

  return {
    center,
    radiusX: Math.max(face.boundingBox.width * 1.35, 0.01),
    radiusY: Math.max(face.boundingBox.height * 0.85, 0.01),
    scale: config.bodyScale,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: readonly Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
