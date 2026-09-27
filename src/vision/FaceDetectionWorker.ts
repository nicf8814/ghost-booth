// Runs entirely inside a dedicated Web Worker (CLAUDE.md section 30/58:
// "camera capture -> ImageBitmap -> worker -> face detection -> landmark
// visualization"). Keeping face-api/tfjs off the main thread means a
// detection pass never blocks the UI, even though this model is small
// enough to be fast.
//
// Uses the 'cpu' tfjs backend deliberately: it needs no WebGL context and
// no <canvas> element beyond what OffscreenCanvas already provides, which
// makes it reliably available inside a worker (WebGL-in-worker support is
// spottier across Safari/iPadOS versions than plain OffscreenCanvas 2D).
// If profiling on real hardware (CLAUDE.md section 53) shows this backend
// is too slow, swapping to the 'wasm' backend is a drop-in change here —
// nothing outside this file needs to know.

import "@tensorflow/tfjs-backend-cpu";
import * as faceapi from "@vladmandic/face-api";
import type * as TfCore from "@tensorflow/tfjs-core";
import { landmarks68ToFaceModel } from "./Face68LandmarkIndices";
import type { FaceModel } from "./VisionTypes";

// face-api re-exports its own bundled copy of tfjs-core as `faceapi.tf` so
// every net it loads runs through that exact instance — using it (rather
// than a separately-imported @tensorflow/tfjs-core) is required for
// setBackend to actually affect face-api's computation. Its own .d.ts
// under-types this export, so we cast to the real tfjs-core types here
// purely for type-checking; the runtime object is unchanged.
const tf = faceapi.tf as unknown as typeof TfCore;

// face-api's environment auto-detection (env.initialize(), run at module
// load) checks for `window`/`document`/HTMLCanvasElement/etc. to decide
// it's running in a browser. None of those exist in a Worker's global
// scope (only `self`), so that check silently fails and every later call
// throws "getEnv - environment is not defined". We only ever hand it
// tensors directly (never an <img>/<canvas>/<video>), so a minimal
// worker-safe environment — real fetch, OffscreenCanvas standing in for
// Canvas, and no-op stand-ins for the element constructors we never
// actually construct — is enough for loadFromUri() and detectAllFaces()
// to work.
faceapi.env.setEnv({
  Canvas: OffscreenCanvas as unknown as typeof HTMLCanvasElement,
  CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D as unknown as typeof CanvasRenderingContext2D,
  Image: class {} as unknown as typeof HTMLImageElement,
  ImageData,
  Video: class {} as unknown as typeof HTMLVideoElement,
  createCanvasElement: () => new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement,
  createImageElement: () => {
    throw new Error("Image elements are not available in a worker");
  },
  createVideoElement: () => {
    throw new Error("Video elements are not available in a worker");
  },
  fetch: (url: string, init?: RequestInit) => self.fetch(url, init),
  readFile: () => {
    throw new Error("readFile is not available in a worker");
  },
});

type WorkerRequest =
  | { id: number; type: "init"; modelBaseUrl: string }
  | { id: number; type: "detect"; image: ImageBitmap };

type WorkerResponse =
  | { id: number; type: "ready" }
  | { id: number; type: "result"; faces: FaceModel[] }
  | { id: number; type: "error"; message: string };

let modelsLoaded = false;

async function ensureModelsLoaded(modelBaseUrl: string): Promise<void> {
  if (modelsLoaded) return;
  await tf.setBackend("cpu");
  await tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(modelBaseUrl),
    faceapi.nets.faceLandmark68Net.loadFromUri(modelBaseUrl),
  ]);
  modelsLoaded = true;
}

async function detectFaces(image: ImageBitmap): Promise<FaceModel[]> {
  const tensor = tf.browser.fromPixels(image);
  try {
    // `tensor` is a real Tensor3D at runtime (created via face-api's own tf
    // instance), but its type here comes from our separately-imported
    // @tensorflow/tfjs-core typings (used above only for setBackend/ready
    // typing), which TS treats as a structurally-incompatible nominal type
    // versus face-api's own bundled Tensor3D type. Cast through `unknown`
    // to cross that purely-type-level gap.
    const detections = await faceapi
      .detectAllFaces(
        tensor as unknown as faceapi.tf.Tensor3D,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }),
      )
      .withFaceLandmarks();

    return detections.map((d) =>
      landmarks68ToFaceModel(
        { positions: d.landmarks.positions, box: d.detection.box },
        image.width,
        image.height,
      ),
    );
  } finally {
    tensor.dispose();
    image.close();
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === "init") {
      await ensureModelsLoaded(msg.modelBaseUrl);
      postMessage({ id: msg.id, type: "ready" } satisfies WorkerResponse);
      return;
    }
    if (msg.type === "detect") {
      const faces = await detectFaces(msg.image);
      postMessage({ id: msg.id, type: "result", faces } satisfies WorkerResponse);
      return;
    }
  } catch (err) {
    postMessage({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
