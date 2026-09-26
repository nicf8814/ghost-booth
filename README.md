# Ghost Booth

A full-screen, unattended Halloween photobooth web app for iPad Safari. See `CLAUDE.md` for
the full product spec and phased build plan this project follows.

## Status: Phase 1 + Phase 2 complete (beta)

Phase 1 ("Shell") and Phase 2 ("Camera") from `CLAUDE.md` are implemented and working:

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

### What is NOT yet implemented (by design — later phases per CLAUDE.md)

- **Face detection / landmarks** (Phase 3) — `FaceDetector` currently returns no faces, so
  every photo takes the graceful "no face detected → plain Halloween photo" path.
- **Caricature mesh warp** (Phases 4–5) — `CaricatureEngine` is a pass-through stub.
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
- **Web Workers** — face/effect/composition processing isn't off the main thread yet; not
  urgent while those stages are stubs, but required once real vision/effects work lands so
  the UI doesn't freeze.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173, camera works on localhost without HTTPS
npm run test      # 13 passing unit tests for the state machine
npm run build     # type-checks (tsc -b) and produces dist/
```

On an actual iPad you'll need HTTPS (camera access requires it outside localhost) and to
open the app in Safari; "Add to Home Screen" gives you the standalone/full-screen mode.

## Verified end-to-end (headless Chromium with a fake camera)

attract → tap → live camera preview → BOO → 3-2-1-BOO countdown (camera stays live behind
it) → capture → result photo displayed → Print → mock printer succeeds → back to result
(printComplete) — with zero console errors, plus the operator panel opening correctly on a
5-second hold and print-failure recovery buttons all present.
