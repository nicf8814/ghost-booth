# Ghost Booth

A full-screen, unattended Halloween photobooth web app for iPad Safari. See `CLAUDE.md` for
the full product spec and phased build plan this project follows.

## Status: Phase 1 + 2 + 3 + 4 (nose/eyes/jaw/ears) complete (beta)

Phase 1 ("Shell"), Phase 2 ("Camera"), Phase 3 ("Vision"), and four of Phase 4's
("Caricature") deformations from `CLAUDE.md` are implemented and working:

- Vite + React + TypeScript project, with the directory structure the spec calls for.
- A single authoritative `BoothState` state machine (`src/state/BoothStateMachine.ts`),
  with a pure reducer, no scattered booleans, and 13 passing unit tests.
- Full-screen attract screen with rotating taglines.
- Hidden operator panel (tap the ghost logo — originally a 5-second hold per the spec, but
  that gesture wasn't registering reliably in iPhone Safari, so it's a plain tap for now)
  exposing every setting from the spec (countdown, auto start, caricature/ghost strength,
  preset, frame, caption mode, auto print, copies, volume, retention, debug mode) plus the
  operator test tools (test camera/capture/effect/printer, discover printer, clear
  queue/photos, reset settings).
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
- **Caricature mesh warp — nose, eyes, jaw, ears** (Phase 4, section 59's incremental build
  order): a real `CaricatureEngine` (`MeshWarpCaricatureEngine`) now runs. Each detected
  face's landmarks become a set of control points — nose contour centroid, each eye's point
  (sized from interocular distance, since the detector gives eye centroids, not contours),
  the chin (jaw contour index 8), and the two jaw-contour ends pushed outward as an
  approximate ear position (the 68-point landmark scheme has no ear landmarks at all) — and a
  radial "spherize" deformation (`MeshWarp.ts`, renderer-agnostic, unit tested) is rendered
  through a WebGL2 mesh warp (`rendering/WebGLRenderer.ts`) with a Canvas2D fallback
  (`rendering/CanvasRenderer.ts`) for when WebGL2 is unavailable or fails, per section 11. The
  warp is mathematically guaranteed not to fold the mesh (strictly monotonic radial remap) on
  top of a `SAFE_MIN/MAX_SCALE` clamp (0.5–2.4, a taste ceiling rather than a fold-safety
  limit). Every named preset now drives all four wired features (leaning toward the
  goofy/scary-witch end of the range by design — Witch, for instance, goes heavy on nose and
  eyebrows for the classic silhouette), Random/WTF mode always maxes out nose/eyes/jaw/ears
  rather than leaving them to chance, and the default Caricature Strength is 1.0 (full
  intensity) — the effect is prominent out of the box, with the operator panel's strength
  slider and preset picker there to pull it back if wanted.
- **Goofy Filter on/off toggle**: the result screen shows a "🎃 GOOFY FILTER: ON/OFF" button
  controlling the caricature effect. Both the candid original and the caricatured photo are
  kept in memory after processing, so toggling swaps which one is displayed/printed instantly,
  with no re-detection or re-warping — for a group that wants one normal photo alongside the
  silly ones. Defaults to on for every fresh capture. (This button was originally called
  "Spookify" — renamed once the ghost cameo below got its own independent toggle of that name.)
- **"My Cameo" (beta) + Spookify toggle**: an operator-only "My Cameo (beta)" checkbox (Effects
  section of the operator panel) enables the booth owner's own photo
  (`public/cameo/nic-cutout.png`, a bundled cutout, not anything captured from a guest) as a
  recurring ghostly photobomb — blurred, desaturated, brightened, and translucent
  (`src/effects/OwnerCameoEngine.ts`), the same visual language the guest ghost effect will
  eventually use. When enabled, the result screen shows a second "👻 SPOOKIFY: ON/OFF" button,
  independent of Goofy Filter — the ghost can be layered onto either the candid or the goofy
  version, in any combination of the two toggles. Both toggles are instant swaps between four
  pre-computed cached bitmaps (candid, goofy, candid+ghost, goofy+ghost), no re-processing.
  Defaults to on (ghost visible) whenever the operator has "My Cameo" enabled. A fixed
  always-available/off toggle for now; a "random chance per photo" mode is planned as a
  follow-up once this version is confirmed working.

### What is NOT yet implemented (by design — later phases per CLAUDE.md)

- **The rest of the caricature engine** (Phase 4/5) — mouth, forehead, cheeks are next, built
  the same incremental way (one `buildXControlPoint` function added to `MeshWarp.ts` at a
  time; the renderers and `CaricatureEngine` don't need to change shape for each one). Body
  caricature (Phase 4: huge head, giant shoulders, etc.) also isn't wired up yet.
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
npm run test      # 51 passing unit tests (state machine, landmark normalization, mesh warp math)
npm run build     # type-checks (tsc -b) and produces dist/
```

On an actual iPad you'll need HTTPS (camera access requires it outside localhost) and to
open the app in Safari; "Add to Home Screen" gives you the standalone/full-screen mode.

## Verified end-to-end (headless Chromium with a fake camera)

attract → tap → live camera preview → BOO → 3-2-1-BOO countdown (camera stays live behind
it) → capture → result photo displayed → Print → mock printer succeeds → back to result
(printComplete) — with zero console errors, plus the operator panel opening correctly on a
tap and print-failure recovery buttons all present.

Face detection was separately verified by feeding Chromium a real photo (containing 3 faces)
as a fake camera stream (`--use-file-for-fake-video-capture`) and confirming, with Debug Mode
on, that all 3 faces were correctly boxed and landmarked on the result screen.

The mesh warp was verified three ways: end-to-end through the same fake-camera flow (all 3
faces warp correctly, no console errors); in isolation by warping a synthetic checkerboard
test image through both the WebGL2 and Canvas2D code paths directly in a real browser — both
produce the expected smooth center-magnifying bulge with a perfectly fixed center point, and
are visually identical to each other, confirming the fallback matches the primary renderer;
and with a pixel-level diff between a Spookify-on and Spookify-off screenshot of the same
captured photo, confirming the toggle actually swaps the displayed bitmap (not just its
label) and that toggling back reproduces the original cached result.

## Live deployment

Hosted on GitHub Pages from the `gh-pages` branch. To redeploy after a change on `main`:

```bash
npm run build
# copy dist/ into a gh-pages worktree, commit, push — see git history for the exact steps
```
