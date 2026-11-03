import "@fontsource/creepster/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "./style.css";

import { grabFrame, startCamera } from "./camera";
import { canvasToJpeg, renderPrint } from "./frame";
import { loadFrame } from "./frames";
import { HD_SCALE } from "./layout";
import { GHOST_CHOICES, GHOST_LABELS, loadGhost, pickRandomGhost, type GhostName } from "./ghost";
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
const ghostImg = $<HTMLImageElement>("result-ghost");
const printBtn = $<HTMLButtonElement>("print");
const pop = $<HTMLDivElement>("pop");
const popImg = $<HTMLImageElement>("pop-img");

let settings: Settings = loadSettings();
let stream: MediaStream | null = null;
let photoFile: File | null = null;
let photoUrl: string | null = null;
let plainUrl: string | null = null; // ghost-less preview shown before a random ghost fades in
let ghostPreviewUrl: string | null = null; // preview with the ghost, faded in over the plain one
let shotId = 0; // bumps on every new photo and reset, so slow renders from an old photo can bail out
let idleTimer: number | undefined;
let lastFrame: HTMLCanvasElement | null = null;
let ghostIndex = 0; // index into GHOST_CHOICES
const ghostBtn = $<HTMLButtonElement>("ghost");
let busy = false;
const hdBtn = $<HTMLButtonElement>("hd");
// The 4K version is built in the background after each photo so the Save HD
// tap can share it right away (iOS wants share() to follow the tap closely).
let hdFile: Promise<File> | null = null;
let hdToken = 0; // lets a newer render cancel an older HD render that hasn't started

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
/** Random ghost: how long after the review screen appears before the ghost starts to fade in. */
const REVEAL_DELAY_MS = 450;
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
  shotId++;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  if (plainUrl) URL.revokeObjectURL(plainUrl);
  if (ghostPreviewUrl) URL.revokeObjectURL(ghostPreviewUrl);
  photoUrl = null;
  plainUrl = null;
  ghostPreviewUrl = null;
  ghostImg.classList.remove("revealed");
  ghostImg.removeAttribute("src");
  printBtn.disabled = false;
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

// The ghost that swoops by in the last second of the countdown is one of our
// created ghosts, chosen at random (never the same one twice in a row).
const SWOOP_GHOSTS: GhostName[] = ["bride", "man", "woman", "ryan", "clinton", "kristen", "kristenryan"];
const swoopUrls = new Map<GhostName, string>();
let lastSwoop: GhostName | null = null;

function pickSwoopGhost() {
  const ready = SWOOP_GHOSTS.filter((n) => swoopUrls.has(n));
  const fresh = ready.filter((n) => n !== lastSwoop);
  const pool = fresh.length ? fresh : ready;
  if (!pool.length) {
    pop.classList.remove("has-img"); // pictures not ready yet: the plain ghost swoops instead
    return;
  }
  const name = pool[Math.floor(Math.random() * pool.length)];
  lastSwoop = name;
  popImg.src = swoopUrls.get(name)!;
  pop.classList.add("has-img");
}

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
    if (n === 1) {
      // a ghost swoops by in the last second, for a real reaction in the shot
      pickSwoopGhost();
      pop.classList.remove("go");
      void pop.offsetWidth;
      pop.classList.add("go");
    }
    await sleep(1000);
  }
  countEl.textContent = "";
  pop.classList.remove("go");

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
  const shot = ++shotId;
  ghostIndex = settings.ghost === "random" ? pickRandomGhost() : 0;

  if (ghostIndex > 0) {
    // Surprise ghost: show the plain photo right away, then fade the ghost
    // version in on top after a short beat. Both are quick small previews;
    // the full-size print file is built while the ghost fades in.
    printBtn.disabled = true;
    hdBtn.hidden = true;
    ghostBtn.hidden = true;
    ghostImg.classList.remove("revealed");
    ghostImg.removeAttribute("src");
    const plain = await renderPreview(frame, []);
    if (shot !== shotId) return;
    if (plainUrl) URL.revokeObjectURL(plainUrl);
    plainUrl = plain;
    result.src = plain;
    busy = false;
    show("review");
    const shownAt = performance.now();
    const withGhost = await renderPreview(frame, GHOST_CHOICES[ghostIndex]);
    if (shot !== shotId) {
      URL.revokeObjectURL(withGhost);
      return;
    }
    if (ghostPreviewUrl) URL.revokeObjectURL(ghostPreviewUrl);
    ghostPreviewUrl = withGhost;
    ghostImg.src = withGhost;
    await ghostImg.decode().catch(() => undefined);
    await sleep(Math.max(0, REVEAL_DELAY_MS - (performance.now() - shownAt)));
    if (shot !== shotId) return;
    ghostImg.classList.add("revealed");
    try {
      await renderResult(true); // the real print file, ready before the fade finishes
    } finally {
      if (shot === shotId) printBtn.disabled = false;
    }
    return;
  }

  await renderResult();
  busy = false;
  show("review");
}

/** A quick preview JPEG of the framed photo with the given ghosts (not the print file). */
async function renderPreview(frame: HTMLCanvasElement, names: GhostName[]): Promise<string> {
  await document.fonts.ready;
  const ghosts = [];
  for (const name of names) {
    const canvas = await loadGhost(name);
    if (canvas) ghosts.push({ name, canvas });
  }
  const text = { title: settings.title, ghosts, frame: await loadFrame(), edges: settings.edges };
  // Smaller than the print: it is only the preview shown while the real one is built.
  const blob = await canvasToJpeg(renderPrint(frame, frame.width, frame.height, text, 0.75), 0.85);
  return URL.createObjectURL(blob);
}

/** Builds the framed print from the last frame (with or without the ghost). */
async function renderResult(reveal = false) {
  if (!lastFrame) return;
  const shot = shotId;
  await document.fonts.ready;
  const ghosts = [];
  for (const name of GHOST_CHOICES[ghostIndex]) {
    const canvas = await loadGhost(name);
    if (canvas) ghosts.push({ name, canvas });
  }
  const frame = lastFrame;
  const text = { title: settings.title, ghosts, frame: await loadFrame(), edges: settings.edges };
  const print = renderPrint(frame, frame.width, frame.height, text);
  const blob = await canvasToJpeg(print);
  if (shot !== shotId) return;
  // Share only the file. Extra title/text fields arrive in the share sheet as
  // separate items and the "Print to Kodak" shortcut would save them as junk.
  photoFile = new File([blob], `booth-${Date.now()}.jpg`, { type: "image/jpeg" });
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(blob);
  // In reveal mode the previews are already on screen; this is just the print file.
  if (!reveal) result.src = photoUrl;
  // Build the 4K copy while the guest looks at the preview.
  hdBtn.hidden = settings.hd !== "show";
  hdBtn.disabled = false;
  hdFile = null;
  const token = ++hdToken;
  if (settings.hd === "show") {
    const mine = new Promise<File>((resolve, reject) => {
      window.setTimeout(() => {
        if (token !== hdToken) return reject(new Error("replaced by a newer render"));
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
    edges: (form.elements.namedItem("edges") as HTMLSelectElement).value as Settings["edges"],
  };
  saveSettings(settings);
  if (TIMER_CHOICES.includes(settings.countdown)) setTimer(settings.countdown);
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
loadFrame(); // warm up
for (const names of GHOST_CHOICES) for (const n of names) loadGhost(n); // warm up
// make a small picture of each ghost for the countdown swoop
for (const name of SWOOP_GHOSTS) {
  loadGhost(name).then((canvas) =>
    canvas?.toBlob((blob) => {
      if (blob) swoopUrls.set(name, URL.createObjectURL(blob));
    }, "image/png"),
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
