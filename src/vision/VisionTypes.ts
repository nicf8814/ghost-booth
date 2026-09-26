// Shared types for the vision layer (CLAUDE.md sections 8-10).
// Coordinates are normalized 0.0 -> 1.0 relative to the source image,
// never hard-coded pixel dimensions, so they survive resizing.

export interface Point {
  x: number; // 0.0 -> 1.0
  y: number; // 0.0 -> 1.0
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceModel {
  boundingBox: Rect;

  leftEye?: Point;
  rightEye?: Point;

  nose?: Point;
  mouth?: Point;

  leftEyebrow?: Point;
  rightEyebrow?: Point;

  faceContour: Point[];

  leftPupil?: Point;
  rightPupil?: Point;

  noseContour: Point[];
  outerLips: Point[];
  innerLips: Point[];
}

/** Per-person silhouette mask for ghost/body-caricature effects. Phase 6. */
export interface PersonSegmentation {
  /** Alpha mask matching the source image dimensions; 255 = person, 0 = background. */
  mask: ImageBitmap;
  boundingBox: Rect;
}
