# Ghost Booth — Project Log

Running archive of what's been built, key decisions, and where things stand. Kept
up to date so a conversation about this project can be compressed/restarted from
here without losing context. `CLAUDE.md` is the spec this all follows; this file
is the "what actually happened" log on top of it.

Repo: `nicf8814/ghost-booth` (GitHub). Live: GitHub Pages from the `gh-pages`
branch (root of that branch = `dist/` build output). `main` branch has the
source.

## Status at a glance

Phases complete (per `CLAUDE.md`'s numbering):
- **Phase 1 (Shell)** — done
- **Phase 2 (Camera)** — done
- **Phase 3 (Vision)** — done (face detection + landmarks)
- **Phase 4 (Caricature)** — partial: nose, eyes, jaw, ears wired up. Mouth,
  forehead, cheeks, body caricature not yet built.
- **Phase 5 (GPU)** — effectively done as a side effect of Phase 4 (WebGL2 mesh
  warp + Canvas2D fallback already exist and are generic, not nose-specific).
- **Phase 6 (Segmentation)**, **Phase 7 (Ghost)**, **Phase 8 (Composition)** —
  not started. **This is the current focus.**
- **Phase 9 (Printing)** — printer model is now known: **Kodak Mini 2 Retro
  (black), confirmed purchase.** It's Bluetooth-only with no AirPrint and no
  published SDK, and Safari has no Web Bluetooth API at all (confirmed via
  research, no roadmap from WebKit) -- so direct in-browser printing isn't
  possible regardless of the printer's protocol. `ShareSheetPrinterAdapter`
  (opens the native iOS share sheet with the photo attached, operator picks
  the Kodak Photo Printer app, one tap) is built and is now the default
  printer adapter (`defaultSettings.printerAdapter: "shareSheet"`). **Not
  yet verified against the real device** -- the one open question is
  whether the Kodak Photo Printer app actually accepts a Share Sheet
  hand-off (no evidence found either way in research; confirmed NOT
  supported for HP Sprocket by an HP support rep, as a data point, but
  that doesn't tell us about Kodak specifically). Needs a hands-on test
  once the printer is paired to the iPad.
  - Explored and shelved for now: Raspberry Pi Bluetooth-protocol
    reverse-engineering (would enable a genuinely zero-tap print, real
    project with unbounded time cost, requires an Android phone for the
    HCI snoop-log capture); a used/renewed Canon SELPHY CP1300/1500 would
    have given guaranteed one-tap-via-AirPrint printing with zero custom
    code, but the user chose the Kodak on price.
- **Phase 10 (Booth mode / auto-detection)** — not started.

## Architecture as built

- Vite + React + TypeScript, directory structure matches `CLAUDE.md` section 3.
- Single `BoothStateMachine.ts` reducer, no scattered booleans.
- Camera: `getUserMedia` → `CameraManager` → `CaptureService.captureMasterFrame()`
  produces the "master" `ImageBitmap` (un-mirrored, deliberate orientation).
- Vision: `WorkerFaceDetector` runs `@vladmandic/face-api` (TinyFaceDetector +
  FaceLandmark68Net, tfjs **cpu** backend) inside a dedicated Web Worker
  (`FaceDetectionWorker.ts`). Model weights bundled in `public/models/` (works
  offline). Output is a `FaceModel[]` per `VisionTypes.ts` (68-point landmarks
  mapped to normalized 0–1 points via `Face68LandmarkIndices.ts`).
  - **No backend, no stored photos of anyone.** Detection and every effect run
    entirely in the browser, fresh, on the photo just captured. There is no
    server and no persistent "reference photo" of any guest anywhere in this
    architecture — CLAUDE.md section 44 requires this (local processing, no
    cloud upload, no biometric database, landmarks discarded after use).
- Caricature (Phase 4): `MeshWarpCaricatureEngine` (`effects/CaricatureEngine.ts`)
  builds a list of `ControlPoint`s from a `FaceModel` (`effects/MeshWarp.ts`:
  `buildNoseControlPoint`, `buildEyeControlPoints`, `buildJawControlPoint`,
  `buildEarControlPoints`) and renders the warp via `WebGL2MeshWarpRenderer`
  (`rendering/WebGLRenderer.ts`) with a `Canvas2DMeshWarpRenderer` fallback
  (`rendering/CanvasRenderer.ts`) if WebGL2 is unavailable/fails.
  - The warp math is a radial "spherize": `r' = R*(r/R)^(1/scale)`. Strictly
    monotonic in `r` for any positive scale ⇒ mathematically cannot fold the
    mesh, regardless of how extreme `scale` gets. `SAFE_MIN/MAX_SCALE` (0.5–2.4,
    in `effects/Presets.ts`) is a *taste* ceiling, not a fold-safety limit.
  - Multiple control points are applied sequentially (composed), which is an
    approximation when regions overlap (documented caveat in `MeshWarp.ts`) —
    on some face angles this currently reads as "melted/uncanny" rather than
    cleanly cartoonish, since nose/eye/jaw falloff radii can overlap on a
    turned face. Not yet fixed; noted as a possible follow-up (weighted
    blending instead of sequential composition) if it's a problem in
    practice.
- Presets (`effects/Presets.ts`): named presets (Goblin, Demon, HotMess, Witch,
  Vampire, PumpkinHead, CartoonVillain, DrunkUncle, EvilPromQueen) each set
  eyeScale/noseScale/jawScale/earScale, tuned toward a **goofy + scary-witch**
  mix per explicit direction. `Random`/WTF mode always maxes out all four wired
  features (doesn't leave it to chance). Default `caricatureStrength` = **1.0**
  (maxed out by default — explicit user direction: ship prominent, let the
  operator panel pull it back rather than shipping subtle by default).
- Post-capture "Goofy Filter" toggle (originally named "Spookify", renamed
  once the ghost cameo got its own toggle of that name -- see below): after
  processing, both the candid original and the caricatured bitmap are kept
  in memory (`App.tsx`: `originalBitmapRef`/`caricaturedBitmapRef`). A
  toggle button on `ResultScreen` swaps which one is displayed/printed
  instantly (no re-detection/re-warp). Defaults to on for every fresh
  capture.
- **"My Cameo" (beta) + independent "Spookify" ghost toggle**: a distinct
  feature from the spec's per-guest ghost effect (section 21 — which
  duplicates whoever is *in* the captured photo). This composites the booth
  owner's own bundled photo into every guest photo as a recurring ghostly
  photobomb. `OwnerCameoEngine` (`src/effects/OwnerCameoEngine.ts`) fetches
  `public/cameo/nic-cutout.png` (a background-removed cutout, produced
  offline via OpenCV GrabCut + morphological cleanup + manual touch-up from
  a selfie the user provided — not a guest's photo, not stored biometric
  data) and composites it with a `blur()`/`saturate()`/`brightness()`
  canvas filter + reduced `globalAlpha`, matching the guest-ghost visual
  language in section 21 (opacity 0.4, within the spec's 0.20–0.45 range).
  Gated at the operator level by `settings.ownerCameoMode: "off" | "always"`
  (a union type, deliberately built to extend later without a settings
  migration) via a "My Cameo (beta)" checkbox in the operator panel's
  Effects section — this decides whether the ghost feature exists at all
  for guests, not whether it's forced on every photo.
  - On top of that, the guest gets their own independent "👻 SPOOKIFY:
    ON/OFF" button on the result screen (only rendered when the operator
    has "My Cameo" enabled), separate from "Goofy Filter" -- the ghost can
    be layered onto either the candid or the goofy version of the photo, in
    any combination. `App.tsx`'s `handleCountdownComplete` computes all
    four bitmaps up front after the mesh warp
    (`original`/`caricatured`/`originalGhost`/`caricaturedGhost`, the
    latter two only when the operator has cameo enabled) and
    `applyPhotoSelection(goofy, ghost)` picks between them instantly on
    either toggle, with no re-compositing. Defaults to Spookify-on whenever
    the operator has "My Cameo" enabled.
  - Verified: isolated compositing check (confirms the cameo image itself
    renders correctly, ghostly-styled, at the right position) plus two
    end-to-end headless-Chromium runs: one comparing a full capture flow
    with the toggle on vs. off, and one clicking through all four
    goofy/ghost combinations and pixel-diffing adjacent pairs to confirm
    each button only changes its own region/effect, independent of the
    other's state.
  - **Explicit follow-up requested by the user and not yet built**: a
    "random chance per photo" mode instead of a flat always-available
    toggle — the settings type is already shaped for this.
- Operator panel: reachable by **tapping** the ghost logo (not the spec's
  5-second hold — that gesture wasn't registering reliably in iPhone Safari,
  swapped to a plain tap "for now"; `HoldToActivate.tsx` still exists unused,
  swap back if the hold gesture gets fixed).
- Printing: `PrinterManager` + `MockPrinterAdapter` only. Real printer
  integration blocked on the user supplying the exact hardware model
  (CLAUDE.md section 37–39 — architecture is already isolated for this).

## Key files map

```
src/
  app/App.tsx                 orchestrates the whole capture→process→result flow
  app/Settings.ts              BoothSettings incl. defaults (caricatureStrength: 1.0)
  effects/MeshWarp.ts          pure warp math + 4 control-point builders (unit tested)
  effects/CaricatureEngine.ts  MeshWarpCaricatureEngine (WebGL2→Canvas2D→passthrough)
  effects/Presets.ts           named presets + Random/WTF mode + safety clamp
  rendering/WebGLRenderer.ts   WebGL2 mesh warp (vertex-shader-only warp)
  rendering/CanvasRenderer.ts  Canvas2D fallback (per-triangle affine draw)
  vision/FaceDetectionWorker.ts  face-api.js in a Web Worker
  vision/WorkerFaceDetector.ts   main-thread handle to the worker
  vision/Face68LandmarkIndices.ts  68pt → normalized FaceModel mapping
  components/ResultScreen.tsx  result photo + Spookify toggle + Print/Retake
  components/DebugLandmarkOverlay.tsx  operator debug-mode landmark overlay
tests/                        43→51 unit tests across 4 files, all passing
public/models/                bundled face-api model weights (offline-capable)
```

## Verification approach used throughout

No real iPad/printer hardware available in this environment, so each phase was
verified with:
1. `npx vitest run` — unit tests for pure logic (warp math, landmark mapping,
   state machine).
2. `npx tsc -b` — typecheck.
3. `npm run build` — production build.
4. Headless Chromium (Playwright, launched via the global install at
   `/home/claude/.npm-global/lib/node_modules/playwright` — **not** a project
   dependency) with `--use-fake-device-for-media-stream` and
   `--use-file-for-fake-video-capture=<file>.y4m` (a real photo of 3 people,
   converted to Y4M via ffmpeg, at `/tmp/fake_face.y4m`) to drive the full
   capture flow end-to-end and screenshot the result.
5. Isolated renderer checks: a synthetic checkerboard image warped through both
   WebGL2 and Canvas2D paths directly (proves the renderer math independent of
   face-detection accuracy or photo composition).
6. Pixel-diffs between before/after or on/off screenshots (via PIL) to prove a
   change actually took effect, not just eyeballing.

Scratch test scripts (`smoke-*.mjs`, `warp-check.mjs`) are **not** committed —
written to the repo root temporarily, run, then deleted each time.

## Deploy procedure (repeated each round)

```bash
npm run build
git worktree add /tmp/ghost-booth-gh-pages-N gh-pages
cd /tmp/ghost-booth-gh-pages-N
git rm -rf --cached . >/dev/null
find . -mindepth 1 -not -path './.git*' -delete
cp -r /home/claude/ghost-booth/dist/. .
touch .nojekyll
git add -A && git commit -m "Deploy: ..." && git push origin gh-pages
cd /home/claude/ghost-booth && git worktree remove /tmp/ghost-booth-gh-pages-N
```
(Worktree dir name is bumped each time to avoid collisions; not load-bearing,
could reuse one name with `git worktree remove` between rounds.)

Commit attribution trailer used throughout:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GpLRxRzKKwayo1BhjetDEa
```

## User's explicit product direction so far (things to keep honoring)

- Adult Halloween party photobooth: goofy + scary/witch-like, not just "spooky."
- Caricature effects should be **prominent/maxed by default**; operator panel
  is where you pull back, not where you turn it on.
- Post-capture Spookify toggle so a candid photo is still an option per group.
- Ghost effect (next up) is the app's namesake feature — biggest remaining
  visual payoff, prioritized above finishing the rest of the caricature engine.
- Operator panel access = tap (not hold) due to iPhone Safari issue.

## Open threads / not-yet-resolved

- Overlapping control-point regions on turned faces can look "melted" rather
  than cartoonish — not fixed, revisit if it's a real problem once more people
  test it.
- Mouth, forehead, cheek deformations (rest of Phase 4) — paused in favor of
  ghost effect, come back to later.
- Real printer model still unknown — `VendorPrinterAdapter` intentionally
  throws until supplied.
- No service worker yet (Phase 45 offline requirement not fully met — app
  works if already cached by the browser, but there's no explicit
  install/offline-cache step).
- Auto-detection/unattended start (Phase 10) not started — booth currently
  requires a tap to begin.

## Next up: Ghost effect (Phase 6/7)

Per `CLAUDE.md` sections 21–23 and 6/13 (body/person handling): the ghost is
generated **from the same captured photo**, not from a separately stored
picture of any guest:

```
captured photo → person segmentation → extract person → duplicate →
deform → blur → desaturate → increase brightness → reduce opacity →
offset → place behind foreground
```

So the plan does **not** need a stored reference photo of anyone on a backend
— there is no backend, and CLAUDE.md section 44 explicitly rules out a
biometric/photo database. What it does need, architecturally:
1. **Person segmentation** (Phase 6): separate the person(s) from the
   background in the just-captured photo, in-browser. Candidates to evaluate:
   MediaPipe Selfie/Image Segmentation via TF.js or ONNX Runtime Web (same
   constraint as face detection: must be reachable from this sandboxed
   environment's allowlisted hosts — MediaPipe's own CDN was unreachable last
   time, which is why face detection ended up on `@vladmandic/face-api`
   instead; will need to re-check what's reachable for a segmentation model).
2. **Ghost engine** (Phase 7): duplicate the segmented person, apply a
   distortion/pose offset, blur, desaturate, brighten, drop opacity
   (0.20–0.45 per spec), offset position, composite behind the real
   (caricatured) person. Support 2–3 echo ghosts with descending opacity.
3. Wire into `CompositionEngine` (already stubbed) as the "ghosts" layer,
   which already exists in `CompositionConfig`.
