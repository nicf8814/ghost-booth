import { logger } from "../utils/logger";

export type CameraErrorKind =
  | "permission-denied"
  | "not-found"
  | "in-use"
  | "unsupported"
  | "unknown";

export class CameraError extends Error {
  kind: CameraErrorKind;
  constructor(kind: CameraErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "CameraError";
  }
}

export interface CameraManager {
  start(): Promise<void>;
  stop(): void;
  getStream(): MediaStream | null;
  captureFrame(): Promise<ImageBitmap>;
}

/**
 * This booth is physically mounted in PORTRAIT orientation (confirmed by
 * the operator; the connected Kodak Mini 2 Retro only ever outputs portrait
 * 2x3 prints -- see printing/PrintLayout.ts). getUserMedia's width/height
 * constraints do NOT auto-swap for device orientation -- they're a literal
 * pixel-dimension hint -- so a fixed { ideal: 1920x1080 } request biases
 * Safari toward handing back a LANDSCAPE-shaped stream even while the iPad
 * itself is mounted portrait. That landscape-shaped master bitmap then
 * disagreed with Kodak's fixed portrait 2x3 output, forcing the Kodak app
 * to silently re-crop the print in a way our own crop couldn't account
 * for (see PROJECT_LOG.md -- this was the real cause of captions going
 * missing from Kodak prints, not just the crop-anchoring bug fixed
 * earlier). Requesting portrait-shaped ideal dimensions here makes the
 * browser's own stream match the booth's actual mount, so every later
 * stage (composition, caption, print crop) already works in portrait
 * without needing a rotation step.
 */
function defaultCameraConstraints(): MediaStreamConstraints {
  return {
    video: {
      facingMode: "user",
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    },
    audio: false,
  };
}

/**
 * Wraps getUserMedia + an offscreen <video> element used purely to decode
 * the stream for capture. CLAUDE.md section 6: capture uses canvas/
 * ImageBitmap, not repeated low-quality screenshots of the visible video
 * element.
 */
export class GetUserMediaCameraManager implements CameraManager {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private constraints: MediaStreamConstraints;

  constructor(constraints: MediaStreamConstraints = defaultCameraConstraints()) {
    this.constraints = constraints;
  }

  async start(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError("unsupported", "getUserMedia is not supported in this browser");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
    } catch (err) {
      throw toCameraError(err);
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = this.stream;
    await video.play().catch((err) => {
      logger.warn("video.play() rejected", err);
    });
    this.videoEl = video;
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  /** Exposes the backing <video> element so a <CameraPreview> can attach it for live display. */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this.videoEl) {
      throw new CameraError("unknown", "Camera is not started");
    }
    const { videoWidth, videoHeight } = this.videoEl;
    if (!videoWidth || !videoHeight) {
      throw new CameraError("unknown", "Video stream has no frame data yet");
    }
    return createImageBitmap(this.videoEl, {
      // Capture at full native resolution; downscaling happens later,
      // deliberately, rather than by accident here (CLAUDE.md section 7).
    });
  }
}

function toCameraError(err: unknown): CameraError {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return new CameraError("permission-denied", "Camera permission was denied");
      case "NotFoundError":
        return new CameraError("not-found", "No camera was found on this device");
      case "NotReadableError":
      case "TrackStartError":
        return new CameraError("in-use", "Camera is already in use by another application");
      default:
        return new CameraError("unknown", err.message);
    }
  }
  return new CameraError("unknown", err instanceof Error ? err.message : String(err));
}
