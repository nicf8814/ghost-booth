// A single "Filters" feature for the guest, merging what used to be two
// separate operator toggles/guest pickers: Horror Filters (whole-photo
// color-grade presets, effects/HorrorFilters.ts) and Poster Mode
// (effects/PosterEffect.ts's tint+vignette grades). Both are
// "grade the whole photo one way" treatments from the guest's point of
// view, and having them live in separate operator sections and separate
// on-screen pickers was one more thing to explain for no real payoff --
// merged per direction into one operator "Filters" checklist and one
// guest-facing "Filters" picker in FeatureCarousel. A guest now picks one
// style from the combined list rather than stacking a filter and a poster
// tint at once (the two effects still don't know about each other --
// applyStyle below just dispatches to whichever one owns the picked key).

import { FILTER_KEYS, FILTER_LABELS, applyHorrorFilter, type FilterKey } from "./HorrorFilters";
import { POSTER_TINTS, POSTER_TINT_LABELS, applyPosterEffect, type PosterTint } from "./PosterEffect";

export type StyleKey = FilterKey | PosterTint;

const FILTER_KEY_SET: ReadonlySet<string> = new Set(FILTER_KEYS);

export function isFilterKey(key: StyleKey): key is FilterKey {
  return FILTER_KEY_SET.has(key);
}

/** Every style the operator can choose to make available, in the order they're offered (filters first, then poster tints). */
export const STYLE_KEYS: StyleKey[] = [...FILTER_KEYS, ...POSTER_TINTS];

export const STYLE_LABELS: Record<StyleKey, string> = {
  ...FILTER_LABELS,
  ...POSTER_TINT_LABELS,
};

/**
 * Grades `source` with whichever single style `key` names -- a horror
 * filter or a poster tint, dispatched by which set the key belongs to.
 * Never throws (CLAUDE.md section 49): both underlying effects already
 * degrade to the ungraded source on their own failure paths.
 */
export async function applyStyle(source: ImageBitmap, key: StyleKey): Promise<ImageBitmap> {
  return isFilterKey(key) ? applyHorrorFilter(source, { key }) : applyPosterEffect(source, { tint: key as PosterTint });
}
