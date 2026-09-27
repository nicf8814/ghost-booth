// Canvas2D mesh warp renderer - the guaranteed fallback for environments
// where WebGL2 is unavailable or fails (CLAUDE.md section 11). Canvas2D
// has no native texture-mapped-triangle primitive, so each mesh triangle
// is drawn individually: clip to the triangle's warped (destination)
// shape, set the canvas transform to the affine map that sends the
// triangle's *original* position to its warped one, then draw the whole
// source image through that clip+transform. The clip crops it down to
// just that triangle, correctly stretched.
//
// This is slower than the WebGL2 path (one draw call per triangle rather
// than one for the whole mesh) so it uses a coarser grid, which is an
// acceptable quality/speed tradeoff for a fallback path.

import { generateGridMesh, warpMeshPositions, type ControlPoint } from "../effects/MeshWarp";

const GRID_COLS = 28;
const GRID_ROWS = 20;

export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Solves for the 2D affine transform (a,b,c,d,e,f) satisfying, for each
 * vertex i: dst_i = M * src_i, where M = [[a, c, e], [b, d, f], [0, 0, 1]]
 * (Canvas2D's `setTransform(a,b,c,d,e,f)` convention). Exported and unit
 * tested on its own since it's pure geometry with nothing
 * Canvas2D/OffscreenCanvas-specific about it.
 */
export function triangleAffineTransform(
  s0: readonly [number, number],
  s1: readonly [number, number],
  s2: readonly [number, number],
  d0: readonly [number, number],
  d1: readonly [number, number],
  d2: readonly [number, number],
): AffineTransform {
  const [sx0, sy0] = s0;
  const [sx1, sy1] = s1;
  const [sx2, sy2] = s2;
  const [dx0, dy0] = d0;
  const [dx1, dy1] = d1;
  const [dx2, dy2] = d2;

  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (Math.abs(denom) < 1e-9) {
    // Degenerate (near-zero-area) source triangle: identity is a safe
    // no-op rather than dividing by ~0 and producing NaN/Infinity.
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
  const e =
    (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / denom;
  const f =
    (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / denom;

  return { a, b, c, d, e, f };
}

export class Canvas2DMeshWarpRenderer {
  async warp(image: ImageBitmap, controlPoints: readonly ControlPoint[]): Promise<ImageBitmap> {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context unavailable");
    }

    const mesh = generateGridMesh(GRID_COLS, GRID_ROWS);
    const warped = warpMeshPositions(mesh, controlPoints);

    const srcPoint = (vertexIndex: number): [number, number] => [
      mesh.positions[vertexIndex * 2] * image.width,
      mesh.positions[vertexIndex * 2 + 1] * image.height,
    ];
    const dstPoint = (vertexIndex: number): [number, number] => [
      warped[vertexIndex * 2] * canvas.width,
      warped[vertexIndex * 2 + 1] * canvas.height,
    ];

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
      const i0 = mesh.indices[i];
      const i1 = mesh.indices[i + 1];
      const i2 = mesh.indices[i + 2];

      const s0 = srcPoint(i0);
      const s1 = srcPoint(i1);
      const s2 = srcPoint(i2);
      const d0 = dstPoint(i0);
      const d1 = dstPoint(i1);
      const d2 = dstPoint(i2);

      const t = triangleAffineTransform(s0, s1, s2, d0, d1, d2);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d0[0], d0[1]);
      ctx.lineTo(d1[0], d1[1]);
      ctx.lineTo(d2[0], d2[1]);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    }

    return canvas.transferToImageBitmap();
  }
}
