import { useState } from "react";
import type { StyleKey } from "../effects/Styles";
import { STYLE_LABELS } from "../effects/Styles";
import type { CameoKey } from "../effects/Cameos";
import { CAMEO_LABELS } from "../effects/Cameos";

interface FeatureCarouselProps {
  /** The merged Filters list (horror filters + poster tints, see effects/Styles.ts) the operator made available for this event. */
  filterOptions: StyleKey[];
  styleKey: StyleKey | null;
  onSelectStyle: (key: StyleKey | null) => void;

  ghostOptions: CameoKey[];
  ghostKey: CameoKey | null;
  onSelectGhost: (key: CameoKey | null) => void;
}

interface Chip {
  key: string;
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

interface Category {
  key: "filters" | "ghost";
  label: string;
  chips: Chip[];
  hasSelection: boolean;
}

/**
 * Guest-facing "pick exactly what you want on this photo" carousel --
 * embedded directly in ResultScreen (not a separate screen/modal) so the
 * whole flow -- see the photo, pick features, print -- stays on one
 * screen. A small tab strip lets the guest jump between Ghost/Filters,
 * with a horizontally scrollable row of chip options for whichever one is
 * active; every tap calls straight back into App.tsx's applyPhotoSelection
 * so the photo behind this carousel updates live. Filters merges what used
 * to be two separate categories (Filter/Poster) into one, per direction --
 * see effects/Styles.ts.
 */
export function FeatureCarousel({
  filterOptions,
  styleKey,
  onSelectStyle,
  ghostOptions,
  ghostKey,
  onSelectGhost,
}: FeatureCarouselProps) {
  const categories: Category[] = [];

  if (ghostOptions.length > 0) {
    categories.push({
      key: "ghost",
      label: "Ghost",
      hasSelection: ghostKey !== null,
      chips: [
        {
          key: "off",
          label: "Off",
          active: ghostKey === null,
          disabled: false,
          onClick: () => onSelectGhost(null),
        },
        ...ghostOptions.map((key) => ({
          key,
          label: CAMEO_LABELS[key],
          active: ghostKey === key,
          disabled: false,
          onClick: () => onSelectGhost(key),
        })),
      ],
    });
  }

  if (filterOptions.length > 0) {
    categories.push({
      key: "filters",
      label: "Filters",
      hasSelection: styleKey !== null,
      chips: [
        {
          key: "off",
          label: "Off",
          active: styleKey === null,
          disabled: false,
          onClick: () => onSelectStyle(null),
        },
        ...filterOptions.map((key) => ({
          key,
          label: STYLE_LABELS[key],
          active: styleKey === key,
          disabled: false,
          onClick: () => onSelectStyle(key),
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
