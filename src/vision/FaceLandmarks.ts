import type { FaceModel, Point } from "./VisionTypes";

/** Derived landmark helpers shared by the caricature and ghost engines. */

export function faceCenter(face: FaceModel): Point {
  const { x, y, width, height } = face.boundingBox;
  return { x: x + width / 2, y: y + height / 2 };
}

export function eyeMidpoint(face: FaceModel): Point | undefined {
  if (!face.leftEye || !face.rightEye) return undefined;
  return {
    x: (face.leftEye.x + face.rightEye.x) / 2,
    y: (face.leftEye.y + face.rightEye.y) / 2,
  };
}

/** Rough interocular distance, useful for scaling effect radii per-face. */
export function interocularDistance(face: FaceModel): number | undefined {
  if (!face.leftEye || !face.rightEye) return undefined;
  const dx = face.leftEye.x - face.rightEye.x;
  const dy = face.leftEye.y - face.rightEye.y;
  return Math.sqrt(dx * dx + dy * dy);
}
