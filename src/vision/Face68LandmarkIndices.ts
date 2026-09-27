import type { FaceModel, Point, Rect } from "./VisionTypes";

// Maps the 68-point landmark scheme (iBUG/dlib layout, as returned by
// face-api.js's FaceLandmarks68) onto our FaceModel shape. Kept as a pure
// function with no ML/tfjs dependency so it's unit-testable on its own
// (CLAUDE.md section 53: "coordinate normalization" is explicitly called
// out as something to unit test).
//
// Point index layout (0-based, 68 points total):
//   0-16   face contour / jaw outline
//   17-21  eyebrow A
//   22-26  eyebrow B
//   27-35  nose (bridge + bottom)
//   36-41  eye A
//   42-47  eye B
//   48-59  outer lips
//   60-67  inner lips
//
// face-api's own FaceLandmarks68 class labels index range 36-41 as
// "left eye" and 42-47 as "right eye" (subject-relative, not
// image-relative); we follow that same labeling here so our FaceModel's
// leftEye/rightEye agree with whatever face-api instance produced the
// input points.

export interface RawLandmarks68 {
  /** All 68 points, in absolute pixel coordinates relative to the source image. */
  positions: Point[];
  /** Detector's bounding box, in absolute pixel coordinates. */
  box: Rect;
}

export function landmarks68ToFaceModel(
  raw: RawLandmarks68,
  imageWidth: number,
  imageHeight: number,
): FaceModel {
  const p = raw.positions;
  if (p.length !== 68) {
    throw new Error(`Expected 68 landmark points, got ${p.length}`);
  }

  const norm = (pt: Point): Point => normalize(pt, imageWidth, imageHeight);

  const faceContour = p.slice(0, 17).map(norm);
  const eyebrowA = p.slice(17, 22).map(norm);
  const eyebrowB = p.slice(22, 27).map(norm);
  const noseContour = p.slice(27, 36).map(norm);
  const eyeA = p.slice(36, 42).map(norm);
  const eyeB = p.slice(42, 48).map(norm);
  const outerLips = p.slice(48, 60).map(norm);
  const innerLips = p.slice(60, 68).map(norm);

  return {
    boundingBox: normalizeRect(raw.box, imageWidth, imageHeight),

    // face-api's FaceLandmarks68.getLeftEye()/getRightEye() etc. use
    // subject-relative naming for these same index ranges; matched here.
    leftEye: centroid(eyeA),
    rightEye: centroid(eyeB),
    leftEyebrow: centroid(eyebrowA),
    rightEyebrow: centroid(eyebrowB),

    nose: centroid(noseContour),
    mouth: centroid([...outerLips, ...innerLips]),

    faceContour,
    noseContour,
    outerLips,
    innerLips,

    // Iris/pupil landmarks aren't part of the 68-point model; left
    // undefined (they're optional on FaceModel) until/unless a
    // pupil-capable detector is added.
    leftPupil: undefined,
    rightPupil: undefined,
  };
}

function normalize(pt: Point, width: number, height: number): Point {
  return { x: clamp01(pt.x / width), y: clamp01(pt.y / height) };
}

function normalizeRect(rect: Rect, width: number, height: number): Rect {
  return {
    x: clamp01(rect.x / width),
    y: clamp01(rect.y / height),
    width: rect.width / width,
    height: rect.height / height,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function centroid(points: Point[]): Point {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
