import { rotatedSize, type Rotation } from "./layout";

/**
 * Portrait 3:4 sizes to try, biggest first. 3:4 matches the print window, so
 * only about 2% gets trimmed. Each is requested strictly ("exact"), because a
 * loose request let Safari answer with a near-square 2160x2316 frame that cut
 * about 18% off the sides of every print. The first size the camera really has
 * wins; the last one is the size that worked before.
 */
export const CAPTURE_SIZES = [
  { w: 2160, h: 2880 },
  { w: 1920, h: 2560 },
  { w: 1440, h: 1920 },
];

// 30fps is plenty for a preview and keeps the iPad cooler and the battery
// lasting longer on a long party night.
const FRAME_RATE = { ideal: 30, max: 30 };

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't use the camera. Open the booth in Safari.");
  }
  // Width/height are a literal pixel hint, so portrait-shaped sizes are what
  // make Safari hand back a portrait stream even when the iPad is held upright.
  let stream: MediaStream | null = null;
  for (const size of CAPTURE_SIZES) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { exact: size.w },
          height: { exact: size.h },
          frameRate: FRAME_RATE,
        },
      });
      break;
    } catch (err) {
      // "This size isn't available" means try the next one. Anything else
      // (permission denied, camera busy) is a real problem to report.
      const name = err instanceof DOMException ? err.name : "";
      if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw err;
    }
  }
  // Last resort: let the camera pick whatever it can.
  stream ??= await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1440 },
      height: { ideal: 1920 },
      frameRate: FRAME_RATE,
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

/**
 * Grabs the current frame, un-mirrored (the preview is mirrored so guests see
 * themselves like a mirror; the print shows them the way everyone else does).
 * Safari already hands back an upright frame, so no rotation by default.
 * Settings can force a 90 degree turn if a device ever comes out sideways.
 */
export function grabFrame(video: HTMLVideoElement, rotation: Rotation): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera isn't ready yet");

  const size = rotatedSize(vw, vh, rotation);
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rotation === "cw") ctx.rotate(Math.PI / 2);
  if (rotation === "ccw") ctx.rotate(-Math.PI / 2);
  ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
  return canvas;
}
