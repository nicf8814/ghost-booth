import { describe, expect, it } from "vitest";
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
  generateGridMesh,
  warpMeshPositions,
  warpPoint,
  type ControlPoint,
} from "../src/effects/MeshWarp";
import type { FaceModel, Point } from "../src/vision/VisionTypes";

function cp(overrides: Partial<ControlPoint> = {}): ControlPoint {
  return { center: { x: 0.5, y: 0.5 }, radiusX: 0.2, radiusY: 0.2, scale: 1, ...overrides };
}

describe("warpPoint", () => {
  it("is a no-op when scale is 1", () => {
    const point = { x: 0.55, y: 0.48 };
    expect(warpPoint(point, [cp({ scale: 1 })])).toEqual(point);
  });

  it("leaves the exact center untouched (no direction to push in)", () => {
    const center = { x: 0.5, y: 0.5 };
    expect(warpPoint(center, [cp({ center, scale: 1.8 })])).toEqual(center);
  });

  it("leaves points outside the radius untouched", () => {
    const point = { x: 0.9, y: 0.9 };
    expect(warpPoint(point, [cp({ scale: 1.8 })])).toEqual(point);
  });

  it("leaves points exactly on the radius boundary untouched (seamless blend)", () => {
    const point = { x: 0.7, y: 0.5 }; // dx=0.2 == radiusX, on the ellipse edge
    const result = warpPoint(point, [cp({ scale: 1.8 })]);
    expect(result.x).toBeCloseTo(point.x, 10);
    expect(result.y).toBeCloseTo(point.y, 10);
  });

  it("pushes points further from center when scale > 1 (enlarge)", () => {
    const center = { x: 0.5, y: 0.5 };
    const point = { x: 0.55, y: 0.5 }; // distance 0.05 from center, inside radius 0.2
    const result = warpPoint(point, [cp({ center, scale: 1.5 })]);
    const distBefore = Math.hypot(point.x - center.x, point.y - center.y);
    const distAfter = Math.hypot(result.x - center.x, result.y - center.y);
    expect(distAfter).toBeGreaterThan(distBefore);
  });

  it("pulls points closer to center when scale < 1 (shrink)", () => {
    const center = { x: 0.5, y: 0.5 };
    const point = { x: 0.55, y: 0.5 };
    const result = warpPoint(point, [cp({ center, scale: 0.7 })]);
    const distBefore = Math.hypot(point.x - center.x, point.y - center.y);
    const distAfter = Math.hypot(result.x - center.x, result.y - center.y);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("never folds the mesh: relative radial order is preserved for any scale in the safe range", () => {
    const center = { x: 0.5, y: 0.5 };
    const radii = [0.01, 0.05, 0.1, 0.15, 0.19];
    for (const scale of [0.6, 0.8, 1, 1.3, 1.8]) {
      const control = cp({ center, radiusX: 0.2, radiusY: 0.2, scale });
      const warpedDistances = radii.map((r) => {
        const p = { x: center.x + r, y: center.y };
        const w = warpPoint(p, [control]);
        return Math.hypot(w.x - center.x, w.y - center.y);
      });
      for (let i = 1; i < warpedDistances.length; i++) {
        expect(warpedDistances[i]).toBeGreaterThan(warpedDistances[i - 1]);
      }
    }
  });

  it("keeps warped points within the radius of influence (bounded, no explosion)", () => {
    const center = { x: 0.5, y: 0.5 };
    const control = cp({ center, radiusX: 0.2, radiusY: 0.2, scale: 1.8 });
    const point = { x: 0.699, y: 0.5 }; // just inside the boundary
    const result = warpPoint(point, [control]);
    const dist = Math.hypot(result.x - center.x, result.y - center.y);
    expect(dist).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it("applies multiple control points additively (not by chaining one's output into the next)", () => {
    const point = { x: 0.55, y: 0.5 };
    const single = warpPoint(point, [cp({ scale: 1.5 })]);
    const double = warpPoint(point, [cp({ scale: 1.5 }), cp({ scale: 1.5 })]);
    // Applying the same enlarging control point twice pushes it even
    // further out than applying it once.
    const center = { x: 0.5, y: 0.5 };
    expect(Math.hypot(double.x - center.x, double.y - center.y)).toBeGreaterThan(
      Math.hypot(single.x - center.x, single.y - center.y),
    );
  });

  it("is independent of control point order for overlapping regions (the 'melted face' fix)", () => {
    // Two different, overlapping control points -- e.g. a nose and an eye
    // whose falloff radii cross on a turned face. Sequential composition
    // (the previous implementation) would give a different result
    // depending on which one was applied first; summing independent
    // displacements gives the same result either way.
    const point = { x: 0.52, y: 0.51 };
    const a = cp({ center: { x: 0.5, y: 0.5 }, radiusX: 0.3, radiusY: 0.3, scale: 1.6 });
    const b = cp({ center: { x: 0.56, y: 0.48 }, radiusX: 0.25, radiusY: 0.25, scale: 1.35 });
    const ab = warpPoint(point, [a, b]);
    const ba = warpPoint(point, [b, a]);
    expect(ab.x).toBeCloseTo(ba.x, 10);
    expect(ab.y).toBeCloseTo(ba.y, 10);
  });

  it("treats a non-positive scale as effectively a no-fold minimum rather than producing NaN/Infinity", () => {
    const point = { x: 0.55, y: 0.5 };
    const result = warpPoint(point, [cp({ scale: 0 })]);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe("generateGridMesh", () => {
  it("produces (cols+1)*(rows+1) vertices covering the unit square corners", () => {
    const mesh = generateGridMesh(4, 3);
    expect(mesh.positions.length).toBe((4 + 1) * (3 + 1) * 2);
    // First vertex is (0,0), last vertex is (1,1).
    expect(mesh.positions[0]).toBe(0);
    expect(mesh.positions[1]).toBe(0);
    const lastIdx = mesh.positions.length - 2;
    expect(mesh.positions[lastIdx]).toBe(1);
    expect(mesh.positions[lastIdx + 1]).toBe(1);
  });

  it("produces cols*rows*2 triangles (6 indices each)", () => {
    const mesh = generateGridMesh(5, 6);
    expect(mesh.indices.length).toBe(5 * 6 * 6);
    // Every index must reference a real vertex.
    const vertexCount = (5 + 1) * (6 + 1);
    for (const i of mesh.indices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(vertexCount);
    }
  });

  it("throws on invalid dimensions rather than producing an empty/broken mesh", () => {
    expect(() => generateGridMesh(0, 3)).toThrow();
    expect(() => generateGridMesh(3, 0)).toThrow();
  });
});

describe("warpMeshPositions", () => {
  it("leaves the mesh's own positions array untouched (used as UVs downstream)", () => {
    const mesh = generateGridMesh(2, 2);
    const original = mesh.positions.slice();
    warpMeshPositions(mesh, [cp({ scale: 1.8 })]);
    expect(mesh.positions).toEqual(original);
  });

  it("returns an array of the same length, with corner vertices unaffected by a central control point", () => {
    const mesh = generateGridMesh(4, 4);
    const warped = warpMeshPositions(mesh, [cp({ center: { x: 0.5, y: 0.5 }, radiusX: 0.1, radiusY: 0.1, scale: 1.8 })]);
    expect(warped.length).toBe(mesh.positions.length);
    // Corners (0,0) and (1,1) are far outside the small radius.
    expect(warped[0]).toBe(0);
    expect(warped[1]).toBe(0);
    const lastIdx = warped.length - 2;
    expect(warped[lastIdx]).toBe(1);
    expect(warped[lastIdx + 1]).toBe(1);
  });
});

function makeFace(overrides: Partial<FaceModel> = {}): FaceModel {
  return {
    boundingBox: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 },
    faceContour: [],
    noseContour: [],
    outerLips: [],
    innerLips: [],
    ...overrides,
  };
}

describe("buildNoseControlPoint", () => {
  it("centers on the nose contour's centroid when a contour is present", () => {
    const contour: Point[] = [
      { x: 0.48, y: 0.5 },
      { x: 0.52, y: 0.5 },
      { x: 0.5, y: 0.55 },
      { x: 0.5, y: 0.45 },
    ];
    const face = makeFace({ noseContour: contour });
    const result = buildNoseControlPoint(face, { noseScale: 1.5 });
    expect(result).not.toBeNull();
    expect(result!.center.x).toBeCloseTo(0.5, 5);
    expect(result!.center.y).toBeCloseTo(0.5, 5);
    expect(result!.scale).toBe(1.5);
    expect(result!.radiusX).toBeGreaterThan(0);
    expect(result!.radiusY).toBeGreaterThan(0);
  });

  it("falls back to face.nose when no contour is available", () => {
    const face = makeFace({ noseContour: [], nose: { x: 0.5, y: 0.5 } });
    const result = buildNoseControlPoint(face, { noseScale: 1.5 });
    expect(result).not.toBeNull();
    expect(result!.center).toEqual({ x: 0.5, y: 0.5 });
    // No contour to size from: falls back to a fraction of the face box.
    expect(result!.radiusX).toBeCloseTo(face.boundingBox.width * 0.12 * 2.2, 5);
  });

  it("returns null when there is neither a nose contour nor a nose point", () => {
    const face = makeFace({ noseContour: [], nose: undefined });
    expect(buildNoseControlPoint(face, { noseScale: 1.5 })).toBeNull();
  });
});

/**
 * A synthetic but shape-plausible 17-point dlib jaw contour: index 0 and
 * 16 sit at "ear height" on the left/right, index 8 (the middle one) is
 * the chin, lower (larger y) than the ends, with a smooth curve between.
 */
function makeJawContour(): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    points.push({ x: 0.32 + 0.36 * t, y: 0.55 + 0.17 * Math.sin(Math.PI * t) });
  }
  return points;
}

describe("buildEyeControlPoints", () => {
  it("returns one control point per eye, centered on each eye's given point", () => {
    const face = makeFace({ leftEye: { x: 0.4, y: 0.35 }, rightEye: { x: 0.6, y: 0.35 } });
    const points = buildEyeControlPoints(face, { eyeScale: 1.5 });
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.center)).toEqual(
      expect.arrayContaining([{ x: 0.4, y: 0.35 }, { x: 0.6, y: 0.35 }]),
    );
    for (const p of points) {
      expect(p.scale).toBe(1.5);
      expect(p.radiusX).toBeGreaterThan(0);
      expect(p.radiusY).toBeGreaterThan(0);
    }
  });

  it("sizes the radius from interocular distance, not a fixed constant", () => {
    const close = buildEyeControlPoints(
      makeFace({ leftEye: { x: 0.48, y: 0.35 }, rightEye: { x: 0.52, y: 0.35 } }),
      { eyeScale: 1.5 },
    );
    const far = buildEyeControlPoints(
      makeFace({ leftEye: { x: 0.3, y: 0.35 }, rightEye: { x: 0.7, y: 0.35 } }),
      { eyeScale: 1.5 },
    );
    expect(far[0].radiusX).toBeGreaterThan(close[0].radiusX);
  });

  it("returns an empty array when neither eye was detected", () => {
    expect(buildEyeControlPoints(makeFace(), { eyeScale: 1.5 })).toEqual([]);
  });

  it("returns a single control point when only one eye was detected", () => {
    const face = makeFace({ leftEye: { x: 0.4, y: 0.35 } });
    const points = buildEyeControlPoints(face, { eyeScale: 1.5 });
    expect(points).toHaveLength(1);
    expect(points[0].center).toEqual({ x: 0.4, y: 0.35 });
  });
});

describe("buildJawControlPoint", () => {
  it("centers on the chin (contour index 8)", () => {
    const contour = makeJawContour();
    const face = makeFace({ faceContour: contour });
    const result = buildJawControlPoint(face, { jawScale: 1.6 });
    expect(result).not.toBeNull();
    expect(result!.center).toEqual(contour[8]);
    expect(result!.scale).toBe(1.6);
    expect(result!.radiusX).toBeGreaterThan(0);
    expect(result!.radiusY).toBeGreaterThan(0);
  });

  it("returns null when the face contour doesn't have the full 17 jaw points", () => {
    const face = makeFace({ faceContour: [{ x: 0.5, y: 0.5 }] });
    expect(buildJawControlPoint(face, { jawScale: 1.6 })).toBeNull();
  });
});

describe("buildEarControlPoints", () => {
  it("returns two control points, pushed outward from the face center", () => {
    const contour = makeJawContour();
    const face = makeFace({ faceContour: contour });
    const points = buildEarControlPoints(face, { earScale: 1.7 });
    expect(points).toHaveLength(2);

    const faceCenterX = face.boundingBox.x + face.boundingBox.width / 2;
    const [left, right] = [...points].sort((a, b) => a.center.x - b.center.x);
    expect(left.center.x).toBeLessThan(contour[0].x);
    expect(right.center.x).toBeGreaterThan(contour[16].x);
    expect(left.center.x).toBeLessThan(faceCenterX);
    expect(right.center.x).toBeGreaterThan(faceCenterX);
    for (const p of points) {
      expect(p.scale).toBe(1.7);
      expect(p.radiusX).toBeGreaterThan(0);
    }
  });

  it("returns an empty array when the face contour doesn't have the full 17 jaw points", () => {
    const face = makeFace({ faceContour: [] });
    expect(buildEarControlPoints(face, { earScale: 1.7 })).toEqual([]);
  });
});

describe("buildMouthControlPoint", () => {
  it("centers on the combined outer+inner lip centroid when contours are present", () => {
    const outerLips: Point[] = [
      { x: 0.45, y: 0.7 },
      { x: 0.55, y: 0.7 },
      { x: 0.5, y: 0.73 },
      { x: 0.5, y: 0.67 },
    ];
    const face = makeFace({ outerLips, innerLips: [] });
    const result = buildMouthControlPoint(face, { mouthScale: 1.4 });
    expect(result).not.toBeNull();
    expect(result!.center.x).toBeCloseTo(0.5, 5);
    expect(result!.scale).toBe(1.4);
    expect(result!.radiusX).toBeGreaterThan(0);
    expect(result!.radiusY).toBeGreaterThan(0);
  });

  it("falls back to face.mouth when no lip contour is available", () => {
    const face = makeFace({ outerLips: [], innerLips: [], mouth: { x: 0.5, y: 0.7 } });
    const result = buildMouthControlPoint(face, { mouthScale: 1.4 });
    expect(result).not.toBeNull();
    expect(result!.center).toEqual({ x: 0.5, y: 0.7 });
  });

  it("returns null when there is neither a lip contour nor a mouth point", () => {
    const face = makeFace({ outerLips: [], innerLips: [], mouth: undefined });
    expect(buildMouthControlPoint(face, { mouthScale: 1.4 })).toBeNull();
  });
});

describe("buildForeheadControlPoint", () => {
  it("centers above the eyebrow line, within the estimated hairline gap", () => {
    const face = makeFace({
      leftEyebrow: { x: 0.42, y: 0.3 },
      rightEyebrow: { x: 0.58, y: 0.3 },
      boundingBox: { x: 0.3, y: 0.15, width: 0.4, height: 0.5 },
    });
    const result = buildForeheadControlPoint(face, { foreheadScale: 1.5 });
    expect(result).not.toBeNull();
    expect(result!.center.y).toBeLessThan(0.3);
    expect(result!.center.y).toBeGreaterThanOrEqual(face.boundingBox.y);
    expect(result!.scale).toBe(1.5);
  });

  it("returns null when neither eyebrow was detected", () => {
    expect(buildForeheadControlPoint(makeFace(), { foreheadScale: 1.5 })).toBeNull();
  });
});

describe("buildCheekControlPoints", () => {
  it("returns one control point per detected eye, between the eye and the jaw", () => {
    const contour = makeJawContour();
    const face = makeFace({
      faceContour: contour,
      leftEye: { x: 0.4, y: 0.4 },
      rightEye: { x: 0.6, y: 0.4 },
    });
    const points = buildCheekControlPoints(face, { cheekScale: 1.3 });
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(p.scale).toBe(1.3);
      expect(p.radiusX).toBeGreaterThan(0);
    }
  });

  it("returns an empty array without a jaw contour or any detected eye", () => {
    expect(buildCheekControlPoints(makeFace(), { cheekScale: 1.3 })).toEqual([]);
  });
});

describe("buildEyebrowControlPoints", () => {
  it("returns one control point per detected eyebrow, centered on it exactly", () => {
    const face = makeFace({ leftEyebrow: { x: 0.42, y: 0.32 }, rightEyebrow: { x: 0.58, y: 0.32 } });
    const points = buildEyebrowControlPoints(face, { eyebrowScale: 1.5 });
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.center)).toEqual(
      expect.arrayContaining([{ x: 0.42, y: 0.32 }, { x: 0.58, y: 0.32 }]),
    );
  });

  it("returns an empty array when neither eyebrow was detected", () => {
    expect(buildEyebrowControlPoints(makeFace(), { eyebrowScale: 1.5 })).toEqual([]);
  });
});

describe("buildShoulderControlPoint and buildBodyControlPoint", () => {
  it("anchor below the chin, with the body point lower than the shoulder point", () => {
    const contour = makeJawContour();
    const face = makeFace({ faceContour: contour });
    const shoulder = buildShoulderControlPoint(face, { shoulderScale: 1.3 });
    const body = buildBodyControlPoint(face, { bodyScale: 1.3 });
    expect(shoulder).not.toBeNull();
    expect(body).not.toBeNull();
    expect(shoulder!.center.y).toBeGreaterThan(contour[8].y);
    expect(body!.center.y).toBeGreaterThan(shoulder!.center.y);
    expect(shoulder!.scale).toBe(1.3);
    expect(body!.scale).toBe(1.3);
  });

  it("clamp their center within the normalized image range even for a very tall bounding box", () => {
    const contour = makeJawContour();
    const face = makeFace({ faceContour: contour, boundingBox: { x: 0.3, y: 0.1, width: 0.4, height: 5 } });
    const shoulder = buildShoulderControlPoint(face, { shoulderScale: 1.3 });
    const body = buildBodyControlPoint(face, { bodyScale: 1.3 });
    expect(shoulder!.center.y).toBeLessThanOrEqual(1);
    expect(body!.center.y).toBeLessThanOrEqual(1);
  });

  it("return null without a full 17-point jaw contour", () => {
    const face = makeFace({ faceContour: [] });
    expect(buildShoulderControlPoint(face, { shoulderScale: 1.3 })).toBeNull();
    expect(buildBodyControlPoint(face, { bodyScale: 1.3 })).toBeNull();
  });
});
