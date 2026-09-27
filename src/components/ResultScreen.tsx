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
   * ("spookified") version or the plain candid capture. */
  spookifyOn: boolean;
  onToggleSpookify: () => void;
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
  spookifyOn,
  onToggleSpookify,
}: ResultScreenProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);

  const handleImageLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setRenderedSize({ width: el.clientWidth, height: el.clientHeight });
  };

  return (
    <div className="screen result-screen">
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
      <button
        type="button"
        className={`big-button spookify-toggle ${spookifyOn ? "" : "secondary"}`}
        onClick={onToggleSpookify}
        aria-pressed={spookifyOn}
      >
        {spookifyOn ? "🎃 SPOOKIFY: ON" : "🙂 SPOOKIFY: OFF"}
      </button>

      <div className="result-controls">
        <button className="big-button" onClick={onPrint}>
          PRINT
        </button>
        <button className="big-button secondary" onClick={onRetake}>
          RETAKE
        </button>
      </div>
    </div>
  );
}
