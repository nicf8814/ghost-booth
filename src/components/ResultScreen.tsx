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
}

/**
 * CLAUDE.md section 36. There's no caricature/ghost/composition pipeline
 * yet (Phases 4-8), so imageUrl is the plain captured photo; the debug
 * overlay is the only visible sign that vision analysis (Phase 3) ran.
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
      </div>

      <p className="result-footer">🎃 HAPPY HALLOWEEN 🎃</p>
    </div>
  );
}
