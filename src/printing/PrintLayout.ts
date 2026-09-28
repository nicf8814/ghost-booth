// CLAUDE.md section 41: "Make 4x6 a first-class output preset" + section 40's
// pipeline ("master image -> crop/fit to paper -> printer resolution ->
// JPEG/PNG -> printer adapter"). The confirmed hardware for this booth (see
// PROJECT_LOG.md) is a Kodak Mini 2 Retro, which outputs 2x3 prints, not
// 4x6 -- but 2x3 and 4x6 are the SAME aspect ratio (2:3), just a different
// physical size, so no new crop math is needed for it, only a layout entry
// so the operator picks the shape that actually matches what comes out of
// the printer.
//
// The result-screen display deliberately does NOT force photos into a
// fixed aspect ratio box (see app.css's comment on .result-photo-frame --
// an earlier attempt at that double-cropped photos that already had a
// baked-in frame border). This module is a separate, later step: it only
// ever runs once, right before handing the image to a PhotoPrinter
// adapter, so the print output matches the physical paper shape without
// touching what the guest sees on screen.

export type PrintLayout = "2x3" | "4x6" | "square" | "2x6strip";

export const PRINT_LAYOUTS: PrintLayout[] = ["2x3", "4x6", "square", "2x6strip"];

export const PRINT_LAYOUT_LABELS: Record<PrintLayout, string> = {
  "2x3": "2x3 (Kodak Mini 2 Retro)",
  "4x6": "4x6",
  square: "Square",
  "2x6strip": "2x6 Photo Strip",
};

// Ratio of the shorter side to the longer side. A 2x3 and a 4x6 print are
// both 2:3, so they share a ratio here -- cropToPrintLayout only cares
// about shape, not physical size (the printer/vendor app scales the final
// pixels to its own paper). "2x6strip" is a tall strip -- 2:6 reduces to
// 1:3, much narrower than a standard print.
const SHORT_TO_LONG_RATIO: Record<PrintLayout, number> = {
  "2x3": 2 / 3,
  "4x6": 2 / 3,
  square: 1,
  "2x6strip": 2 / 6,
};

/**
 * Given a source image's pixel dimensions and a target short:long ratio,
 * returns the largest centered crop rectangle of that ratio that fits
 * inside the source ("cover" crop -- fills the target shape completely,
 * trimming whichever dimension is relatively longer, never letterboxing).
 * Preserves the source's own orientation (a landscape photo stays
 * landscape) rather than forcing portrait, since CLAUDE.md section 46 has
 * the booth mounted in one fixed physical orientation -- the target ratio
 * describes a shape, not a forced rotation.
 *
 * Pure/synchronous and canvas-free so it's directly unit-testable, per this
 * project's convention of separating crop-rect math from the canvas draw
 * that uses it (see rendering/CanvasRenderer.ts's triangleAffineTransform).
 */
export function computeCoverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  shortToLongRatio: number,
): { x: number; y: number; width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0 || shortToLongRatio <= 0) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  const isSourceLandscape = sourceWidth >= sourceHeight;
  const longSide = Math.max(sourceWidth, sourceHeight);
  const shortSide = Math.min(sourceWidth, sourceHeight);
  const sourceShortToLong = shortSide / longSide;

  let cropWidth: number;
  let cropHeight: number;
  // Height trims are biased toward the bottom edge (see below) rather than
  // centered like every other case -- default false, flipped on for the
  // one branch that actually needs it.
  let anchorCropToBottom = false;

  if (sourceShortToLong > shortToLongRatio) {
    // Source is relatively "fatter" than the target shape (its short side
    // is proportionally longer) -- trim the short side, keep the long side.
    if (isSourceLandscape) {
      cropWidth = sourceWidth;
      cropHeight = sourceWidth * shortToLongRatio;
      anchorCropToBottom = true;
    } else {
      cropHeight = sourceHeight;
      cropWidth = sourceHeight * shortToLongRatio;
    }
  } else {
    // Source is relatively "thinner" than the target shape -- trim the long
    // side, keep the short side.
    if (isSourceLandscape) {
      cropHeight = sourceHeight;
      cropWidth = sourceHeight / shortToLongRatio;
    } else {
      cropWidth = sourceWidth;
      cropHeight = sourceWidth / shortToLongRatio;
      anchorCropToBottom = true;
    }
  }

  // Clamp for float rounding -- a computed side should never exceed its
  // source dimension, but guard against it rather than producing a crop
  // rect that runs off the edge of the source image.
  cropWidth = Math.min(cropWidth, sourceWidth);
  cropHeight = Math.min(cropHeight, sourceHeight);

  // Every other crop (trimming width, or trimming height for a case that
  // can't happen with this booth's fixed landscape mount -- see below) stays
  // centered, the ordinary "cover crop" default. But whenever HEIGHT gets
  // trimmed on the source's actual landscape/portrait orientation
  // (`anchorCropToBottom`), a plain centered crop removes equal slices from
  // the top *and* bottom -- and the caption CompositionEngine.compose()
  // draws (CLAUDE.md section 25) always sits in a strip right at the
  // bottom edge of the full, uncropped photo. This function runs once,
  // right before handing the image to a printer adapter, on a bitmap that
  // already has the caption baked in (see composeSelectedBitmap) -- a
  // centered height trim can slice straight through it even though it
  // looks fine on the un-cropped result screen (confirmed: reported as
  // "caption missing in the Kodak print" when the iPad's actual camera
  // capture ratio isn't exactly 16:9, since getUserMedia's { ideal: 1920x1080
  // } constraint is only a hint -- see CameraManager.ts). Anchoring the
  // crop to the bottom edge instead (trimming only from the top) guarantees
  // the caption survives, at the cost of slightly more headroom lost above
  // the subjects in that mismatched-aspect-ratio case, which is the
  // correct trade-off here: a printed photo with less headroom is fine, one
  // with no caption defeats the point of picking one at all.
  const cropY = anchorCropToBottom ? sourceHeight - cropHeight : (sourceHeight - cropHeight) / 2;

  return {
    x: (sourceWidth - cropWidth) / 2,
    y: cropY,
    width: cropWidth,
    height: cropHeight,
  };
}

/**
 * Crops `source` to the given print layout's shape, once, immediately
 * before handing the image to a PhotoPrinter adapter (CLAUDE.md section 40:
 * "do not repeatedly resize the same bitmap"). Never throws (section 49) --
 * a missing 2D context just returns the source uncropped rather than
 * blocking the print.
 */
export async function cropToPrintLayout(source: ImageBitmap, layout: PrintLayout): Promise<ImageBitmap> {
  const ratio = SHORT_TO_LONG_RATIO[layout] ?? SHORT_TO_LONG_RATIO["2x3"];
  const rect = computeCoverCropRect(source.width, source.height, ratio);

  const canvas = new OffscreenCanvas(Math.round(rect.width), Math.round(rect.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return source;
  }

  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return canvas.transferToImageBitmap();
}
