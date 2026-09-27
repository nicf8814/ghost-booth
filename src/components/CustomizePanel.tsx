import type { FrameKey } from "../effects/Frames";
import { FRAME_LABELS } from "../effects/Frames";
import type { OverlayKey } from "../effects/HalloweenEffects";
import { OVERLAY_LABELS } from "../effects/Overlays";
import type { PosterTint } from "../effects/PosterEffect";
import { POSTER_TINT_LABELS } from "../effects/PosterEffect";
import type { FilterKey } from "../effects/HorrorFilters";
import { FILTER_LABELS } from "../effects/HorrorFilters";

interface CustomizePanelProps {
  onClose: () => void;

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
 * Guest-facing "pick exactly what you want on this photo" panel -- opened
 * from a CUSTOMIZE button on ResultScreen. Unlike the old single on/off
 * toggle per category, each of these lets the guest choose the *specific*
 * frame/overlays/poster-tint/filter from whatever the operator made
 * available for the event, live-previewed on the photo behind this panel
 * (every tap here calls straight back into App.tsx's applyPhotoSelection).
 *
 * Poster is a full color-grade replacement for the regular frame/overlay/
 * filter treatment (CapturePipeline.ts's composeSelectedBitmap), so those
 * three sections gray out (not hide -- the guest can still see what they'd
 * picked) whenever a poster tint is selected, with a note explaining why,
 * rather than silently doing nothing when tapped.
 */
export function CustomizePanel({
  onClose,
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
}: CustomizePanelProps) {
  const posterActive = posterTint !== null;

  return (
    <div className="customize-panel">
      <div className="customize-panel-header">
        <h2>CUSTOMIZE YOUR PHOTO</h2>
        <button className="operator-close" onClick={onClose} aria-label="Close customize panel">
          ×
        </button>
      </div>

      <div className="customize-panel-body">
        <section className={posterActive ? "customize-section customize-section-disabled" : "customize-section"}>
          <h3>Frame</h3>
          <div className="customize-chip-row">
            {frameOptions.map((key) => (
              <button
                key={key}
                type="button"
                className={`customize-chip ${frameKey === key ? "customize-chip-active" : ""}`}
                disabled={posterActive}
                onClick={() => onSelectFrame(key)}
                aria-pressed={frameKey === key}
              >
                {FRAME_LABELS[key]}
              </button>
            ))}
          </div>
        </section>

        {overlayOptions.length > 0 && (
          <section className={posterActive ? "customize-section customize-section-disabled" : "customize-section"}>
            <h3>Overlays</h3>
            <div className="customize-chip-row">
              {overlayOptions.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`customize-chip ${overlayKeys.includes(key) ? "customize-chip-active" : ""}`}
                  disabled={posterActive}
                  onClick={() => onToggleOverlay(key)}
                  aria-pressed={overlayKeys.includes(key)}
                >
                  {OVERLAY_LABELS[key]}
                </button>
              ))}
            </div>
          </section>
        )}

        {filterOptions.length > 0 && (
          <section className={posterActive ? "customize-section customize-section-disabled" : "customize-section"}>
            <h3>Filter</h3>
            <div className="customize-chip-row">
              <button
                type="button"
                className={`customize-chip ${filterKey === null ? "customize-chip-active" : ""}`}
                disabled={posterActive}
                onClick={() => onSelectFilter(null)}
                aria-pressed={filterKey === null}
              >
                Off
              </button>
              {filterOptions.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`customize-chip ${filterKey === key ? "customize-chip-active" : ""}`}
                  disabled={posterActive}
                  onClick={() => onSelectFilter(key)}
                  aria-pressed={filterKey === key}
                >
                  {FILTER_LABELS[key]}
                </button>
              ))}
            </div>
          </section>
        )}

        {(overlayOptions.length > 0 || filterOptions.length > 0) && posterTints.length > 0 && (
          <p className="customize-hint">
            Frame, Overlays, and Filter are grayed out while Poster is on -- Poster is its own full-photo look.
          </p>
        )}

        {posterTints.length > 0 && (
          <section className="customize-section">
            <h3>Poster</h3>
            <div className="customize-chip-row">
              <button
                type="button"
                className={`customize-chip ${posterTint === null ? "customize-chip-active" : ""}`}
                onClick={() => onSelectPoster(null)}
                aria-pressed={posterTint === null}
              >
                Off
              </button>
              {posterTints.map((tint) => (
                <button
                  key={tint}
                  type="button"
                  className={`customize-chip ${posterTint === tint ? "customize-chip-active" : ""}`}
                  onClick={() => onSelectPoster(tint)}
                  aria-pressed={posterTint === tint}
                >
                  {POSTER_TINT_LABELS[tint]}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <button type="button" className="customize-done" onClick={onClose}>
        DONE
      </button>
    </div>
  );
}
