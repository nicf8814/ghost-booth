import { useRef, useState, type SyntheticEvent } from "react";
import type { FaceModel } from "../vision/VisionTypes";
import { DebugLandmarkOverlay } from "./DebugLandmarkOverlay";

interface ResultScreenProps {
  imageUrl: string | null;
  onPrint: () => void;
  onRetake: () => void;
  /** Faces detected on the master bitmap (Phase 3). Empty when none found
   * or detection failed — CLAUDE.md section 49's "no face detected -> use
   * normal Halloween photo" fallback, not an error. */
  faces: FaceModel[];
  /** Operator debug mode (CLAUDE.md section 58): overlays bounding boxes
   * and landmarks on top of the photo so detection can be verified before
   * the caricature engine is built on top of it. */
  debugMode: boolean;
  /** Whether the currently-displayed/printable photo is the caricatured
   * ("goofy filter") version or the plain candid capture. Independent of
   * the ghost toggle below -- either can be combined with either. */
  goofyFilterOn: boolean;
  onToggleGoofyFilter: () => void;
  /** Whether the booth owner's ghostly cameo ("Spookify") is layered onto
   * whichever photo (candid or goofy) is currently showing. Only rendered
   * when the operator has the cameo feature enabled at all. */
  ghostOn: boolean;
  onToggleGhost: () => void;
  ghostAvailable: boolean;
  /** Whether the decorative border (operator's "Frame" setting) is drawn
   * around whichever photo is currently showing. Only rendered when the
   * operator has a frame configured and Poster Mode isn't currently
   * applied to this photo (Poster Mode has its own border/vignette and
   * no separate frame). */
  frameOn: boolean;
  onToggleFrame: () => void;
  frameAvailable: boolean;
  /** Whether the operator's configured Halloween overlays (CLAUDE.md
   * section 24 -- cobwebs, bats, etc) are drawn on whichever photo is
   * currently showing. Only rendered when the operator has at least one
   * overlay configured and Poster Mode isn't currently applied. */
  overlaysOn: boolean;
  onToggleOverlays: () => void;
  overlaysAvailable: boolean;
  /** Whether "Poster Mode" (effects/PosterEffect.ts) is applied to
   * whichever photo is currently showing, replacing the regular
   * caption+frame+overlay treatment with a horror-poster color grade.
   * Only rendered when the operator has Poster Mode enabled for this
   * event. */
  posterOn: boolean;
  onTogglePoster: () => void;
  posterAvailable: boolean;
  /** One-tap revert: turns every toggle above off at once, back to the
   * plain candid capture (with its caption, which stays baked in
   * regardless -- CLAUDE.md section 25's "always on" caption). */
  onShowOriginal: () => void;
}

/**
 * CLAUDE.md section 36. imageUrl is whatever App.tsx's applyPhotoSelection
 * last composed for the current combination of toggles below -- this
 * component only renders the current selection and reports taps, it
 * doesn't know about the caricature/ghost/composition pipeline that
 * produced it.
 */
export function ResultScreen({
  imageUrl,
  onPrint,
  onRetake,
  faces,
  debugMode,
  goofyFilterOn,
  onToggleGoofyFilter,
  ghostOn,
  onToggleGhost,
  ghostAvailable,
  frameOn,
  onToggleFrame,
  frameAvailable,
  overlaysOn,
  onToggleOverlays,
  overlaysAvailable,
  posterOn,
  onTogglePoster,
  posterAvailable,
  onShowOriginal,
}: ResultScreenProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);

  const handleImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setRenderedSize({ width: el.clientWidth, height: el.clientHeight });
  };

  return (
    <div className="screen result-screen">
      <div className="result-header">
        <span className="result-title">GHOST BOOTH</span>
        <span className="result-subtitle">You&apos;ve been spookified</span>
      </div>

      <div className="result-photo-frame">
        {imageUrl ? (
          <>
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Your haunted photo"
              className="result-photo"
              onLoad={handleImageLoad}
            />
            {debugMode && renderedSize && (
              <DebugLandmarkOverlay faces={faces} width={renderedSize.width} height={renderedSize.height} />
            )}
          </>
        ) : (
          <div className="result-photo-placeholder">NO PHOTO</div>
        )}
      </div>
      {debugMode && (
        <p className="debug-face-count">
          {faces.length === 0 ? "0 faces detected" : `${faces.length} face${faces.length > 1 ? "s" : ""} detected`}
        </p>
      )}

      <div className="result-icon-row">
        <button
          type="button"
          className="icon-button"
          onClick={onRetake}
          aria-label="Retake photo"
        >
          <span className="icon-button-glyph" aria-hidden="true">↺</span>
          <span className="icon-button-label">RETAKE</span>
        </button>

        <button
          type="button"
          className="icon-button icon-button-primary"
          onClick={onPrint}
          aria-label="Print photo"
        >
          <span className="icon-button-glyph" aria-hidden="true">🖨️</span>
          <span className="icon-button-label">PRINT</span>
        </button>

        <button
          type="button"
          className={`icon-button ${goofyFilterOn ? "icon-button-active" : ""}`}
          onClick={onToggleGoofyFilter}
          aria-pressed={goofyFilterOn}
          aria-label="Toggle goofy filter"
        >
          <span className="icon-button-glyph" aria-hidden="true">🎃</span>
          <span className="icon-button-label">GOOFY</span>
        </button>

        {ghostAvailable && (
          <button
            type="button"
            className={`icon-button ${ghostOn ? "icon-button-active" : ""}`}
            onClick={onToggleGhost}
            aria-pressed={ghostOn}
            aria-label="Toggle spookify ghost cameo"
          >
            <span className="icon-button-glyph" aria-hidden="true">👻</span>
            <span className="icon-button-label">SPOOKY</span>
          </button>
        )}

        {frameAvailable && (
          <button
            type="button"
            className={`icon-button ${frameOn ? "icon-button-active" : ""}`}
            onClick={onToggleFrame}
            aria-pressed={frameOn}
            aria-label="Toggle photo frame"
          >
            <span className="icon-button-glyph" aria-hidden="true">🖼️</span>
            <span className="icon-button-label">FRAME</span>
          </button>
        )}

        {overlaysAvailable && (
          <button
            type="button"
            className={`icon-button ${overlaysOn ? "icon-button-active" : ""}`}
            onClick={onToggleOverlays}
            aria-pressed={overlaysOn}
            aria-label="Toggle Halloween overlays"
          >
            <span className="icon-button-glyph" aria-hidden="true">🕸️</span>
            <span className="icon-button-label">OVERLAYS</span>
          </button>
        )}

        {posterAvailable && (
          <button
            type="button"
            className={`icon-button ${posterOn ? "icon-button-active" : ""}`}
            onClick={onTogglePoster}
            aria-pressed={posterOn}
            aria-label="Toggle poster mode"
          >
            <span className="icon-button-glyph" aria-hidden="true">🎬</span>
            <span className="icon-button-label">POSTER</span>
          </button>
        )}

        <button
          type="button"
          className="icon-button"
          onClick={onShowOriginal}
          aria-label="Revert to the original candid photo"
        >
          <span className="icon-button-glyph" aria-hidden="true">↩️</span>
          <span className="icon-button-label">ORIGINAL</span>
        </button>
      </div>

      <p className="result-footer">🎃 HAPPY HALLOWEEN 🎃</p>
    </div>
  );
}
