# Ghost Booth

A full-screen, unattended Halloween photobooth web app for iPad Safari. See `CLAUDE.md` for
the full product spec and phased build plan this project follows.

## Status: Phase 1 + 2 + 3 + 4 (step 1) complete (beta)

Phase 1 ("Shell"), Phase 2 ("Camera"), Phase 3 ("Vision"), and the first step of Phase 4
("Caricature") from `CLAUDE.md` are implemented and working:

- Vite + React + TypeScript project, with the directory structure the spec calls for.
- A single authoritative `BoothState` state machine (`src/state/BoothStateMachine.ts`),
  with a pure reducer, no scattered booleans, and 13 passing unit tests.
- Full-screen attract screen with rotating taglines.
- Hidden operator panel (press-and-hold the ghost logo for 5s) exposing every setting from
  the spec (countdown, auto start, caricature/ghost strength, preset, frame, caption mode,
  auto print, copies, volume, retention, debug mode) plus the operator test tools
  (test camera/capture/effect/printer, discover printer, clear queue/photos, reset settings).
- `getUserMedia`-based camera manager and live preview, with permission/hardware error
  handling (denied, not found, in use, unsupported) and a deliberate un-mirroring step so
  captured/printed photos are never horizontally reversed.
- Countdown → capture → (stubbed) processing → result flow, with the camera stream kept
  alive through countdown/capture instead of being torn down and restarted.
- Result screen with Print / Retake, wired to a `PrinterManager` abstraction and a mock
  printer adapter (plus `BrowserPrintAdapter`, `AirPrintAdapter`, and a `VendorPrinterAdapter`
  stub that intentionally throws until a real printer model is supplied — per the spec,
  vendor integration must wait for that).
- Print-failure recovery screen ("THE PRINTER HAS BEEN POSSESSED") with Try Again / Save
  Photo / Continue Without Printing, and the finished photo is never discarded on a print
  failure.
- Interfaces/stubs for the vision (`FaceDetector`, `PersonSegmentation`), effects
  (`CaricatureEngine`, `GhostEngine`, presets/captions), rendering (`CompositionEngine` with
  a Canvas2D implementation + WebGL2/WebGPU tier detection), and storage (`IndexedDB`,
  `SettingsStore`, `PhotoStore`) layers, so later phases plug in without changing the app
  shell.
- Idle timeout back to attract mode, settings persisted to IndexedDB.
- **Face detection / landmarks** (Phase 3): a `WorkerFaceDetector` runs
  `@vladmandic/face-api` (TinyFaceDetector + FaceLandmark68Net, tfjs CPU backend) entirely
  inside a dedicated Web Worker, off the main UI thread. Detected faces are mapped from
  face-api's 68-point landmark scheme into the spec's normalized (0.0–1.0) `FaceModel`
  (`src/vision/Face68LandmarkIndices.ts`, unit tested). Model weights are bundled in
  `public/models/` so detection works fully offline. A dev/operator debug overlay
  (`DebugLandmarkOverlay.tsx`, toggled via the operator panel's Debug Mode setting) draws
  bounding boxes, face contour, lips, nose contour, and eye/eyebrow/nose/mouth points on the
  result photo, so detection can be verified before the caricature engine is built on top of
  it. Detection never throws — a failed/slow model load or a photo with no visible face just
  falls back to 0 faces (CLAUDE.md section 49's "no face detected → plain Halloween photo"),
  it does not error out the booth.
- **Caricature mesh warp — nose enlargement** (Phase 4, first deformation per section 59): a
  real `CaricatureEngine` (`MeshWarpCaricatureEngine`) now runs. Each detected face's nose
  contour becomes a control point, and a radial "spherize" deformation (`MeshWarp.ts`,
  renderer-agnostic, unit tested) is rendered through a WebGL2 mesh warp
  (`rendering/WebGLRenderer.ts`) with a Canvas2D fallback (`rendering/CanvasRenderer.ts`) for
  when WebGL2 is unavailable or fails, per section 11. The warp is mathematically guaranteed
  not to fold the mesh (strictly monotonic radial remap) on top of the existing
  `SAFE_MIN/MAX_SCALE` clamp. The operator's Preset and Caricature Strength settings both
  feed into it now (`scaleTowardNeutral` in `Presets.ts`); a per-photo seed drives the
  "Random"/WTF preset per section 20. The warped photo — not the plain capture — is what now
  shows on the result screen and gets sent to the printer.

### What is NOT yet implemented (by design — later phases per CLAUDE.md)

- **The rest of the caricature engine** (Phase 4/5) — eyes, mouth, forehead, jaw, cheeks, and
  ears are next, built the same incremental way nose enlargement was (one
  `buildXControlPoint` function added to `MeshWarp.ts` at a time; the renderers and
  `CaricatureEngine` don't need to change shape for each one). Body caricature (Phase 4:
  huge head, giant shoulders, etc.) also isn't wired up yet.
- **Person segmentation & ghost effect** (Phases 6–7) — `PersonSegmenter`/`GhostEngine` are
  stubs; no ghosts are composited yet.
- **Full composition** (Phase 8) — backgrounds, overlays, captions, and frames aren't
  layered onto the photo yet; the result is currently the plain captured photo.
- **Real printer hardware** (Phase 9, partial) — only the mock printer and the generic
  browser/AirPrint print-dialog adapters exist. `VendorPrinterAdapter` throws on purpose;
  the exact printer model is needed before it can be implemented.
- **Auto-detection / unattended start** (part of Phase 10) — the booth currently starts on
  tap/BOO press only; face-presence auto-start is not wired up.
- **Audio** — no sound effects yet (heartbeat, shutter, boo, etc.).
- **Service worker / offline installability** — `manifest.webmanifest` exists and the app
  is a normal PWA-shaped SPA, but there's no service worker yet, so it needs network access
  to load fresh (once cached by the browser it will mostly work, but this isn't guaranteed
  offline behavior per the spec's Phase-45 requirement).
- **Web Workers for effects/composition** — face detection now runs in a worker (see
  above), but the caricature/ghost/composition stages that will follow it are still stubs,
  so they aren't off the main thread yet either.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173, camera works on localhost without HTTPS
npm run test      # 43 passing unit tests (state machine, landmark normalization, mesh warp math)
npm run build     # type-checks (tsc -b) and produces dist/
```

On an actual iPad you'll need HTTPS (camera access requires it outside localhost) and to
open the app in Safari; "Add to Home Screen" gives you the standalone/full-screen mode.

## Verified end-to-end (headless Chromium with a fake camera)

attract → tap → live camera preview → BOO → 3-2-1-BOO countdown (camera stays live behind
it) → capture → result photo displayed → Print → mock printer succeeds → back to result
(printComplete) — with zero console errors, plus the operator panel opening correctly on a
5-second hold and print-failure recovery buttons all present.

Face detection was separately verified by feeding Chromium a real photo (containing 3 faces)
as a fake camera stream (`--use-file-for-fake-video-capture`) and confirming, with Debug Mode
on, that all 3 faces were correctly boxed and landmarked on the result screen.

The nose-enlargement warp was verified two ways: end-to-end through the same fake-camera
flow with the operator panel forced to the "Goblin" preset at full strength (all 3 faces
warp correctly, no console errors), and in isolation by warping a synthetic checkerboard test
image through both the WebGL2 and Canvas2D code paths directly in a real browser — both
produce the expected smooth center-magnifying bulge with a perfectly fixed center point, and
are visually identical to each other, confirming the fallback path matches the primary one.

## Live deployment

Hosted on GitHub Pages from the `gh-pages` branch. To redeploy after a change on `main`:

```bash
npm run build
# copy dist/ into a gh-pages worktree, commit, push — see git history for the exact steps
```

**Note:** the result photo itself still looks unchanged from the plain capture — that's
expected for Phase 3. The only visible sign face detection ran is the debug overlay, which
is off by default. To see it: hold the ghost logo for 5 seconds → enable "Debug Mode" in the
operator panel → take a photo.
