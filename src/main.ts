import "@fontsource/creepster/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "./style.css";

import { grabFrame, startCamera } from "./camera";
import { canvasToJpeg, renderPrint } from "./frame";
import { loadSettings, saveSettings, type Settings } from "./settings";

type Screen = "attract" | "countdown" | "review" | "sent" | "error";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const app = $<HTMLElement>("app");
const video = $<HTMLVideoElement>("preview");
const countEl = $<HTMLDivElement>("count");
const flash = $<HTMLDivElement>("flash");
const result = $<HTMLImageElement>("result");
const errorText = $<HTMLParagraphElement>("error-text");
const settingsDialog = $<HTMLDialogElement>("settings");

let settings: Settings = loadSettings();
let stream: MediaStream | null = null;
let photoFile: File | null = null;
let photoUrl: string | null = null;
let idleTimer: number | undefined;
let busy = false;

const REVIEW_IDLE_MS = 90_000;
const SENT_SHOW_MS = 2500;

function show(screen: Screen) {
  app.dataset.screen = screen;
  window.clearTimeout(idleTimer);
  if (screen === "review") idleTimer = window.setTimeout(reset, REVIEW_IDLE_MS);
}

function showError(message: string) {
  errorText.textContent = message;
  show("error");
}

function reset() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  photoFile = null;
  result.removeAttribute("src");
  busy = false;
  show("attract");
}

// ---------- Camera ----------

function cameraIsLive() {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");
}

async function ensureCamera() {
  if (cameraIsLive()) {
    if (video.paused) await video.play().catch(() => undefined);
    return;
  }
  stream?.getTracks().forEach((t) => t.stop());
  stream = await startCamera(video);
}

// iOS often stops the camera when you switch to another app (like the Kodak
// app to print). Bring it back as soon as the booth is visible again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  requestWakeLock();
  if (app.dataset.screen === "sent") reset();
  ensureCamera().catch(() => undefined);
});

// ---------- Keep the screen awake ----------

let wakeLock: { release(): Promise<void> } | null = null;
async function requestWakeLock() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (wl && !wakeLock) {
      wakeLock = await wl.request("screen");
      (wakeLock as unknown as EventTarget).addEventListener?.("release", () => (wakeLock = null));
    }
  } catch {
    wakeLock = null;
  }
}

// ---------- Taking the photo ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function takePhoto() {
  if (busy) return;
  busy = true;
  requestWakeLock();
  try {
    await ensureCamera();
  } catch (err) {
    busy = false;
    showError(cameraErrorMessage(err));
    return;
  }

  show("countdown");
  for (let n = settings.countdown; n > 0; n--) {
    countEl.textContent = String(n);
    countEl.classList.remove("tick");
    void countEl.offsetWidth; // restart the animation
    countEl.classList.add("tick");
    await sleep(1000);
  }
  countEl.textContent = "";

  let frame: HTMLCanvasElement;
  try {
    frame = grabFrame(video, settings.rotateCounterClockwise);
  } catch (err) {
    busy = false;
    showError(err instanceof Error ? err.message : "Couldn't take the photo.");
    return;
  }
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");

  await document.fonts.ready;
  const print = renderPrint(frame, frame.width, frame.height, {
    title: settings.title,
    subtitle: settings.subtitle,
  });
  const blob = await canvasToJpeg(print);
  // Share only the file. Extra title/text fields arrive in the share sheet as
  // separate items and the "Print to Kodak" shortcut would save them as junk.
  photoFile = new File([blob], `booth-${Date.now()}.jpg`, { type: "image/jpeg" });
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(blob);
  result.src = photoUrl;
  busy = false;
  show("review");
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") {
    return "Camera access is blocked. In Settings > Safari > Camera, choose Allow, then try again.";
  }
  if (name === "NotFoundError") return "No camera found on this device.";
  if (name === "NotReadableError") return "The camera is busy in another app. Close it and try again.";
  return err instanceof Error ? err.message : "Couldn't start the camera.";
}

// ---------- Printing ----------

async function printPhoto() {
  if (!photoFile) return;
  const files = [photoFile];
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      show("sent");
      window.setTimeout(() => {
        if (app.dataset.screen === "sent") reset();
      }, SENT_SHOW_MS);
    } catch (err) {
      // Closing the share sheet without picking anything isn't an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      showError("Couldn't open the share sheet. Try Print again.");
    }
    return;
  }
  // Desktop browsers without file sharing: just download the photo.
  const a = document.createElement("a");
  a.href = photoUrl!;
  a.download = photoFile.name;
  a.click();
  show("sent");
  window.setTimeout(reset, SENT_SHOW_MS);
}

// ---------- Hidden settings (press and hold the title for 2 seconds) ----------

function openSettings() {
  const form = settingsDialog.querySelector("form")!;
  (form.elements.namedItem("title") as HTMLInputElement).value = settings.title;
  (form.elements.namedItem("subtitle") as HTMLInputElement).value = settings.subtitle;
  (form.elements.namedItem("countdown") as HTMLSelectElement).value = String(settings.countdown);
  (form.elements.namedItem("rotateCounterClockwise") as HTMLInputElement).checked = settings.rotateCounterClockwise;
  settingsDialog.showModal();
}

settingsDialog.addEventListener("close", () => {
  const form = settingsDialog.querySelector("form")!;
  if (settingsDialog.returnValue === "reload") {
    location.reload();
    return;
  }
  if (settingsDialog.returnValue !== "save") return;
  settings = {
    title: (form.elements.namedItem("title") as HTMLInputElement).value.trim() || settings.title,
    subtitle: (form.elements.namedItem("subtitle") as HTMLInputElement).value.trim(),
    countdown: Number((form.elements.namedItem("countdown") as HTMLSelectElement).value) || 3,
    rotateCounterClockwise: (form.elements.namedItem("rotateCounterClockwise") as HTMLInputElement).checked,
  };
  saveSettings(settings);
});

let holdTimer: number | undefined;
const title = $<HTMLHeadingElement>("title");
title.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  holdTimer = window.setTimeout(openSettings, 2000);
});
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
  title.addEventListener(ev, () => window.clearTimeout(holdTimer));
}

// ---------- Wiring ----------

// Anywhere on the attract screen starts a photo, not just the button.
app.addEventListener("click", (e) => {
  if (app.dataset.screen !== "attract") return;
  const target = e.target as HTMLElement;
  if (target.closest("#title")) return;
  // Done/Retake/Try again switch to this screen mid-click; don't let that
  // same click start a new photo.
  const button = target.closest("button");
  if (button && button.id !== "start") return;
  takePhoto();
});
$("retake").addEventListener("click", () => {
  reset();
  takePhoto();
});
$("print").addEventListener("click", printPhoto);
$("done").addEventListener("click", reset);
$("retry").addEventListener("click", () => {
  reset();
  ensureCamera().catch((err) => showError(cameraErrorMessage(err)));
});

ensureCamera().catch((err) => showError(cameraErrorMessage(err)));

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
