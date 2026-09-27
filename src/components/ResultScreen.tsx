import { useRef, useState, type SyntheticEvent } from "react";
import type { FaceModel } from "../vision/VisionTypes";
import { DebugLandmarkOverlay } from "./DebugLandmarkOverlay";
import { FeatureCarousel } from "./FeatureCarousel";
import type { FrameKey } from "../effects/Frames";
import type { OverlayKey } from "../effects/HalloweenEffects";
import type { PosterTint } from "../effects/PosterEffect";
import type { FilterKey } from "../effects/HorrorFilters";

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
  /** Whether a caption (CLAUDE.md section 25) is drawn on whichever photo
   * is currently showing, poster-graded or not. Only rendered when the
   * operator's Caption Mode isn't "off". Unlike the other toggles, every
   * tap also rerolls which caption is queued next (in "random" caption
   * mode) -- so repeated taps cycle through different lines rather than
   * just showing/hiding the same one. */
  captionOn: boolean;
  onToggleCaption: () => void;
  captionAvailable: boolean;
  /** One-tap revert: turns every toggle above off/back to defaults at once,
   * back to the plain candid capture. */
  onShowOriginal: () => void;
  /** Frame/Overlays/Poster/Filter pickers, rendered inline via
   * FeatureCarousel below the photo -- see that component. Everything the
   * guest needs (see the photo, pick features, print) stays on this one
   * screen; there's no separate customize screen to navigate to/from. */
  frameOptions: FrameKey[];
  frameKey: FrameKey;
  onSelectFrame: (key: FrameKey) => void;
  overlayOptions: OverlayKey[];
  overlayKeys: OverlayKey[];
  onToggleOverlay: (key: OverlayKey) => void;
  posterTints: PosterTint[];
  posterTint: PosterTint | null;
  onSelectPoster: (tint: PosterTint | null) => void;
  filterOptions: FilterKey[];
  filterKey: FilterKey | null;
  onSelectFilter: (key: FilterKey | null) => void;
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
  captionOn,
  onToggleCaption,
  captionAvailable,
  onShowOriginal,
  frameOptions,
  frameKey,
  onSelectFrame,
  overlayOptions,
  overlayKeys,
  onToggleOverlay,
  posterTints,
  posterTint,
  onSelectPoster,
  filterOptions,
  filterKey,
  onSelectFilter,
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

      <FeatureCarousel
        frameOptions={frameOptions}
        frameKey={frameKey}
        onSelectFrame={onSelectFrame}
        overlayOptions={overlayOptions}
        overlayKeys={overlayKeys}
        onToggleOverlay={onToggleOverlay}
        posterTints={posterTints}
        posterTint={posterTint}
        onSelectPoster={onSelectPoster}
        filterOptions={filterOptions}
        filterKey={filterKey}
        onSelectFilter={onSelectFilter}
      />

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

        {captionAvailable && (
          <button
            type="button"
            className={`icon-button ${captionOn ? "icon-button-active" : ""}`}
            onClick={onToggleCaption}
            aria-pressed={captionOn}
            aria-label="Toggle caption, picks a new random line each tap"
          >
            <span className="icon-button-glyph" aria-hidden="true">💬</span>
            <span className="icon-button-label">CAPTION</span>
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
