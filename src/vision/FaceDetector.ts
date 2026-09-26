import type { FaceModel } from "./VisionTypes";

/**
 * Abstraction over whichever browser-compatible face detection library
 * backs the booth (MediaPipe Tasks, ONNX Runtime Web, TensorFlow.js, or a
 * native API). CLAUDE.md section 8: the architecture must not be built
 * around one vision library, so callers depend only on this interface.
 */
export interface FaceDetector {
  /** Loads models/weights. Safe to call once at booth setup time. */
  init(): Promise<void>;
  /** Detects 1-6 faces in the given frame. Never throws; returns [] on failure. */
  detect(image: ImageBitmap): Promise<FaceModel[]>;
  dispose(): void;
}

/**
 * Stub implementation used until Phase 3 wires in a real backend.
 * Always resolves to no faces detected, which the rest of the pipeline
 * must treat as "no face detected -> use normal Halloween photo"
 * (CLAUDE.md section 49), not an error.
 */
export class NullFaceDetector implements FaceDetector {
  async init(): Promise<void> {
    // no-op
  }

  async detect(_image: ImageBitmap): Promise<FaceModel[]> {
    return [];
  }

  dispose(): void {
    // no-op
  }
}
