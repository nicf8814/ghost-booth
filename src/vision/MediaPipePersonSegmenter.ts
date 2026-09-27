import { logger } from "../utils/logger";
import type { PersonSegmenter } from "./PersonSegmentation";
import type { PersonSegmentation } from "./VisionTypes";

// MediaPipe's selfie_segmentation.js is a classic global-namespace script
// (it calls an internal `exportSymbol`-style helper to attach
// `window.SelfieSegmentation`), not a real ES module -- its own .d.ts
// suggests named exports, but bundling it with a static `import` fails at
// build time ("is not exported by..."). So it's loaded here via an
// injected <script> tag instead, same as the browser-native way MediaPipe
// document their own solutions.
interface MediaPipeResults {
  image: CanvasImageSource;
  segmentationMask: CanvasImageSource;
}
type MediaPipeResultsListener = (results: MediaPipeResults) => void;
interface MediaPipeSelfieSegmentation {
  setOptions(options: { modelSelection?: number; selfieMode?: boolean }): void;
  onResults(listener: MediaPipeResultsListener): void;
  initialize(): Promise<void>;
  send(inputs: { image: CanvasImageSource }): Promise<void>;
  close(): Promise<void>;
}
interface MediaPipeSelfieSegmentationConstructor {
  new (config: { locateFile: (file: string) => string }): MediaPipeSelfieSegmentation;
}

let scriptLoadPromise: Promise<MediaPipeSelfieSegmentationConstructor> | null = null;

/** Injects the classic <script> once and resolves with the global constructor it attaches. */
function loadSelfieSegmentationScript(assetsBaseUrl: string): Promise<MediaPipeSelfieSegmentationConstructor> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = (window as unknown as { SelfieSegmentation?: MediaPipeSelfieSegmentationConstructor })
      .SelfieSegmentation;
    if (existing) {
      resolve(existing);
      return;
    }

    const script = document.createElement("script");
    script.src = new URL("selfie_segmentation.js", assetsBaseUrl).href;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      const ctor = (window as unknown as { SelfieSegmentation?: MediaPipeSelfieSegmentationConstructor })
        .SelfieSegmentation;
      if (ctor) {
        resolve(ctor);
      } else {
        reject(new Error("selfie_segmentation.js loaded but did not attach window.SelfieSegmentation"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load selfie_segmentation.js"));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Real Phase 6 person segmentation, backing the real per-guest ghost
 * effect (CLAUDE.md sections 21-23), not the "My Cameo" owner cutout.
 *
 * MediaPipe's SelfieSegmentation JS API only accepts
 * HTMLVideoElement/HTMLImageElement/HTMLCanvasElement as input and returns
 * its mask the same way -- no OffscreenCanvas/ImageBitmap support -- so
 * unlike WorkerFaceDetector this runs on the main thread via a hidden
 * <canvas>, not in a Worker. It only runs once per capture (not every
 * frame), so this doesn't block the live camera preview.
 *
 * Model/wasm assets are bundled locally under public/segmentation/ (copied
 * from the npm package, same approach as public/models/ for face
 * detection) so segmentation works fully offline (CLAUDE.md section 44).
 */
export class MediaPipePersonSegmenter implements PersonSegmenter {
  private solution: MediaPipeSelfieSegmentation | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private assetsBaseUrl: string;
  private pendingResolve: ((r: PersonSegmentation[]) => void) | null = null;

  constructor(assetsBaseUrl: string) {
    this.assetsBaseUrl = assetsBaseUrl;
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      // No 2D context at all is exceedingly unlikely, but segment() below
      // degrades to "no segmentation" rather than crashing either way
      // (CLAUDE.md section 49), so a dummy context here is fine.
      throw new Error("2D canvas context unavailable");
    }
    this.ctx = ctx;
  }

  async init(): Promise<void> {
    const SelfieSegmentation = await loadSelfieSegmentationScript(this.assetsBaseUrl);
    const solution = new SelfieSegmentation({
      locateFile: (file) => new URL(file, this.assetsBaseUrl).href,
    });
    // modelSelection 0 ("general"): matches the .tflite file actually
    // bundled under public/segmentation/ (see the copy step in
    // PROJECT_LOG.md). Model 1 ("landscape") requires a separate
    // selfie_segmentation_landscape.tflite that isn't bundled here -- using
    // it would ask the browser for a file that doesn't exist offline.
    solution.setOptions({ modelSelection: 0 });
    solution.onResults((results) => this.handleResults(results));
    await solution.initialize();
    this.solution = solution;
    logger.warn("Person segmentation: model initialized successfully.");
  }

  async segment(image: ImageBitmap): Promise<PersonSegmentation[]> {
    if (!this.solution) {
      logger.warn("Person segmentation: model not yet initialized; Real Ghost Effect falling back to no ghost.");
      return [];
    }

    this.canvas.width = image.width;
    this.canvas.height = image.height;
    this.ctx.drawImage(image, 0, 0);

    return new Promise<PersonSegmentation[]>((resolve) => {
      // Never let a stalled/failed model call hang the capture pipeline --
      // CLAUDE.md section 49's "falls back gracefully" applies here too.
      const timeout = setTimeout(() => {
        logger.warn("Person segmentation: send() timed out after 4s; Real Ghost Effect falling back to no ghost.");
        this.pendingResolve = null;
        resolve([]);
      }, 4000);

      this.pendingResolve = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };

      this.solution!.send({ image: this.canvas }).catch((err) => {
        logger.warn("Person segmentation send() failed; Real Ghost Effect falling back to no ghost.", err);
        clearTimeout(timeout);
        this.pendingResolve = null;
        resolve([]);
      });
    });
  }

  private handleResults(results: MediaPipeResults): void {
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    if (!resolve) return;

    createImageBitmap(results.segmentationMask)
      .then((maskBitmap) => {
        resolve([
          {
            mask: maskBitmap,
            // MediaPipe returns one mask covering every person in frame
            // (not per-individual instances), so the bounding box is the
            // full frame -- callers use the mask itself for placement.
            boundingBox: { x: 0, y: 0, width: 1, height: 1 },
          },
        ]);
      })
      .catch((err) => {
        logger.warn("Failed to read segmentation mask from results; Real Ghost Effect falling back to no ghost.", err);
        resolve([]);
      });
  }

  dispose(): void {
    this.solution?.close();
    this.solution = null;
  }
}
