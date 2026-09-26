import type { PersonSegmentation } from "./VisionTypes";

/**
 * Abstraction over person/silhouette segmentation, used by the ghost engine
 * and body caricature effects (CLAUDE.md sections 14, 21). Phase 6.
 */
export interface PersonSegmenter {
  init(): Promise<void>;
  segment(image: ImageBitmap): Promise<PersonSegmentation[]>;
  dispose(): void;
}

/** Stub used until Phase 6. Ghost/body effects fall back gracefully without it. */
export class NullPersonSegmenter implements PersonSegmenter {
  async init(): Promise<void> {}

  async segment(_image: ImageBitmap): Promise<PersonSegmentation[]> {
    return [];
  }

  dispose(): void {}
}
