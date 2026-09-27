import { describe, expect, it } from "vitest";
import { centroid, landmarks68ToFaceModel } from "../src/vision/Face68LandmarkIndices";
import type { Point } from "../src/vision/VisionTypes";

/** Builds a synthetic, plausible 68-point set on a 100x200 image, so the
 * math is easy to verify by hand rather than needing a real detector. */
function make68Points(): Point[] {
  const points: Point[] = [];
  // 0-16: jaw outline, spread horizontally at y=150
  for (let i = 0; i <= 16; i++) points.push({ x: 10 + i * 5, y: 150 });
  // 17-21: eyebrow A at y=50
  for (let i = 0; i < 5; i++) points.push({ x: 20 + i * 4, y: 50 });
  // 22-26: eyebrow B at y=50
  for (let i = 0; i < 5; i++) points.push({ x: 60 + i * 4, y: 50 });
  // 27-35: nose, centered around x=50, y=80-100
  for (let i = 0; i < 9; i++) points.push({ x: 48 + (i % 3), y: 80 + i * 2 });
  // 36-41: eye A at y=60
  for (let i = 0; i < 6; i++) points.push({ x: 25 + i * 2, y: 60 });
  // 42-47: eye B at y=60
  for (let i = 0; i < 6; i++) points.push({ x: 65 + i * 2, y: 60 });
  // 48-59: outer lips at y=130
  for (let i = 0; i < 12; i++) points.push({ x: 35 + i * 2, y: 130 });
  // 60-67: inner lips at y=132
  for (let i = 0; i < 8; i++) points.push({ x: 38 + i * 2, y: 132 });
  return points;
}

describe("landmarks68ToFaceModel", () => {
  const points = make68Points();
  const box = { x: 10, y: 40, width: 80, height: 120 };
  const model = landmarks68ToFaceModel({ positions: points, box }, 100, 200);

  it("throws if given anything other than 68 points", () => {
    expect(() =>
      landmarks68ToFaceModel({ positions: points.slice(0, 67), box }, 100, 200),
    ).toThrow();
  });

  it("normalizes the bounding box into 0..1 relative to image size", () => {
    expect(model.boundingBox).toEqual({ x: 0.1, y: 0.2, width: 0.8, height: 0.6 });
  });

  it("normalizes every group's coordinates into the 0..1 range", () => {
    const allGroups = [
      ...model.faceContour,
      ...model.noseContour,
      ...model.outerLips,
      ...model.innerLips,
    ];
    for (const p of allGroups) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it("splits the correct point counts into each group", () => {
    expect(model.faceContour).toHaveLength(17);
    expect(model.noseContour).toHaveLength(9);
    expect(model.outerLips).toHaveLength(12);
    expect(model.innerLips).toHaveLength(8);
  });

  it("collapses eyes/eyebrows/nose/mouth into single centroid points", () => {
    // eye A points were all at pixel y=60 -> normalized y = 60/200 = 0.3
    expect(model.leftEye?.y).toBeCloseTo(0.3, 5);
    // eyebrow A points were all at pixel y=50 -> normalized y = 0.25
    expect(model.leftEyebrow?.y).toBeCloseTo(0.25, 5);
  });

  it("leaves pupils undefined (not produced by the 68-point model)", () => {
    expect(model.leftPupil).toBeUndefined();
    expect(model.rightPupil).toBeUndefined();
  });

  it("centroid() averages a set of points", () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toEqual({ x: 1, y: 1 });
  });

  it("clamps out-of-frame points into 0..1 instead of producing negative/over-1 coordinates", () => {
    const offFramePoints = points.map((p, i) => (i === 0 ? { x: -50, y: -50 } : p));
    const clamped = landmarks68ToFaceModel({ positions: offFramePoints, box }, 100, 200);
    expect(clamped.faceContour[0].x).toBe(0);
    expect(clamped.faceContour[0].y).toBe(0);
  });
});
