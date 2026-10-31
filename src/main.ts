import "@fontsource/creepster/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "./style.css";

import { grabFrame, startCamera } from "./camera";
import { canvasToJpeg, renderPrint } from "./frame";
import { loadFrame } from "./frames";
import { HD_SCALE } from "./layout";
import { GHOST_CHOICES, GHOST_LABELS, loadGhost } from "./ghost";
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
let lastFrame: HTMLCanvasElement | null = null;
let ghostIndex = 0; // index into GHOST_CHOICES
const ghostBtn = $<HTMLButtonElement>("ghost");
let busy = false;
const hdBtn = $<HTMLButtonElement>("hd");
// The 4K version is built in the background after each photo so the Save HD
// tap can share it right away (iOS wants share() to follow the tap closely).
let hdFile: Promise<File> | null = null;

// Timer choices on the landing page. The settings value is just the default.
const TIMER_CHOICES = [3, 7, 10];
const timerChips = Array.from(document.querySelectorAll<HTMLButtonElement>(".timer-chip"));
let timerSeconds = TIMER_CHOICES.includes(settings.countdown) ? settings.countdown : TIMER_CHOICES[0];

function setTimer(seconds: number) {
  timerSeconds = seconds;
  for (const chip of timerChips) {
    chip.setAttribute("aria-checked", String(Number(chip.dataset.seconds) === seconds));
  }
}
setTimer(timerSeconds);
for (const chip of timerChips) {
  chip.addEventListener("click", () => setTimer(Number(chip.dataset.seconds)));
}

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
  hdFile = null;
  lastFrame = null;
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
  for (let n = timerSeconds; n > 0; n--) {
    countEl.textContent = String(n);
    countEl.classList.remove("tick");
    void countEl.offsetWidth; // restart the animation
    countEl.classList.add("tick");
    await sleep(1000);
  }
  countEl.textContent = "";

  let frame: HTMLCanvasElement;
  try {
    frame = grabFrame(video, settings.rotation);
  } catch (err) {
    busy = false;
    showError(err instanceof Error ? err.message : "Couldn't take the photo.");
    return;
  }
  flash.classList.remove("go");
  void flash.offsetWidth;
  flash.classList.add("go");

  lastFrame = frame;
  ghostIndex =
    settings.ghost === "random" && Math.random() < 0.5
      ? 1 + Math.floor(Math.random() * (GHOST_CHOICES.length - 1))
      : 0;
  await renderResult();
  busy = false;
  show("review");
}

/** Builds the framed print from the last frame (with or without the ghost). */
async function renderResult() {
  if (!lastFrame) return;
  await document.fonts.ready;
  const ghosts = [];
  for (const name of GHOST_CHOICES[ghostIndex]) {
    const canvas = await loadGhost(name);
    if (canvas) ghosts.push({ name, canvas });
  }
  const frame = lastFrame;
  const text = { title: settings.title, ghosts, frame: await loadFrame(settings.frame), edges: settings.edges };
  const print = renderPrint(frame, frame.width, frame.height, text);
  const blob = await canvasToJpeg(print);
  // Share only the file. Extra title/text fields arrive in the share sheet as
  // separate items and the "Print to Kodak" shortcut would save them as junk.
  photoFile = new File([blob], `booth-${Date.now()}.jpg`, { type: "image/jpeg" });
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(blob);
  result.src = photoUrl;
  // Build the 4K copy while the guest looks at the preview.
  hdBtn.hidden = settings.hd !== "show";
  hdBtn.disabled = false;
  hdFile = null;
  if (settings.hd === "show") {
    const mine = new Promise<File>((resolve, reject) => {
      window.setTimeout(() => {
        const big = renderPrint(frame, frame.width, frame.height, text, HD_SCALE);
        canvasToJpeg(big, 0.95).then(
          (b) => resolve(new File([b], `booth-hd-${Date.now()}.jpg`, { type: "image/jpeg" })),
          reject,
        );
      }, 50);
    });
    mine.catch(() => undefined);
    hdFile = mine;
  }
  ghostBtn.hidden = settings.ghost !== "toggle";
  ghostBtn.setAttribute("aria-pressed", String(ghostIndex > 0));
  ghostBtn.querySelector("span")!.textContent = GHOST_LABELS[ghostIndex];
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

async function saveHd() {
  const pending = hdFile;
  if (!pending) return;
  hdBtn.disabled = true;
  try {
    const file = await pending;
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      showError("Couldn't save the HD photo. Try again.");
      return;
    }
  }
  hdBtn.disabled = false;
  show("review"); // someone is still here, restart the idle timer
}

// ---------- Hidden settings (press and hold the title for 2 seconds) ----------

function openSettings() {
  const form = settingsDialog.querySelector("form")!;
  (form.elements.namedItem("title") as HTMLInputElement).value = settings.title;
  (form.elements.namedItem("countdown") as HTMLSelectElement).value = String(settings.countdown);
  (form.elements.namedItem("rotation") as HTMLSelectElement).value = settings.rotation;
  (form.elements.namedItem("ghost") as HTMLSelectElement).value = settings.ghost;
  (form.elements.namedItem("hd") as HTMLSelectElement).value = settings.hd;
  (form.elements.namedItem("frame") as HTMLSelectElement).value = settings.frame;
  (form.elements.namedItem("edges") as HTMLSelectElement).value = settings.edges;
  const info = $<HTMLParagraphElement>("cam-info");
  info.textContent = video.videoWidth
    ? `Camera is sending ${video.videoWidth} x ${video.videoHeight}`
    : "Camera not running";
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
    countdown: Number((form.elements.namedItem("countdown") as HTMLSelectElement).value) || 3,    rotation: (form.elements.namedItem("rotation") as HTMLSelectElement).value as Settings["rotation"],
    ghost: (form.elements.namedItem("ghost") as HTMLSelectElement).value as Settings["ghost"],
    hd: (form.elements.namedItem("hd") as HTMLSelectElement).value as Settings["hd"],
    frame: (form.elements.namedItem("frame") as HTMLSelectElement).value as Settings["frame"],
    edges: (form.elements.namedItem("edges") as HTMLSelectElement).value as Settings["edges"],
  };
  saveSettings(settings);
  if (TIMER_CHOICES.includes(settings.countdown)) setTimer(settings.countdown);
  loadFrame(settings.frame); // warm up so the next photo isn't delayed
  showTitle();
});

let holdTimer: number | undefined;
$("settings-btn").addEventListener("click", openSettings);
const title = $<HTMLHeadingElement>("title");
function showTitle() {
  title.textContent = settings.title;
  document.title = settings.title;
}
showTitle();
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
hdBtn.addEventListener("click", saveHd);
ghostBtn.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  ghostIndex = (ghostIndex + 1) % GHOST_CHOICES.length;
  await renderResult();
  busy = false;
  // reset the idle timer since someone is still here
  show("review");
});
$("done").addEventListener("click", reset);
$("retry").addEventListener("click", () => {
  reset();
  ensureCamera().catch((err) => showError(cameraErrorMessage(err)));
});

ensureCamera().catch((err) => showError(cameraErrorMessage(err)));
loadFrame(settings.frame); // warm up
for (const names of GHOST_CHOICES) for (const n of names) loadGhost(n); // warm up

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
