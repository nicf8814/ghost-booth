import { needsRotation } from "./layout";

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser can't use the camera. Open the booth in Safari.");
  }
  // Ask for a portrait-shaped stream. Width/height are a literal pixel hint,
  // so asking for landscape here makes Safari hand back a landscape stream
  // even when the iPad is held upright.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1440 },
      height: { ideal: 1920 },
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
 * themselves like a mirror; the print shows them the way everyone else does)
 * and turned upright if the iPad hands back a sideways frame.
 */
export function grabFrame(video: HTMLVideoElement, rotateCounterClockwise: boolean): HTMLCanvasElement {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera isn't ready yet");

  const rotate = needsRotation(vw, vh, window.innerWidth, window.innerHeight);
  const canvas = document.createElement("canvas");
  canvas.width = rotate ? vh : vw;
  canvas.height = rotate ? vw : vh;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  if (rotate) ctx.rotate(rotateCounterClockwise ? -Math.PI / 2 : Math.PI / 2);
  ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
  return canvas;
}
