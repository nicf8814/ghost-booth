import { CameraError } from "../camera/CameraManager";
import type { FaceDetector } from "./FaceDetector";
import type { FaceModel } from "./VisionTypes";

/**
 * Main-thread handle to FaceDetectionWorker.ts. Implements the same
 * FaceDetector interface as the stubs, so the rest of the app doesn't
 * care whether detection happens locally or in a worker (CLAUDE.md
 * section 8: build an abstraction, don't couple the app to one vision
 * library/implementation).
 */
export class WorkerFaceDetector implements FaceDetector {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private initPromise: Promise<void> | null = null;

  private modelBaseUrl: string;

  constructor(modelBaseUrl: string) {
    this.modelBaseUrl = modelBaseUrl;
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.worker = new Worker(new URL("./FaceDetectionWorker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (event) => this.handleMessage(event);
      this.worker.onerror = (event) => {
        // A worker-level error (e.g. failed to parse/load) rejects every
        // pending call rather than leaving them hanging forever.
        const message = event.message || "Face detection worker crashed";
        for (const { reject } of this.pending.values()) reject(new Error(message));
        this.pending.clear();
      };

      await this.send({ type: "init", modelBaseUrl: this.modelBaseUrl });
    })();

    return this.initPromise;
  }

  async detect(image: ImageBitmap): Promise<FaceModel[]> {
    if (!this.worker) {
      // Never throw out of detect(): a vision failure must degrade to "no
      // face detected" rather than crash the booth (CLAUDE.md section 49).
      return [];
    }
    try {
      const result = await this.send<FaceModel[]>({ type: "detect", image }, [image]);
      return result;
    } catch {
      return [];
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
    for (const { reject } of this.pending.values()) reject(new CameraError("unknown", "disposed"));
    this.pending.clear();
  }

  private send<T>(
    message: { type: "init"; modelBaseUrl: string } | { type: "detect"; image: ImageBitmap },
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (!this.worker) return Promise.reject(new Error("Worker not started"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ id, ...message }, transfer);
    });
  }

  private handleMessage(
    event: MessageEvent<{ id: number; type: "ready" | "result" | "error"; faces?: FaceModel[]; message?: string }>,
  ) {
    const { id, type } = event.data;
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);

    if (type === "error") {
      entry.reject(new Error(event.data.message ?? "Face detection failed"));
    } else if (type === "result") {
      entry.resolve(event.data.faces ?? []);
    } else {
      entry.resolve(undefined);
    }
  }
}
