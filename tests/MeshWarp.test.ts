import { describe, expect, it } from "vitest";
import {
  buildNoseControlPoint,
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

  it("applies multiple control points in sequence", () => {
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
