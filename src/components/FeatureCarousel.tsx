import { useState } from "react";
import type { FrameKey } from "../effects/Frames";
import { FRAME_LABELS } from "../effects/Frames";
import type { OverlayKey } from "../effects/HalloweenEffects";
import { OVERLAY_LABELS } from "../effects/Overlays";
import type { PosterTint } from "../effects/PosterEffect";
import { POSTER_TINT_LABELS } from "../effects/PosterEffect";
import type { FilterKey } from "../effects/HorrorFilters";
import { FILTER_LABELS } from "../effects/HorrorFilters";

interface FeatureCarouselProps {
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

interface Chip {
  key: string;
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

interface Category {
  key: "frame" | "overlays" | "filter" | "poster";
  label: string;
  chips: Chip[];
  hasSelection: boolean;
  /** Whether this category's chips are currently grayed out because a
   * poster tint is picked (Poster is a full-photo grade that replaces
   * the regular frame/overlay/filter composition path entirely --
   * CapturePipeline.ts's composeSelectedBitmap). */
  disabledByPoster: boolean;
}

/**
 * Guest-facing "pick exactly what you want on this photo" carousel --
 * embedded directly in ResultScreen (not a separate screen/modal) so the
 * whole flow -- see the photo, pick features, print -- stays on one
 * screen. A small tab strip lets the guest jump between Frame/Overlays/
 * Filter/Poster, with a horizontally scrollable row of chip options for
 * whichever one is active; every tap calls straight back into App.tsx's
 * applyPhotoSelection so the photo behind this carousel updates live.
 *
 * Poster is a full color-grade replacement for the regular frame/overlay/
 * filter treatment, so those three categories' chips gray out (not hide --
 * the guest can still see what they'd picked) whenever a poster tint is
 * selected, with a short note explaining why, rather than silently doing
 * nothing when tapped.
 */
export function FeatureCarousel({
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
}: FeatureCarouselProps) {
  const posterActive = posterTint !== null;

  const categories: Category[] = [];

  if (frameOptions.length > 0) {
    categories.push({
      key: "frame",
      label: "Frame",
      hasSelection: frameKey !== "none",
      disabledByPoster: posterActive,
      chips: frameOptions.map((key) => ({
        key,
        label: FRAME_LABELS[key],
        active: frameKey === key,
        disabled: posterActive,
        onClick: () => onSelectFrame(key),
      })),
    });
  }

  if (overlayOptions.length > 0) {
    categories.push({
      key: "overlays",
      label: "Overlays",
      hasSelection: overlayKeys.length > 0,
      disabledByPoster: posterActive,
      chips: overlayOptions.map((key) => ({
        key,
        label: OVERLAY_LABELS[key],
        active: overlayKeys.includes(key),
        disabled: posterActive,
        onClick: () => onToggleOverlay(key),
      })),
    });
  }

  if (filterOptions.length > 0) {
    categories.push({
      key: "filter",
      label: "Filter",
      hasSelection: filterKey !== null,
      disabledByPoster: posterActive,
      chips: [
        {
          key: "off",
          label: "Off",
          active: filterKey === null,
          disabled: posterActive,
          onClick: () => onSelectFilter(null),
        },
        ...filterOptions.map((key) => ({
          key,
          label: FILTER_LABELS[key],
          active: filterKey === key,
          disabled: posterActive,
          onClick: () => onSelectFilter(key),
        })),
      ],
    });
  }

  if (posterTints.length > 0) {
    categories.push({
      key: "poster",
      label: "Poster",
      hasSelection: posterActive,
      disabledByPoster: false,
      chips: [
        {
          key: "off",
          label: "Off",
          active: posterTint === null,
          disabled: false,
          onClick: () => onSelectPoster(null),
        },
        ...posterTints.map((tint) => ({
          key: tint,
          label: POSTER_TINT_LABELS[tint],
          active: posterTint === tint,
          disabled: false,
          onClick: () => onSelectPoster(tint),
        })),
      ],
    });
  }

  const [activeIndex, setActiveIndex] = useState(0);

  if (categories.length === 0) return null;

  const safeIndex = Math.min(activeIndex, categories.length - 1);
  const active = categories[safeIndex];

  const goTo = (index: number) => {
    setActiveIndex((index + categories.length) % categories.length);
  };

  return (
    <div className="feature-carousel">
      <div className="feature-carousel-tabs">
        <button
          type="button"
          className="feature-carousel-arrow"
          onClick={() => goTo(safeIndex - 1)}
          aria-label="Previous category"
        >
          ‹
        </button>
        <div className="feature-carousel-tab-list">
          {categories.map((cat, i) => (
            <button
              key={cat.key}
              type="button"
              className={`feature-carousel-tab ${i === safeIndex ? "feature-carousel-tab-active" : ""}`}
              onClick={() => setActiveIndex(i)}
              aria-pressed={i === safeIndex}
            >
              {cat.label}
              {cat.hasSelection && <span className="feature-carousel-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="feature-carousel-arrow"
          onClick={() => goTo(safeIndex + 1)}
          aria-label="Next category"
        >
          ›
        </button>
      </div>

      {active.disabledByPoster && (
        <p className="feature-carousel-hint">Off while Poster is on -- Poster is its own full-photo look.</p>
      )}

      <div className="feature-carousel-chip-row">
        {active.chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`feature-carousel-chip ${chip.active ? "feature-carousel-chip-active" : ""}`}
            disabled={chip.disabled}
            onClick={chip.onClick}
            aria-pressed={chip.active}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
