// Halloween overlays (CLAUDE.md section 24, Phase 8). Drawn procedurally
// with Canvas 2D, the same approach Frames.ts and PosterEffect.ts already
// use -- no external PNG/WebP/SVG assets to source, license, or ship
// (CLAUDE.md section 1's "prefer browser-native APIs over unnecessary
// dependencies"), works at any resolution, and stays consistent with the
// app's own orange/near-black palette rather than mismatched clip art.
//
// Each overlay takes the same seeded `rng` the caller already has for the
// photo (CLAUDE.md section 20: "seeded PRNG for... overlays"), so a given
// photo's overlay placement (which corner the cobweb is in, where the
// bats fly) is reproducible, not re-randomized on every redraw -- callers
// must pass a *fresh* rng seeded from the same value on every call for a
// given photo (see CompositionEngine.ts's `overlaySeed`), not a shared
// stateful instance, so toggling other options doesn't shift the layout.
//
// Overlays are corner/edge decorations or whole-frame treatments, not
// landmark-anchored -- CompositionEngine only receives the flattened
// foreground bitmap, not per-face landmark data, so (unlike a real prop
// like devil horns worn on a detected head) these read as scene-level
// decoration rather than being worn by a specific guest. That is an
// intentional scope cut consistent with the rest of this build's "no
// person segmentation" tier (ears/cheeks/shoulders in MeshWarp.ts made
// the same tradeoff) -- revisit if per-face anchoring is wanted later.

import type { OverlayKey } from "./HalloweenEffects";

export const OVERLAY_KEYS: OverlayKey[] = [
  "bloodSplatter",
  "cobwebs",
  "spiders",
  "bats",
  "skulls",
  "eyeballs",
  "horns",
  "vampireFangs",
  "graveyard",
  "moon",
  "candles",
  "fog",
  "crackedGlass",
  "scratches",
  "filmGrain",
  "vignette",
];

/** Draws every requested overlay, in a fixed order so layering is stable regardless of the order the operator picked them in. */
export function drawOverlays(
  ctx: OffscreenCanvasRenderingContext2D,
  keys: readonly OverlayKey[],
  width: number,
  height: number,
  rng: () => number,
): void {
  if (keys.length === 0) return;
  const active = new Set(keys);
  for (const key of OVERLAY_KEYS) {
    if (!active.has(key)) continue;
    ctx.save();
    try {
      drawOverlay(ctx, key, width, height, rng);
    } finally {
      ctx.restore();
    }
  }
}

function drawOverlay(
  ctx: OffscreenCanvasRenderingContext2D,
  key: OverlayKey,
  width: number,
  height: number,
  rng: () => number,
): void {
  switch (key) {
    case "cobwebs":
      return drawCobwebs(ctx, width, height, rng);
    case "spiders":
      return drawSpiders(ctx, width, height, rng);
    case "bats":
      return drawBats(ctx, width, height, rng);
    case "bloodSplatter":
      return drawBloodSplatter(ctx, width, height, rng);
    case "skulls":
      return drawSkulls(ctx, width, height, rng);
    case "eyeballs":
      return drawEyeballs(ctx, width, height, rng);
    case "horns":
      return drawHorns(ctx, width, height, rng);
    case "vampireFangs":
      return drawVampireFangs(ctx, width, height, rng);
    case "graveyard":
      return drawGraveyard(ctx, width, height, rng);
    case "moon":
      return drawMoon(ctx, width, height, rng);
    case "candles":
      return drawCandles(ctx, width, height, rng);
    case "fog":
      return drawFog(ctx, width, height, rng);
    case "crackedGlass":
      return drawCrackedGlass(ctx, width, height, rng);
    case "scratches":
      return drawScratches(ctx, width, height, rng);
    case "filmGrain":
      return drawFilmGrain(ctx, width, height, rng);
    case "vignette":
      return drawVignette(ctx, width, height);
  }
}

// ---- small shared helpers ----------------------------------------------

function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** One of the frame's four corners, as a unit-direction pair (sx/sy = which edge each axis is near). */
function randomCorner(rng: () => number): { sx: 1 | -1; sy: 1 | -1 } {
  return { sx: rng() < 0.5 ? 1 : -1, sy: rng() < 0.5 ? 1 : -1 };
}

// ---- individual overlays -------------------------------------------------

/** Radial web lines + a few connecting arcs, fanning out of one or two corners. */
function drawCobwebs(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 1 + Math.floor(rng() * 2); // 1-2 webs
  const corners = shuffleCorners(rng).slice(0, count);
  ctx.strokeStyle = "rgba(230, 230, 235, 0.55)";
  ctx.lineWidth = Math.max(1, width * 0.0016);

  for (const { sx, sy } of corners) {
    const cx = sx > 0 ? 0 : width;
    const cy = sy > 0 ? 0 : height;
    const reach = Math.min(width, height) * range(rng, 0.22, 0.32);
    const spokes = 6;
    const spokeAngles: number[] = [];
    for (let i = 0; i <= spokes; i++) {
      // Spread across the 90 degree corner sweep the web is anchored in.
      const t = i / spokes;
      const angle = sx > 0 ? (sy > 0 ? t * (Math.PI / 2) : -t * (Math.PI / 2)) : sy > 0 ? Math.PI - t * (Math.PI / 2) : -Math.PI + t * (Math.PI / 2);
      spokeAngles.push(angle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
      ctx.stroke();
    }
    // Connecting arcs at a few radii, threading between adjacent spokes.
    const rings = 3;
    for (let r = 1; r <= rings; r++) {
      const rad = (reach * r) / rings;
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const angle = spokeAngles[i];
        const x = cx + Math.cos(angle) * rad;
        const y = cy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

function shuffleCorners(rng: () => number): Array<{ sx: 1 | -1; sy: 1 | -1 }> {
  const all: Array<{ sx: 1 | -1; sy: 1 | -1 }> = [
    { sx: 1, sy: 1 },
    { sx: -1, sy: 1 },
    { sx: 1, sy: -1 },
    { sx: -1, sy: -1 },
  ];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

/** A small round-bodied spider with 8 thin legs, dangling from the top edge on a thread. */
function drawSpiders(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const x = range(rng, width * 0.1, width * 0.9);
    const dropLength = range(rng, height * 0.08, height * 0.22);
    const bodyY = dropLength;
    const size = Math.min(width, height) * range(rng, 0.014, 0.022);

    ctx.strokeStyle = "rgba(20, 15, 20, 0.6)";
    ctx.lineWidth = Math.max(1, size * 0.15);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, bodyY);
    ctx.stroke();

    ctx.fillStyle = "#0d0a0d";
    ctx.beginPath();
    ctx.ellipse(x, bodyY + size * 1.2, size * 0.9, size * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, bodyY, size * 0.55, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = Math.max(1, size * 0.12);
    for (let leg = 0; leg < 8; leg++) {
      const side = leg < 4 ? -1 : 1;
      const idx = leg % 4;
      const spread = (idx - 1.5) * 0.35 + 0.2;
      const legY = bodyY + size * (0.6 + idx * 0.25);
      ctx.beginPath();
      ctx.moveTo(x + side * size * 0.5, legY - size * 0.3);
      ctx.quadraticCurveTo(
        x + side * size * (2 + spread),
        legY,
        x + side * size * (2.6 + spread),
        legY + size * 0.6,
      );
      ctx.stroke();
    }
  }
}

/** Simple double-crescent bat silhouettes, scattered across the upper portion of the frame. */
function drawBats(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 2 + Math.floor(rng() * 3); // 2-4
  ctx.fillStyle = "rgba(10, 8, 12, 0.75)";
  for (let i = 0; i < count; i++) {
    const cx = range(rng, width * 0.08, width * 0.92);
    const cy = range(rng, height * 0.06, height * 0.3);
    const size = Math.min(width, height) * range(rng, 0.025, 0.045);
    drawBat(ctx, cx, cy, size);
  }
}

function drawBat(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  // Left wing: a few scalloped points, sweeping out and back.
  ctx.bezierCurveTo(cx - size * 0.6, cy - size * 0.9, cx - size * 2.2, cy - size * 0.6, cx - size * 2.6, cy + size * 0.1);
  ctx.bezierCurveTo(cx - size * 2, cy - size * 0.05, cx - size * 1.6, cy + size * 0.3, cx - size * 1.5, cy - size * 0.1);
  ctx.bezierCurveTo(cx - size * 1, cy + size * 0.35, cx - size * 0.5, cy + size * 0.15, cx, cy + size * 0.25);
  // Right wing: mirror of the left.
  ctx.bezierCurveTo(cx + size * 0.5, cy + size * 0.15, cx + size * 1, cy + size * 0.35, cx + size * 1.5, cy - size * 0.1);
  ctx.bezierCurveTo(cx + size * 1.6, cy + size * 0.3, cx + size * 2, cy - size * 0.05, cx + size * 2.6, cy + size * 0.1);
  ctx.bezierCurveTo(cx + size * 2.2, cy - size * 0.6, cx + size * 0.6, cy - size * 0.9, cx, cy);
  ctx.closePath();
  ctx.fill();
  // Little ears.
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.25, cy - size * 0.05);
  ctx.lineTo(cx - size * 0.35, cy - size * 0.45);
  ctx.lineTo(cx - size * 0.05, cy - size * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.25, cy - size * 0.05);
  ctx.lineTo(cx + size * 0.35, cy - size * 0.45);
  ctx.lineTo(cx + size * 0.05, cy - size * 0.1);
  ctx.closePath();
  ctx.fill();
}

/** A handful of irregular dark-red blobs with satellite droplets and drip trails, biased toward the edges/corners so they're less likely to sit over a face (no segmentation to check against). */
function drawBloodSplatter(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 2 + Math.floor(rng() * 3); // 2-4 splatter clusters
  ctx.fillStyle = "rgba(120, 8, 12, 0.82)";
  for (let i = 0; i < count; i++) {
    const { sx, sy } = randomCorner(rng);
    const cx = width * (sx > 0 ? range(rng, 0, 0.22) : range(rng, 0.78, 1));
    const cy = height * (sy > 0 ? range(rng, 0, 0.22) : range(rng, 0.78, 1));
    const size = Math.min(width, height) * range(rng, 0.035, 0.07);
    drawBlob(ctx, cx, cy, size, rng);

    // Smaller satellite droplets scattered around the main blob.
    const satellites = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < satellites; s++) {
      const angle = range(rng, 0, Math.PI * 2);
      const dist = range(rng, size * 0.8, size * 2.4);
      const dropSize = size * range(rng, 0.12, 0.32);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, dropSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drip trail(s) below the main blob.
    const drips = 1 + Math.floor(rng() * 3);
    for (let d = 0; d < drips; d++) {
      const dx = cx + range(rng, -size * 0.6, size * 0.6);
      const dripLen = range(rng, size * 1.2, size * 3);
      ctx.beginPath();
      ctx.ellipse(dx, cy + size * 0.3 + dripLen * 0.5, size * 0.16, dripLen * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBlob(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number, rng: () => number): void {
  const points = 10;
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = size * range(rng, 0.6, 1.15);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** A small skull watermark (circle cranium, eye holes, jaw), corner-anchored. */
function drawSkulls(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 1 + Math.floor(rng() * 2);
  const corners = shuffleCorners(rng).slice(0, count);
  const size = Math.min(width, height) * 0.08;
  for (const { sx, sy } of corners) {
    const cx = sx > 0 ? size * 1.1 : width - size * 1.1;
    const cy = sy > 0 ? size * 1.1 : height - size * 1.1;
    drawSkull(ctx, cx, cy, size, rng);
  }
}

function drawSkull(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number, rng: () => number): void {
  ctx.fillStyle = `rgba(238, 232, 220, ${range(rng, 0.55, 0.8).toFixed(2)})`;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.1, size * 0.55, Math.PI, 0);
  ctx.lineTo(cx + size * 0.5, cy + size * 0.15);
  ctx.quadraticCurveTo(cx + size * 0.45, cy + size * 0.4, cx + size * 0.25, cy + size * 0.4);
  ctx.lineTo(cx + size * 0.2, cy + size * 0.55);
  ctx.lineTo(cx + size * 0.05, cy + size * 0.4);
  ctx.lineTo(cx - size * 0.05, cy + size * 0.55);
  ctx.lineTo(cx - size * 0.2, cy + size * 0.4);
  ctx.quadraticCurveTo(cx - size * 0.45, cy + size * 0.4, cx - size * 0.5, cy + size * 0.15);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(15, 10, 12, 0.9)";
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.22, cy - size * 0.05, size * 0.16, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.22, cy - size * 0.05, size * 0.16, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.08);
  ctx.lineTo(cx - size * 0.08, cy + size * 0.22);
  ctx.lineTo(cx + size * 0.08, cy + size * 0.22);
  ctx.closePath();
  ctx.fill();
}

/** A few bloodshot floating eyeballs, small, tucked in a corner (often alongside cobwebs). */
function drawEyeballs(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 2 + Math.floor(rng() * 3);
  const size = Math.min(width, height) * 0.03;
  for (let i = 0; i < count; i++) {
    const { sx, sy } = randomCorner(rng);
    const cx = width * (sx > 0 ? range(rng, 0.03, 0.2) : range(rng, 0.8, 0.97));
    const cy = height * (sy > 0 ? range(rng, 0.03, 0.2) : range(rng, 0.8, 0.97));
    const r = size * range(rng, 0.7, 1.2);

    ctx.fillStyle = "rgba(245, 240, 230, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(150, 20, 20, 0.55)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (let v = 0; v < 4; v++) {
      const angle = range(rng, 0, Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r * 0.9, cy + Math.sin(angle) * r * 0.9);
      ctx.stroke();
    }

    const irisAngle = range(rng, 0, Math.PI * 2);
    const irisOffset = r * 0.3;
    ctx.fillStyle = "#2c1a0e";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(irisAngle) * irisOffset, cy + Math.sin(irisAngle) * irisOffset, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0604";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(irisAngle) * irisOffset, cy + Math.sin(irisAngle) * irisOffset, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Two curved devil horns as a top-corner accent (scene-level decoration, not worn on a detected head -- see file header). */
function drawHorns(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const { sx } = randomCorner(rng);
  const baseX = width * (sx > 0 ? 0.14 : 0.86);
  const baseY = height * range(rng, 0.03, 0.08);
  const size = Math.min(width, height) * range(rng, 0.09, 0.13);

  ctx.fillStyle = "rgba(40, 10, 10, 0.85)";
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(baseX + side * size * 0.35, baseY + size * 0.15);
    ctx.quadraticCurveTo(baseX + side * size * 0.8, baseY - size * 0.3, baseX + side * size * 0.55, baseY - size * 0.95);
    ctx.quadraticCurveTo(baseX + side * size * 0.4, baseY - size * 0.35, baseX + side * size * 0.1, baseY + size * 0.15);
    ctx.closePath();
    ctx.fill();
  }
}

/** Two small vampire fangs as a bottom-corner accent (scene-level decoration -- see file header). */
function drawVampireFangs(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const { sx } = randomCorner(rng);
  const cx = width * (sx > 0 ? 0.1 : 0.9);
  const cy = height * range(rng, 0.88, 0.95);
  const size = Math.min(width, height) * range(rng, 0.028, 0.04);

  ctx.fillStyle = "rgba(250, 246, 238, 0.92)";
  for (const side of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + side * size * 0.15, cy - size * 0.3);
    ctx.lineTo(cx + side * size * 0.55, cy - size * 0.3);
    ctx.lineTo(cx + side * size * 0.35, cy + size * 0.6);
    ctx.closePath();
    ctx.fill();
  }
}

/** A band of simple tombstone silhouettes sitting on the bottom edge. */
function drawGraveyard(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 3 + Math.floor(rng() * 3);
  ctx.fillStyle = "rgba(60, 60, 68, 0.7)";
  for (let i = 0; i < count; i++) {
    const h = height * range(rng, 0.14, 0.22);
    const w = h * range(rng, 0.55, 0.75);
    const x = range(rng, width * 0.02, width * 0.98 - w);
    // Most of the tombstone stays on-canvas; only a small sliver at most
    // dips below the frame, so it reads as "standing at the bottom edge"
    // rather than mostly clipped off.
    const y = height - h * range(rng, 0.9, 1.0);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + h * 0.35);
    ctx.arc(x + w / 2, y + h * 0.35, w / 2, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  }
}

/** A pale glowing moon with a few craters, tucked in a top corner. */
function drawMoon(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const { sx } = randomCorner(rng);
  const cx = width * (sx > 0 ? range(rng, 0.1, 0.2) : range(rng, 0.8, 0.9));
  const cy = height * range(rng, 0.1, 0.2);
  const r = Math.min(width, height) * range(rng, 0.06, 0.09);

  const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.5);
  glow.addColorStop(0, "rgba(230, 230, 210, 0.35)");
  glow.addColorStop(1, "rgba(230, 230, 210, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(238, 235, 215, 0.92)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(180, 175, 155, 0.5)";
  for (let i = 0; i < 3; i++) {
    const angle = range(rng, 0, Math.PI * 2);
    const dist = range(rng, 0.1, 0.55) * r;
    const craterR = r * range(rng, 0.08, 0.18);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, craterR, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A couple of lit candles along a bottom corner. */
function drawCandles(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const { sx } = randomCorner(rng);
  const count = 2 + Math.floor(rng() * 2);
  const baseX = width * (sx > 0 ? 0.05 : 0.95);
  const unit = Math.min(width, height) * 0.02;

  for (let i = 0; i < count; i++) {
    const h = range(rng, unit * 3, unit * 6);
    const w = unit * 1.1;
    const x = baseX + sx * i * unit * 2.4;
    const y = height - h;

    ctx.fillStyle = "rgba(230, 220, 190, 0.85)";
    ctx.fillRect(x - w / 2, y, w, h);

    const flameH = unit * range(rng, 1.6, 2.4);
    const flicker = ctx.createRadialGradient(x, y - flameH * 0.4, 0, x, y - flameH * 0.4, flameH);
    flicker.addColorStop(0, "rgba(255, 210, 120, 0.9)");
    flicker.addColorStop(1, "rgba(255, 140, 30, 0)");
    ctx.fillStyle = flicker;
    ctx.beginPath();
    ctx.ellipse(x, y - flameH * 0.4, flameH * 0.5, flameH * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff2c9";
    ctx.beginPath();
    ctx.ellipse(x, y - flameH * 0.3, unit * 0.18, unit * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft low-opacity fog banks along the bottom of the frame. */
function drawFog(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  ctx.fillStyle = "rgba(225, 225, 230, 0.14)";
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const y = height * (0.78 + i * 0.05) + range(rng, -8, 8);
    const rx = width * range(rng, 0.35, 0.55);
    const ry = Math.min(width, height) * range(rng, 0.05, 0.09);
    const cx = range(rng, 0, width);
    ctx.beginPath();
    ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // A second copy wrapped to the other side so fog doesn't look clipped at one edge.
    ctx.beginPath();
    ctx.ellipse(cx - (cx > width / 2 ? width : -width), y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A handful of thin jagged white cracks radiating from an off-center point, like shattered glass. */
function drawCrackedGlass(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const cx = range(rng, width * 0.3, width * 0.7);
  const cy = range(rng, height * 0.25, height * 0.6);
  const cracks = 7 + Math.floor(rng() * 4);
  const maxReach = Math.max(width, height) * 0.6;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = Math.max(1, width * 0.0012);
  for (let i = 0; i < cracks; i++) {
    let angle = (i / cracks) * Math.PI * 2 + range(rng, -0.2, 0.2);
    let x = cx;
    let y = cy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 4 + Math.floor(rng() * 3);
    for (let s = 0; s < segments; s++) {
      const segLen = (maxReach / segments) * range(rng, 0.6, 1.1);
      angle += range(rng, -0.35, 0.35);
      x += Math.cos(angle) * segLen;
      y += Math.sin(angle) * segLen;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // A tight cluster of short fracture lines right at the impact point.
  for (let i = 0; i < 10; i++) {
    const angle = range(rng, 0, Math.PI * 2);
    const len = range(rng, 4, width * 0.02);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    ctx.stroke();
  }
}

/** A handful of thin diagonal translucent lines, like old film scratches. */
function drawScratches(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const count = 5 + Math.floor(rng() * 5);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  for (let i = 0; i < count; i++) {
    const x = range(rng, 0, width);
    const lean = range(rng, -height * 0.08, height * 0.08);
    ctx.lineWidth = range(rng, 0.5, 1.5);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + lean, height);
    ctx.stroke();
  }
}

/** Speckled noise texture: many small low-opacity dots scattered across the frame. */
function drawFilmGrain(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number, rng: () => number): void {
  const density = Math.round((width * height) / 900);
  const count = Math.min(density, 6000); // cap: this is a visual texture, not a per-pixel simulation
  for (let i = 0; i < count; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const shade = rng() < 0.5 ? 255 : 0;
    const alpha = range(rng, 0.03, 0.09);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha.toFixed(3)})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** A plain radial vignette darkening the edges -- usable standalone (unlike Poster Mode's, which is baked into that effect's own tint). */
function drawVignette(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  const innerR = Math.min(width, height) * 0.45;
  const outerR = Math.max(width, height) * 0.75;
  const vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}
