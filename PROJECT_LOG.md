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
- **Phase 4 (Caricature)** — done. All spec-listed deformations are wired up:
  nose, eyes, jaw, ears, mouth, forehead, cheeks, eyebrows, plus body/shoulder
  (`shoulderScale`/`bodyScale`, landmark-anchored approximations extending
  down/out from the jaw contour since there's no body landmark source). The
  "melted face" overlap issue (see below) is also fixed. Explicit scope cut
  that remains: `faceWidth`/`faceHeight`/`neckScale` from
  `CaricatureConfiguration` are not wired to a control point — they'd need
  anisotropic (non-radial) warp support the current spherize math doesn't
  have; noted as a follow-up in "Open threads" below.
- **Phase 5 (GPU)** — effectively done as a side effect of Phase 4 (WebGL2 mesh
  warp + Canvas2D fallback already exist and are generic, not nose-specific).
- **Phase 6 (Segmentation)**, **Phase 7 (Ghost)** — tried and reverted. A
  real per-guest ghost effect (spec sections 21-23) was built from each
  guest's own MediaPipe-segmented silhouette, but the user tried it and
  didn't like the result ("doesn't work great") and asked to go back to
  "My Cameo" instead. Reverted: `effects/GhostEngine.ts`,
  `vision/MediaPipePersonSegmenter.ts`, and `public/segmentation/`'s bundled
  model/wasm assets were all deleted; the "Real Ghost Effect (beta)"
  operator toggle and `Settings.ts`'s `realGhostMode` are gone. The Spookify
  toggle is powered solely by "My Cameo" again now (see below). Stated
  plan going forward: the user wants to load several photos of themselves
  as "ghosts" and have one picked at random per photo, rather than a
  live-generated effect -- `OwnerCameoEngine` was extended to support that
  (see below) ahead of the user actually adding more images.
- **Phase 8 (Composition)** — done. `Canvas2DCompositionEngine`
  (background/ghosts/foreground/caption layering, already built earlier) is
  invoked from the live capture pipeline in `App.tsx`: every photo gets a
  caption (`effects/HalloweenEffects.ts`'s `pickCaption`, honors the
  operator's Caption Mode: off/random/fixed, using the same per-photo seeded
  rng as the caricature preset) and a frame (`effects/Frames.ts`, procedurally
  drawn Canvas 2D — `classic` double-line border or `filmStrip` sprocket-hole
  bars, no raster assets to source/license). The caption is always baked in
  (not guest-toggleable). Frame, Halloween overlays, and Poster Mode are all
  guest-facing toggles now (see below).
  - **Halloween overlays (spec section 24) — done.** All 16 `OverlayKey`
    types (blood splatter, cobwebs, spiders, bats, skulls, eyeballs, horns,
    vampire fangs, graveyard, moon, candles, fog, cracked glass, scratches,
    film grain, vignette) are implemented in `effects/Overlays.ts` as
    procedural Canvas2D draw functions (`drawOverlays(ctx, keys, width,
    height, rng)`) — same "no raster assets to source/license" approach as
    `Frames.ts`/`PosterEffect.ts`, not the spec's literal "transparent PNG/
    WebP/SVG assets." Placement/sizing/rotation for each decoration is
    randomized per photo via the same seeded-rng pattern as everything else
    (a new `overlaySeed`, stored per-photo). The operator picks which
    overlay types are in play at all (a 16-checkbox fieldset in the
    operator panel's Effects section, backed by `settings.overlays:
    OverlayKey[]`, empty by default); the guest gets a "🕸️ OVERLAYS"
    toggle to show/hide that set (same show/hide-what-the-operator-picked
    pattern as Frame), only rendered when the operator has configured at
    least one overlay type and Poster Mode isn't currently applied. Layer
    order: overlays draw between the foreground and the caption (spec
    section 28's "decorative effects" slot).
  - **Architecture change: on-demand composition, not precomputed bitmap
    variants.** With Frame, Overlays, and Poster Mode all promoted to
    guest-facing toggles alongside Goofy/Spookify, the toggle count went
    from 3 (8 precomputed combinations) to 5 (32 combinations) — baking
    every combination up front the way the old 8-variant design did no
    longer scales. `App.tsx` now stores only 4 base bitmaps
    (`original`/`caricatured`/`originalGhost`/`caricaturedGhost`, same as
    before) plus a small per-photo "recipe" (`photoRecipeRef`: caption,
    frame, overlays, overlaySeed, poster tint) captured once at capture
    time. Every toggle flip calls `applyPhotoSelection(goofy, ghost, frame,
    overlays, poster)`, which composes fresh on demand — either
    `compositionEngine.compose()` (regular caption+frame+overlay
    treatment) or `applyPosterEffect()` (poster grade), never both, against
    whichever of the 4 base bitmaps the goofy/ghost combination picks.
    Verified via E2E test that a toggle tap (one canvas-draw pass) is well
    within interactive latency (~400ms budget in the test, comfortably
    met) — a better tradeoff than precomputing 32 bitmaps per photo.
  - **Poster Mode promoted to a guest-facing toggle.** Previously
    operator-wide only (to avoid multiplying the old precomputed-bitmap
    variants); now that composition happens on demand, that constraint is
    gone. Still mutually exclusive with the regular caption+frame+overlay
    treatment for the same reason as before (both have their own
    text/vignette, combining would clutter), so Frame/Overlays toggle
    buttons hide themselves whenever Poster is on for the current photo
    (dynamic, based on live toggle state, not just the operator setting —
    they reappear immediately if the guest flips Poster back off).
  - **"Melted face" fix (see also Phase 4 above).** Root cause was
    sequential composition of overlapping control points: each control
    point's warp fed its *output* forward as the next control point's
    input, so overlapping regions (e.g. nose/eye/jaw radii crossing on a
    turned face) accumulated order-dependent, cascading distortion.
    `MeshWarp.ts`'s `warpPoint` now computes every control point's
    displacement independently against the *original* point and sums the
    displacements — order-independent, no warping-through-already-warped-
    space. Covered by a new dedicated regression test
    (`tests/MeshWarp.test.ts`) plus the existing "stacking the same point
    pushes further" test, which still passes under the additive model.
  - **One-tap revert to original.** A new "↩️ ORIGINAL" button on the
    result screen (`onShowOriginal`) resets all 5 toggles to their
    off/candid state in one tap and recomposes — always visible,
    unconditionally available regardless of what the operator has
    configured.
- **Poster Mode (beta)** — a new operator toggle (`effects/PosterEffect.ts`),
  requested after analyzing reference horror-movie posters (Evil Dead Rise,
  IT, Fright Night). Grades the whole photo like a poster -- desaturate/
  contrast/tint color grade, a radial vignette that pools light around the
  subject, and a small letter-spaced tagline (reusing the same caption
  pool). No title text is drawn (removed per user feedback -- "I like the
  color grades" but didn't want the bold red "GHOST BOOTH" title). Three tint presets
  (crimson/teal/moonlight) chosen per-photo from the seeded rng, matching
  each reference poster's limited palette. This is the "quick procedural"
  tier explicitly chosen over the alternatives: it grades the *whole* photo
  rather than lifting the guest onto a separate background, because that
  would need Phase 6 person segmentation (not built) to do properly, and a
  generative-AI background was ruled out for now as a cost/latency/offline
  tradeoff (CLAUDE.md sections 51-52, 64). When Poster Mode is on, it
  replaces the regular caption+frame treatment for that photo rather than
  layering on top (both have their own text/border, so combining them would
  clutter the frame). Scoped as an operator-wide setting for the event, not
  a per-photo guest toggle, to avoid multiplying the four cached bitmap
  variants into eight.
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
  - **Print layout / crop-to-paper (CLAUDE.md section 40-41) — built.** The
    Kodak Mini 2 Retro actually outputs 2x3 prints, not the spec's 4x6
    default — but 2x3 and 4x6 are the same aspect ratio (2:3), so no new
    crop math was needed, just an accurately-named layout option.
    `printing/PrintLayout.ts`'s `cropToPrintLayout()` runs once, immediately
    before handing the currently-selected result bitmap to the printer
    adapter in `App.tsx`'s `handlePrintRequested` — it does NOT touch what's
    cached/displayed on the result screen (that stays at the camera's
    native aspect ratio, matching the earlier fix that removed a forced
    aspect box from the result-screen display). A "cover" center-crop
    (`computeCoverCropRect`, unit tested in `tests/PrintLayout.test.ts`)
    trims whichever dimension is proportionally longer, preserving the
    source's own landscape orientation rather than forcing portrait.
    `settings.printLayout` now actually does something (previously declared
    but unused) and is operator-editable via a new "Print Layout" dropdown;
    default changed from `"4x6"` to `"2x3"` to match the connected hardware.
    Layout options: `2x3` (default), `4x6`, `square`, `2x6strip` (2x6 strip
    mode itself — CLAUDE.md section 42 — is still unbuilt; this is just the
    crop shape for a single photo).
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
- Caricature (Phase 4, now complete): `MeshWarpCaricatureEngine`
  (`effects/CaricatureEngine.ts`) builds a list of `ControlPoint`s from a
  `FaceModel` (`effects/MeshWarp.ts`: `buildNoseControlPoint`,
  `buildEyeControlPoints`, `buildJawControlPoint`, `buildEarControlPoints`,
  `buildMouthControlPoint`, `buildForeheadControlPoint`,
  `buildCheekControlPoints`, `buildEyebrowControlPoints`,
  `buildShoulderControlPoint`, `buildBodyControlPoint`) and renders the warp
  via `WebGL2MeshWarpRenderer` (`rendering/WebGLRenderer.ts`) with a
  `Canvas2DMeshWarpRenderer` fallback (`rendering/CanvasRenderer.ts`) if
  WebGL2 is unavailable/fails. Cheeks/forehead/shoulders/body have no direct
  dlib68 landmark, so (following the same precedent already established for
  ears) they're landmark-anchored approximations: derived from nearby
  contour/jaw points rather than a dedicated landmark.
  - The warp math is a radial "spherize": `r' = R*(r/R)^(1/scale)`. Strictly
    monotonic in `r` for any positive scale ⇒ mathematically cannot fold the
    mesh, regardless of how extreme `scale` gets. `SAFE_MIN/MAX_SCALE` (0.5–2.4,
    in `effects/Presets.ts`) is a *taste* ceiling, not a fold-safety limit.
  - **Multiple control points are now composed via independent-displacement
    summation, not sequential chaining** (the "melted face" fix — see Phase
    8 above for the full explanation). Each control point's displacement is
    computed against the original point and all displacements are summed,
    so overlapping regions (nose/eye/jaw/mouth/cheek falloff radii crossing
    on a turned face) no longer cascade through already-warped coordinate
    space. Order-independence is covered by a dedicated unit test.
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
  - **Multiple cameo images, randomly picked per photo**: `OwnerCameoEngine`
    now takes an array of asset URLs (instead of a single one) and, given
    more than one, picks between them with the same per-photo seeded rng as
    the caricature preset (section 20) — picked once and reused for both
    the candid and goofy variants of a given photo so they show the same
    "ghost". Today there's still only one image
    (`public/cameo/nic-cutout.png`), so behavior is unchanged; the user's
    stated plan is to eventually load several photos of themselves as
    different "ghosts". To add more: drop additional cutout PNGs into
    `public/cameo/` and list their filenames in `App.tsx`'s
    `CAMEO_ASSET_FILENAMES` array — nothing else needs to change. A URL
    that 404s is skipped rather than breaking the booth.
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
  effects/MeshWarp.ts          pure warp math + 10 control-point builders (unit tested)
  effects/CaricatureEngine.ts  MeshWarpCaricatureEngine (WebGL2→Canvas2D→passthrough)
  effects/Presets.ts           named presets + Random/WTF mode + safety clamp
  effects/Overlays.ts          16 procedural Halloween overlay draw functions
  rendering/WebGLRenderer.ts   WebGL2 mesh warp (vertex-shader-only warp)
  rendering/CanvasRenderer.ts  Canvas2D fallback (per-triangle affine draw)
  rendering/CompositionEngine.ts  background/ghosts/foreground/overlays/caption/frame layering
  vision/FaceDetectionWorker.ts  face-api.js in a Web Worker
  vision/WorkerFaceDetector.ts   main-thread handle to the worker
  vision/Face68LandmarkIndices.ts  68pt → normalized FaceModel mapping
  components/ResultScreen.tsx  result photo + Goofy/Spookify/Frame/Overlays/Poster/Original toggles
  components/DebugLandmarkOverlay.tsx  operator debug-mode landmark overlay
tests/                        70 unit tests across 4 files, all passing
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
- Ghost effect is the app's namesake feature — a live per-guest version was
  tried and reverted (see Status-at-a-glance above); "My Cameo" is the
  ghost feature going forward, with the user's own stated plan to expand it
  to several randomly-picked cameo images over time.
- Operator panel access = tap (not hold) due to iPhone Safari issue.

## Open threads / not-yet-resolved

- `faceWidth`/`faceHeight`/`neckScale` (`CaricatureConfiguration`) are not
  wired to a control point — would need anisotropic (non-uniform-radial)
  warp support the current spherize math doesn't have; a possible follow-up
  if it turns out to matter for the beta.
- Real printer model still unknown — `VendorPrinterAdapter` intentionally
  throws until supplied.
- No service worker yet (Phase 45 offline requirement not fully met — app
  works if already cached by the browser, but there's no explicit
  install/offline-cache step).
- Auto-detection/unattended start (Phase 10) not started — booth currently
  requires a tap to begin.

## Ghost effect (Phase 6/7) — tried, reverted

A live per-guest ghost (person segmentation + duplicated/blurred/offset
echoes of the guest's own segmented silhouette, per `CLAUDE.md` sections
21–23) was built, debugged, and confirmed visually working, but the user
tried it and didn't like the result and asked to revert to "My Cameo". See
the Status-at-a-glance entry above for what was reverted and why. Phase 6
(segmentation) and Phase 7 (ghost) are back to not-started in terms of
what's shipped; the code exists in git history (see the commit that added
`vision/MediaPipePersonSegmenter.ts` and `effects/GhostEngine.ts`) if a
future attempt wants a starting point, but the layering approach and the
MediaPipe single-mask-per-frame limitation are both worth reconsidering
rather than just restoring as-is.
