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
    gone. Still mutually exclusive with the regular frame+overlay
    treatment for the same reason as before (both have their own
    border/vignette, combining would clutter), so Frame/Overlays toggle
    buttons hide themselves whenever Poster is on for the current photo
    (dynamic, based on live toggle state, not just the operator setting —
    they reappear immediately if the guest flips Poster back off). See the
    dedicated Poster Mode / Caption bullets further down for the later
    round that also made the caption its own independent toggle and
    stripped all text out of Poster Mode itself.
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
  - **One-tap revert to original.** A "↩️ ORIGINAL" button on the result
    screen (`onShowOriginal`) resets every toggle (now 6, with Caption
    added — see below) to their off/candid state in one tap and
    recomposes — always visible, unconditionally available regardless of
    what the operator has configured.
- **Poster Mode (beta)** — operator toggle + guest-facing result-screen
  toggle (`effects/PosterEffect.ts`), requested after analyzing reference
  horror-movie posters (Evil Dead Rise, IT, Fright Night). Grades the whole
  photo like a poster -- desaturate/contrast/tint color grade + a radial
  vignette that pools light around the subject. **Text-free now**: an
  earlier version also drew a small letter-spaced tagline directly onto the
  poster grade (after an even earlier bold-red "GHOST BOOTH" title was
  already dropped per feedback); per further direction that tagline was
  removed too, so Poster Mode is now purely the color theme/gradient
  treatment. Three tint presets (crimson/teal/moonlight) chosen per-photo
  from the seeded rng, matching each reference poster's limited palette.
  This is the "quick procedural" tier explicitly chosen over the
  alternatives: it grades the *whole* photo rather than lifting the guest
  onto a separate background, because that would need Phase 6 person
  segmentation (not built) to do properly, and a generative-AI background
  was ruled out for now as a cost/latency/offline tradeoff (CLAUDE.md
  sections 51-52, 64). When Poster Mode is on, it replaces the regular
  frame+overlay treatment for that photo rather than layering on top (both
  have their own border/vignette). The caption (below) is independent of
  Poster Mode and layers on top of either treatment.
- **Caption — promoted to its own guest-facing toggle, with reroll-on-tap.**
  Previously always baked in per CLAUDE.md section 25's "always on" framing;
  now a "💬 CAPTION" toggle on the result screen (only rendered when the
  operator's Caption Mode isn't "off") shows/hides it like the other
  toggles, but with one difference: every tap -- turning it on *or* off --
  also rerolls which line is queued next (only in "random" Caption Mode;
  "fixed" mode still just shows/hides the one configured caption, nothing
  to randomize between). This lets a guest keep tapping to cycle through
  different one-liners rather than being stuck with whichever one got
  picked at capture time. Applies on top of either the regular frame/overlay
  treatment (`CompositionEngine`'s existing caption layer) or a Poster-Mode-
  graded photo (a new `drawCaptionOnBitmap` helper in `CompositionEngine.ts`
  draws the same treatment directly onto the poster bitmap, since Poster
  Mode itself no longer draws any text of its own).
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
- **Horror Filters — done.** Four whole-photo color-grade presets
  (`effects/HorrorFilters.ts`): `vhs` (Analog Horror -- desaturated,
  contrast-pushed, scanlines + grain + a cheap RGB-split chromatic
  aberration), `noir` (Dark -- underexposed, high contrast, blue/green
  cast), `bloodMoon` (Horror -- red tint, high contrast, crushed
  shadows, grain), `vintage` (Vintage Haunted -- sepia, faded/lifted
  blacks, soft grain). Same "quick procedural" tier as
  `PosterEffect.ts` -- `ctx.filter` color grades plus a few small
  hand-drawn passes, no shader/WebGL needed for four static looks.
  Operator picks which filters are in play (`settings.filters:
  FilterKey[]`, empty by default, a checkbox fieldset in the operator
  panel's Effects section next to Overlays); which filter a given
  photo gets is picked once per photo from that list via the existing
  seeded rng (`PhotoRecipe.filterKey`, same pattern as `posterTint`),
  so the guest's "🎞️ FILTER" toggle stays a simple on/off rather than
  a picker. Applied as a pre-pass on the source bitmap before it
  reaches `CompositionEngine.compose()`, so Frame/Overlays/Caption
  still layer on top of a filtered photo. Mutually exclusive with
  Poster Mode (both are whole-photo grades; stacking them would look
  muddy) -- the Filter toggle hides itself while Poster is live, same
  pattern Frame/Overlays already use. Verified with two new
  `composeSelectedBitmap` cases in `tests/CapturePipeline.test.ts`
  (filter pre-pass runs before compose(), and is skipped when Poster
  is also on). Full suite: 172 tests, all green; `tsc -b`, `oxlint`,
  `npm run build` all clean.
  - Deliberately not built this round (explicit user direction):
    a live per-guest ghost effect (already tried/reverted, see below)
    and new caption/horror-text presets (`CAPTIONS` already covers
    this from earlier work -- CLAUDE.md section 25).
- **Guest-facing Frame/Overlays/Poster/Filter picker — done.** Replaced
  the four on/off toggle buttons (FRAME/OVERLAYS/POSTER/FILTER) on
  `ResultScreen` with a single CUSTOMIZE button that opens a new
  `CustomizePanel.tsx`, where the guest picks the *specific* value in
  each category rather than the operator/rng having already decided
  it:
  - **Frame** — single-select among all three `FrameKey`s (always
    fully available; frames are free procedural decoration, no
    operator curation needed).
  - **Overlays** — multi-select checkboxes among whatever
    `settings.overlays` the operator enabled for the event.
  - **Filter** — single-select (or "Off") among whatever
    `settings.filters` the operator enabled.
  - **Poster** — single-select (or "Off") among all three tints,
    shown only when the operator's `posterMode` is on.
  Frame/Overlays/Filter sections gray out (CSS
  `.customize-section-disabled`, not hidden) whenever a poster tint is
  picked, since Poster is a full-photo color grade that replaces the
  regular frame/overlay/filter composition path
  (`composeSelectedBitmap` in `CapturePipeline.ts`) rather than
  stacking with it -- same mutual-exclusivity rule as before, now
  surfaced visually instead of by hiding a toggle.

  Reworked `CapturePipeline.ts`'s public shapes to carry this:
  `PhotoRecipe` shrank to just `caption` and `overlaySeed` (frame/
  overlays/posterTint/filterKey are no longer decided at analysis
  time); a new `PhotoOptions` (what's available: `frameOptions`,
  `overlayOptions`, `posterTints`, `filterOptions`, plus `ghost`/
  `caption` availability) and `DefaultSelection` (what's preselected:
  frame/overlays default to the operator's configured values; poster/
  filter default to *off*, a deliberate change from the old "on
  whenever available" behavior, since these are the two dramatic
  whole-photo treatments the guest should opt into on purpose) replace
  the old `ToggleAvailability`. `PhotoSelection` changed from seven
  booleans (`framed`/`overlaid`/`postered`/`filtered`/...) to typed
  picks: `frameKey: FrameKey`, `overlayKeys: OverlayKey[]`,
  `posterTint: PosterTint | null`, `filterKey: FilterKey | null`
  (plus `goofy`/`ghost`/`captioned`, unchanged). Added a
  `*_LABELS` record next to each key type (`Frames.ts`,
  `PosterEffect.ts`, and a new `Overlays.ts` holding `OVERLAY_KEYS`/
  `OVERLAY_LABELS`, split out of `HalloweenEffects.ts` so both
  `OperatorPanel` and `CustomizePanel` can import the label map
  without duplicating it) for the panel's chip button text.
  `App.tsx` gained `frameKey`/`overlayKeys`/`posterTint`/`filterKey`/
  `photoOptions`/`customizePanelOpen` state and per-category handlers
  that each call `applyPhotoSelection` with the full current
  selection; retake/done/show-original all reset guest picks back to
  `EMPTY_PHOTO_OPTIONS`/defaults.

  Verified: `tests/CapturePipeline.test.ts` rewritten for the new
  shapes (options/defaults instead of availability, typed `PhotoSelection`
  instead of booleans) -- full suite still 172 tests, all green;
  `tsc -b`, `oxlint`, `npm run build` all clean.

- **Picker moved inline as a carousel; idle-timeout photo loss fixed —
  done.** Two follow-up fixes after guests actually tried the picker
  above:
  - The CUSTOMIZE button + full-screen `CustomizePanel` overlay is gone.
    `CustomizePanel.tsx` was replaced with `components/FeatureCarousel.tsx`,
    embedded directly in `ResultScreen` between the photo and the icon
    row -- a small Frame/Overlays/Filter/Poster tab strip (only tabs with
    something to offer are shown) with one horizontally-scrollable chip
    row for whichever tab is active, so the whole flow (see the photo,
    pick features, print) stays on one screen with no separate
    screen/modal to open and close. Same mutual-exclusivity behavior as
    before (Frame/Overlays/Filter chips disable with an inline note
    whenever a poster tint is picked), just always visible instead of
    behind a button.
  - The reported "photo disappears after ~30 seconds" was the idle
    timeout (`App.tsx`'s `IDLE_TIMEOUT` effect, `settings.idleTimeoutSeconds`)
    firing out from under the guest while they browsed the picker: that
    effect only re-armed on `state.booth.state` changes, and picking a
    frame/overlay/filter/poster option never changes booth state (the
    guest stays in `"result"` the whole time), so the countdown that
    started the moment the photo appeared kept running underneath every
    tap and eventually reset the booth to attract -- discarding the photo
    -- regardless of how engaged the guest still was. Fixed with a new
    `activityTick` counter in `App.tsx`, bumped inside `applyPhotoSelection`
    (so every goofy/ghost/caption/frame/overlay/filter/poster pick counts
    as activity) and added to the idle effect's dependency array so any of
    those taps re-arms the timer. Also excluded the `"printing"` state
    from the idle timer entirely (that transition is driven by the printer
    adapter finishing, not guest taps, so it was never something the idle
    countdown should race against) and raised the default
    `idleTimeoutSeconds` from 45 to 90 for a more comfortable floor before
    any interaction happens. `photoRetentionMinutes` (an operator setting)
    was investigated and confirmed unrelated -- it's not wired to anything
    yet, so it wasn't the cause.
  Verified: `tsc -b`, `oxlint`, `npm run build` all clean; full suite
  still 172/172 (no test exercised the idle-timeout effect or the
  carousel directly, so none needed updating).

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

## Codebase review + P2-P4 cleanup round

Ran a self-review of the codebase (inefficiencies in tools/code, not new
features) and presented a 10-item, priority-ordered punch list before
touching anything, per the user's explicit request. The user approved
executing P2-P4 and explicitly deferred P1 (reliability items) to "later,
before we go live." Before starting, a safety checkpoint of the
known-good state was pushed as a branch, `checkpoint-before-p2-p4-cleanup`
— **note for future rounds: pushing an annotated tag to this remote fails
with an HTTP 403 (`RPC failed; HTTP 403 curl 22`); pushing a branch instead
works fine, so use a branch for any future checkpoint.**

P1 (deferred, not done this round): `ImageBitmap.close()` is never called
anywhere in the capture pipeline (a real risk for a multi-hour unattended
event given how aggressively iPad Safari reclaims memory); the
`photoRetentionMinutes` operator setting is a no-op (the IndexedDB purge
logic in `storage/PhotoStore.ts` exists but nothing calls it); no offline
PWA service worker yet (`CLAUDE.md` section 45's "must keep working without
network after install" requirement isn't met).

**P2 — WebGL2 renderer performance.** `rendering/WebGLRenderer.ts`'s
`WebGL2MeshWarpRenderer` used to recreate its `OffscreenCanvas`, recompile
both shaders, and relink the program on every single `warp()` call — real
overhead for a multi-face group photo (up to 6 `warp()` calls per spec
section 10). Rewrote it to lazily set up the context/program/VAO/
uv-buffer/index-buffer/texture object exactly once per renderer instance
(a new private `ensureContext()`), reusing all of it across calls and only
re-uploading what actually varies per call (the warped vertex positions
into `posBuffer`, and the source image into the texture). The backing
canvas resizes in place if a later call's image is a different size,
without recreating the WebGL2 context. Added a `dispose()` method to
release the cached GL objects. Verified with a new `tests/WebGLRenderer.test.ts`
(a hand-written fake `OffscreenCanvas`/WebGL2 context counting every GL
call) — this caught a real bug while writing the test: `dispose()`
initially only deleted 4 of the 6 objects it should have (the uv and index
buffers were local variables inside `ensureContext()`, not stored as
instance fields, so they were silently leaked); promoted them to instance
fields and fixed it.

**P3 — business logic out of `App.tsx` (`CLAUDE.md` section 55).** The
detect → warp → "My Cameo" ghost → recipe (caption/frame/overlays/poster
tint) pipeline, and the "recompose the currently selected combination of
toggles into one bitmap" logic, used to live inline in `App.tsx`'s
`handleCountdownComplete`/`applyPhotoSelection`, reachable only by driving
the whole app through a browser. Extracted both into a new
`src/app/CapturePipeline.ts` (`analyzeAndWarpPhoto` and
`composeSelectedBitmap`), taking plain data plus `Pick<Interface, "method">`
-typed dependencies so they can be unit tested directly — no DOM, camera,
React, or WebGL required. `App.tsx` now only holds the refs/state/dispatch
glue around calling them. Added `tests/CapturePipeline.test.ts` (12 tests)
covering sequential per-face warping, ghost availability gating, the
same-cameo-pick-reused-for-both-variants behavior, recipe building, and
composition toggle logic.

Also added unit tests for previously-untested modules, in priority order
(all safety-clamp/randomization/layering/rng-consumption behavior, not
pixel output): `tests/Presets.test.ts` (25 tests — `clampToSafeLimits`,
`scaleTowardNeutral`, `resolvePreset`, `randomWtfConfig`'s safety limits and
seeded reproducibility), `tests/CompositionEngine.test.ts` (10 tests —
layer order, caption/frame/overlay conditionals, missing-2D-context
fallback), `tests/HalloweenEffects.test.ts` (8 tests — `pickCaption`'s
off/random/fixed modes), `tests/PosterEffect.test.ts` (8 tests — tint/
vignette application, graceful degradation), `tests/OwnerCameoEngine.test.ts`
(8 tests — asset caching, 404 skip, rng-based cameo selection, geometry),
and for the printing layer, `tests/PrinterManager.test.ts` (8 tests — copy
looping, mid-batch failure propagation), `tests/MockPrinterAdapter.test.ts`
(8 tests — simulated delay/failure), and
`tests/ShareSheetPrinterAdapter.test.ts` (10 tests — Web Share API
capability checks, AbortError-is-not-a-failure handling). Full suite: 170
tests across 15 files, all green; `tsc -b`, `oxlint`, and `npm run build`
all clean.

**P4 — cleanup.** Removed dead files with zero import references anywhere
in `src/` (confirmed via grep before deleting): `vision/FaceLandmarks.ts`,
`vision/PersonSegmentation.ts`, `app/routes.ts`. Removed dead
`CompositionConfig` fields (`background`, `ghosts`, `brandingText`) that no
caller ever populated — "My Cameo" ghosts are composited directly onto the
foreground before it reaches `CompositionEngine`, not through a `ghosts`
list. Rewrote `README.md`, which still described Phase 1-4 as the current
state; it now stays intentionally high-level and defers to this log for
detail. Fixed an `oxlint` `react(set-state-in-effect)` warning in
`Countdown.tsx` by deriving `showBoo` from render state instead of a
synchronous `setState` call inside `useEffect`. Made the caption-reroll
toggle (`App.tsx`'s `handleToggleCaption`) use the app's seeded-PRNG
convention (`pickCaption` + `seededRandom(createSeed())`) instead of raw
`Math.random()`, consistent with `CLAUDE.md` section 20.

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

## Filter/overlay-over-poster, more frames/overlays/tints, per-face variation — done

A batch of smaller feature requests, landed together:

- **Filter and Overlays now layer over Poster Mode.** Frame is still
  mutually exclusive with Poster (a border still visually clashes with its
  vignette), but `CapturePipeline.ts`'s `composeSelectedBitmap` no longer
  bypasses `CompositionEngine.compose()` when a poster tint is picked.
  New pipeline order: horror filter (if any) grades the source first,
  then the poster tint (if any) grades on top of *that*, then the
  poster-graded bitmap becomes `compose()`'s foreground with `frame`
  forced to `"none"` but `overlays`/`caption` passed through normally.
  `drawCaptionOnBitmap` (rendering/CompositionEngine.ts) is no longer
  called from this pipeline (poster-graded photos get their caption from
  `compose()`'s own caption layer now, same as any other photo) but is
  kept as a standalone utility with its own tests. `FeatureCarousel.tsx`
  updated so only the Frame tab grays out while Poster is on; Overlays and
  Filter stay fully interactive.
- **More frames** (`effects/Frames.ts`): `polaroid` (deep white bottom
  border), `spooky` (black/orange scalloped border with corner bat
  silhouettes), `torn` (jagged hand-torn-paper edge, deterministic wobble
  so it doesn't shift between renders), and `heisterkamp` -- the requested
  "Heisterkamp Halloween 2027" frame: a black bottom banner with that text
  in dripping-blood-style lettering, plus a thin blood-drip accent along
  the top edge so the drip motif isn't confined to the banner alone.
- **More overlays** (`effects/Overlays.ts`/`HalloweenEffects.ts`):
  `pumpkins`, `witchHat`, `lightning`, `ravens`, `hauntedTrees`,
  `handprint` (a bloody handprint with drip streaks). `bloodSplatter`
  itself was reworked to be more dramatic: 3-5 clusters instead of 2-4,
  alternating "fresh"/"older" blood tones, more satellite droplets, a new
  fine speckled mist ring around each cluster, longer tapering drip
  trails (occasionally running all the way to the bottom edge), and an
  occasional larger "big hit" cluster.
- **More poster gradient tints** (`effects/PosterEffect.ts`): added
  `toxicGreen`, `violetHaze`, `amberInferno`, `grimGrey`, and
  `bubblegumGore` alongside the original crimson/teal/moonlight, each with
  its own multiply-tint + vignette color pair.
- **Multi-person: each face now gets its own effect parameters**
  (CLAUDE.md section 10, previously not actually true despite face
  detection already handling 1-6 faces fine). `analyzeAndWarpPhoto`
  resolves the operator's preset once per photo as before, but now calls
  a new `Presets.ts` function, `varyConfigForFace(base, faceIndex, rng)`,
  once per detected face before warping it: every `*Scale` field gets a
  small ±15% random jitter, and each face's position in the group
  (sorted left-to-right for stability) guarantees one "signature" feature
  boosted to a clearly-exaggerated floor -- eyes/nose/forehead/jaw/ears/
  cheeks in that order, cycling for a 5th/6th guest -- straight out of
  CLAUDE.md section 10's own example (Person 1 -> giant eyes, Person 2 ->
  giant nose, etc.). A group photo with one preset now reads as several
  differently-distorted people instead of one effect stamped on everyone.
  Face/detector/warp-per-face plumbing itself needed no changes -- it
  already looped per detected face independently; the shared, static
  `config` object was the only actual gap.
  Verified: `tests/CapturePipeline.test.ts` updated for the new
  filter/overlay/poster pipeline order and the expanded frame/tint lists;
  new `varyConfigForFace` tests added to `tests/Presets.test.ts` (safe
  range regardless of face index, correct signature feature per index,
  cycling past 6 faces, determinism). Full suite: 182 tests, all green;
  `tsc -b`, `oxlint`, `npm run build` all clean.
  - Deliberately not started this round (explicit user direction: revisit
    after these smaller items land): the ghost feature. See "Ghost effect
    (Phase 6/7) — tried, reverted" above for where that stands.

## Heisterkamp frame legibility fix — done

Two bugs in the frame added earlier this session:

- **Blood was drawn over the banner text.** The banner-edge blood drips
  were anchored at the top of the black banner but drawn *downward*
  (`y + dripLen`), which is straight into the same bar the text sits in --
  at the wobble's high end a drip could reach most of the banner's height,
  crossing right through the letters. Fixed by giving `drawBloodDrips` a
  `direction` parameter: the banner's drips now hang *upward*
  (`direction: -1`) from the banner's top edge into the photo above it, so
  the "blood dripping from the frame" look survives but never touches the
  text area. The top-of-frame accent drip row is unaffected (already hung
  downward into the photo, away from any text).
- **Fixed font size could clip or crowd the text.** `"HEISTERKAMP
  HALLOWEEN 2027"` was drawn at a size derived only from the banner's
  height, with no check against its width, so it could run tight to (or
  past) the edges depending on photo aspect ratio. `drawHeisterkampFrame`
  now shrinks the font in a loop (`ctx.measureText`) until the line fits
  within 92% of the frame width, with a legible floor. Also swapped the
  close-in-color offset-copy "shadow" for a solid black `strokeText`
  outline behind the cream fill -- clearer contrast against the
  near-black banner at any size -- and bumped the banner height slightly
  (11% -> 13% of photo height) for more breathing room.
  Verified: `tsc -b`, `oxlint`, `npm run build`, and the full suite (182
  tests) all clean -- no test exercises this frame's pixels directly, so
  none needed changes.

## Torn Edge fix, Heisterkamp redesign (attempt 2), and the ghost-cameo picker — done

Three fixes/features from user-reported screenshots and a new explicit ask
("these are not stickers"):

- **Torn Edge frame was a giant solid blob, not a torn border.**
  `jaggedRectPath` (the helper that traces the inner jagged edge for the
  even-odd "punch a jagged hole in the outer rect" technique) called
  `ctx.beginPath()` internally, which wiped out the outer-rect subpath
  `drawTornFrame` had already added to the same path before calling it --
  so `fill("evenodd")` only ever saw one shape (the inner jagged one) and
  filled it solid, covering almost the entire photo in cream instead of
  leaving a thin torn-paper ring. Fixed by removing that stray
  `beginPath()` call so both subpaths (outer rect + inner jagged shape)
  stay on the same path, which is what even-odd fill needs to punch the
  hole correctly.
- **Heisterkamp blood redesigned to drip from the top of the frame, not
  the banner edge.** The previous fix (see above) technically stopped
  blood from crossing the actual text pixels, but the result -- a dense
  row of short upward spikes hugging the top of the black banner -- still
  looked bad (more "row of thorns" than blood) per the user's follow-up
  screenshot. Per the user's explicit direction, the banner-edge drips
  are gone entirely; `drawHeisterkampFrame` now draws one dramatic row of
  long blood drips from the very top of the frame (`y = 0`, reaching 40%
  of the photo's height) down over the subject, nowhere near the bottom
  banner. `drawBloodDrips` gained an optional `count` parameter (density
  defaults to ~1 drip per 42px of width, same as before, but the
  top-of-frame call passes a smaller explicit count) plus width now
  scales off `width / count` instead of the drip length, so a small
  number of long drips reads as a handful of thick dramatic streaks
  rather than a dense picket fence of thin spikes.
- **Ghost cameo picker**, replacing the old single-toggle "My Cameo"
  Spookify button: the guest now explicitly picks which ghost to layer
  onto their photo from a menu, same pattern as Frame/Overlays/Poster/
  Filter. New `effects/Cameos.ts` defines `CameoKey`/`CAMEO_KEYS`/
  `CAMEO_LABELS`/`CAMEO_FILENAMES` for six choosable cameos: the
  pre-existing `nic-cutout.png` ("My Cameo") plus five new stock
  horror/creature images the user supplied, copied into `public/cameo/`
  (`the-rake.jpg`, `forest-crawler.jpg`, `glass-hands.jpg`,
  `zombie-woman.jpg`, `smoke-skull.jpg`). `OwnerCameoEngine` was
  rewritten: `composite()` now takes an explicit `key: CameoKey | null`
  instead of picking via rng from a plain array, and its default sizing
  changed from a small corner "sticker" (32% width, offset toward a
  corner) to a full-frame "cover" fill -- scaled so the cameo's shorter
  dimension exactly fills the photo, centered -- per the user's explicit
  "these are not stickers... scale to fit the frame to strike fear"
  requirement. `CapturePipeline.ts` no longer bakes ghost variants at
  capture time (`PhotoBaseBitmaps` dropped `originalGhost`/
  `caricaturedGhost`, `AnalyzePhotoDeps` dropped `ownerCameoEngine`);
  instead `composeSelectedBitmap` composites the guest's currently-picked
  cameo (`PhotoSelection.ghostKey`, replacing the old boolean `ghost`)
  onto the goofy/plain source live, right before the filter/poster
  grading stages -- consistent with how Frame/Overlays/Poster/Filter
  already work, and letting the guest swap cameos without re-running
  face detection/warping. `PhotoOptions.ghost: boolean` became
  `ghostOptions: CameoKey[]` (empty when the operator's Cameo Mode is
  off); `DefaultSelection` gained `ghostKey: CameoKey | null` (always
  null -- guests opt in). `FeatureCarousel.tsx` gained a "Ghost" category
  (Off + each cameo label as a chip) shown whenever `ghostOptions` is
  non-empty; `ResultScreen.tsx`'s old standalone "SPOOKY" icon-row toggle
  button was removed since the picker now lives in the carousel.
  Licensing note for the user: the five new cameo images are commercial
  stock photography (their EXIF metadata identifies them as such, e.g.
  "Scary ghost on dark background") now embedded in this public GitHub
  Pages repo/site -- worth confirming there's a license that covers this
  use, or swapping in different art, before this goes further.
  Verified: `tsc -b` (including a `--force` full rebuild), `oxlint`, and
  `npm run build` all clean. `tests/OwnerCameoEngine.test.ts` rewritten
  for the new key-based API and cover-fill default geometry;
  `tests/CapturePipeline.test.ts` updated for the reworked
  `PhotoOptions`/`DefaultSelection`/`PhotoBaseBitmaps`/`PhotoSelection`/
  `ComposeSelectionDeps` shapes. Full suite: 180 tests, all green.

- **Unlicensed stock cameo images removed.** The user confirmed they
  don't hold a license for the five stock horror/creature images added
  above. Pulled back out immediately rather than left live pending a
  license: deleted `public/cameo/the-rake.jpg`,
  `forest-crawler.jpg`, `glass-hands.jpg`, `zombie-woman.jpg`, and
  `smoke-skull.jpg`, and trimmed `effects/Cameos.ts`'s `CameoKey`/
  `CAMEO_KEYS`/`CAMEO_LABELS`/`CAMEO_FILENAMES` back down to just
  `nicCutout`. The ghost-cameo picker architecture built above (guest
  picks a key from a menu, cover-fill sizing, composited on demand in
  `composeSelectedBitmap`) is untouched and still live with the one
  cameo -- it's ready to take more choosable ghosts the moment there's
  artwork with clear rights to use, just add a key + file, same as
  before. Verified: `tsc -b --force`, `oxlint`, `npm run build`, and the
  full suite (180 tests) all clean.

## Ghost Strength wired to live opacity, plus a new licensed cameo -- done

- **"Ghost Strength" (Operator Panel) now actually does something.** It
  existed as a settings field and a slider already, but nothing read it --
  `OwnerCameoEngine.composite()` always used its fixed default opacity.
  `PhotoSelection` gained `ghostOpacity`, threaded from
  `state.settings.ghostStrength` through `composeSelectedBitmap` into the
  cameo's `opacity` option. A new `useEffect` in `App.tsx` recomposes the
  currently-shown photo whenever the operator drags the slider while a
  ghost is picked, so it's adjustable live on the photo already on screen
  (the user's explicit ask), not just for the next capture. Label updated
  to "Ghost Strength (opacity)" so it's clear what it controls.
- **New cameo: `geminiReacher`.** The user generated a bald, reaching
  humanoid apparition themselves with Gemini and confirmed it's for their
  own personal, non-commercial booth (not for sale/distribution).
  Licensing note for the record: Google's generative AI terms give the
  user usage rights to what they generate; the design leans on "The Rake"
  creepypasta aesthetic, which is community internet folklore with no
  single corporate rights-holder, and combined with personal/non-commercial
  use the practical risk here is low. Added as
  `public/cameo/gemini-reacher.jpg` plus a `geminiReacher` key in
  `Cameos.ts` (label "The Reacher") -- the five earlier unlicensed stock
  images stay removed; only `nicCutout` and `geminiReacher` are in the
  catalog now.
  Verified: `tsc -b --force`, `oxlint`, `npm run build`, and the full
  suite (180 tests, `tests/CapturePipeline.test.ts` updated for the new
  `ghostOpacity` field) all clean.

## Result screen: full-bleed stage, corner-mark branding -- done

Layout pass on the result screen per explicit user direction (with an
Instagram screenshot as a loose reference, discussed and scoped down
first -- CLAUDE.md section 32's "design for someone standing several feet
away, huge buttons" ruled out porting Instagram's icon-sidebar/gesture
UI wholesale, so only the parts that don't fight that were taken):

- **Full-bleed photo stage.** `result-photo-frame`/`result-photo`'s
  max-width/max-height grew from `min(85vw, 70vh)` / `52vh` to
  `min(96vw, 82vh)` / `68vh` -- the single biggest visual change, and the
  literal "make the stage bigger" ask.
- **Branding moved to corner marks.** The old `result-header` (a
  two-line "GHOST BOOTH" / "You've been spookified" title block) and the
  bottom `result-footer` ("🎃 HAPPY HALLOWEEN 🎃" paragraph) both took up
  in-flow vertical space above/below the photo. Replaced with two small
  `position: absolute` marks (`result-brand-mark` top-left,tagline
  top-right) that cost the layout zero vertical space -- freeing up the
  room the bigger stage above needed.
- **Bottom dock tightened, not shrunk.** `result-screen`'s gap/padding
  were trimmed (32px generic -> 12px/14px), and `feature-carousel`'s
  max-width was bumped to match the new wider stage. The RETAKE/PRINT/
  GOOFY/SPOOKY/ORIGINAL icon buttons and the Frame/Overlays/Filter/Poster
  carousel chips are untouched in size/label -- explicitly kept "exactly
  as chunky" per the user's direction, since those are the touch targets
  a guest standing several feet from the iPad actually needs to hit.
  Verified: `tsc -b --force`, `oxlint`, `npm run build`, and the full
  suite (180 tests, no test referenced the removed header/footer markup)
  all clean.

## Fixed: stage-size CSS bug from the previous pass -- done

The user correctly called out that the result photo didn't actually look
any bigger after the full-bleed pass above. Root cause: `.result-photo-frame`
used `display: inline-flex` with only `max-width`/`max-height` -- that
sizes the box to its content's rendered size, so it only ever shrank a
photo bigger than the cap; a captured photo already smaller than the
(new, bigger) cap left the box exactly as small as before. Bumping the
vh/vw ceiling numbers did nothing in that case, which is exactly what got
reported. Fixed by giving the box explicit `width`/`height` (not just
`max-*`) so it always claims the full stage footprint the CSS specifies,
independent of the source photo's resolution; `object-fit: contain` on
the `<img>` still guarantees no cropping -- any aspect mismatch just
letterboxes against the box's own black background instead. Verified
with a minimal Playwright harness reusing the built CSS against a
deliberately small stand-in image (400x300): the box measured exactly
`min(96vw, 82vh)` x `68vh` as specified, confirming the fix, before
re-verifying `tsc -b --force`, `oxlint`, `npm run build`, and the full
suite (180 tests) and redeploying.

## Result stage: switched to flex-based sizing (fixes overflow + letterboxing) -- done

The vh-number approach to the stage box (52vh, then 68vh) was fundamentally
the wrong tool -- confirmed by the user's screenshot showing both black
letterbox bars inside the frame (its fixed aspect didn't match the photo's)
and the button dock partially pushed off the bottom of the viewport (68vh
plus the dock's real height exceeded 100vh on that device). A hardcoded
vh number can't know how tall the dock will actually render, so it was
always going to be wrong on some device.

Replaced with flexbox: `result-screen` is now `display: flex;
flex-direction: column`, and `result-photo-frame` is `flex: 1; min-height:
0; width: 100%` -- the stage claims exactly whatever vertical space is
left over after the dock (result-icon-row + feature-carousel, both
`flex: none` so they stay sized to their content) takes what it needs.
This can't overflow by construction: the stage's height is *defined* as
"the remainder," not a guess that might exceed it. `min-height: 0` is the
detail that makes this actually work -- without it a flex child's default
min-height is its content's intrinsic size, and an `object-fit: contain`
image's intrinsic height could still force the box past the available
space, reproducing the same overflow.

Verified two ways: a Playwright harness rendered the real built CSS
against mocked dock markup at three iPad viewport sizes (1024, 820, 768px
tall, covering iPad Pro/Air/classic landscape) -- confirmed zero page
overflow and the full icon row always ending inside the viewport at all
three -- plus a screenshot showing the photo filling nearly the entire
leftover space with only the letterboxing genuinely required by aspect
mismatch (not the layout's own guesswork). Then `tsc -b --force`,
`oxlint`, `npm run build`, and the full suite (180 tests, no test touches
this CSS) all clean.

## Result stage: iOS Safari `100dvh` fix + sidebar layout -- done

The flexbox fix above tested correctly against desktop headless Chromium
at three iPad heights, but the user still reported buttons cut off at the
bottom on the real iPad, with a screenshot showing Safari's own chrome
(address bar) visible. Root cause the flexbox math couldn't have caught:
`.booth-shell` (the root `position: fixed` container everything else
sizes against) used `height: 100vh`. On iOS Safari, `100vh` is the full
layout viewport *including* the area behind the collapsible address
bar/tab strip -- when that chrome is showing (not collapsed), a
fixed-position `100vh` box is taller than what's actually visible on
screen, silently pushing content below the fold. Every `flex: 1;
min-height: 0` calculation downstream was correct math running inside a
container that was already taller than the real visible viewport --
invisible to desktop Chromium, which doesn't replicate this behavior.
Fixed with `height: 100dvh` (dynamic viewport height, tracks the actual
visible area) declared after the `100vh` line so `100vh` still applies as
a fallback in browsers that don't support `dvh`.

Separately, per the user's explicit request ("put the buttons on the left
hand side and all the options below the image"), `ResultScreen.tsx` was
restructured: the RETAKE/PRINT/GOOFY/CAPTION/ORIGINAL icon buttons now
live in a `result-sidebar` column (`flex: none`, left side), and the photo
frame + `FeatureCarousel` live together in a `result-main` column
(`flex: 1; min-width: 0`) next to it -- `result-screen` itself switched
from a `flex-direction: column` single stack to a `flex-direction: row`
of those two. This removes an entire row from the vertical stack (the old
icon row), independent of the `100dvh` fix, and was the user's own
suggested structural fix from an earlier report. The dead `.result-icon-row`
CSS rule was removed; stale comments referencing it were updated to point
at `.result-main`/`.result-photo-frame` instead.

Verified with a new Playwright harness that wraps the mocked markup in
`.booth-shell` itself (exercising the real `dvh` fix in its actual
container, not just the inner flex math) with the new sidebar structure,
at the same three iPad landscape heights (1024/820/768px) -- confirmed
zero overflow (sidebar bottom, stage bottom, and carousel bottom all
within the viewport) at all three, plus a screenshot visually confirming
the sidebar renders correctly alongside the full-height stage and
carousel. Then `tsc -b --force`, `oxlint`, `npm run build`, and the full
suite (180 tests, no test touches this CSS/markup) all clean.

## Heisterkamp frame: raster bloody-hands border -- done

Per explicit direction ("use the bloody fingers as the border... words at
the bottom as it currently is"), the Heisterkamp frame's border is now a
raster image -- a ring of bloody clasped hands the user generated with
Gemini (same personal/non-commercial licensing basis as `geminiReacher`,
confirmed with the user before use) -- replacing the earlier procedural
top-of-frame blood-drip streaks. This is the first frame in `Frames.ts`
to use a raster asset rather than pure Canvas2D drawing; every other
frame is untouched.

The source image had its "transparent" center rendered as a literal
checkerboard pattern (not real alpha), so it was processed into a proper
cutout before adding it to the repo: flagged every near-grayscale pixel
(low saturation -- the checkerboard is neutral gray, the hands/blood are
warm-toned) as background, took its largest connected component as the
hole, set that region's alpha to 0 with a slight Gaussian feather on the
edge for a soft, non-jagged cutout, then downscaled to 1100px wide
(~1.1MB PNG) since it's fetched by every photo composited with this frame.
Saved as `public/frames/heisterkamp-hands-border.png`.

Compositing it required `Frames.ts`'s `drawFrame()` to become async for
the first time (every other frame draws synchronously with Canvas2D
calls only) -- `drawHeisterkampFrame` now fetches the border image once
via a cached `loadHeisterkampBorderImage()` (same fetch+createImageBitmap
pattern as `OwnerCameoEngine`, degrading to no border rather than
throwing on a load failure per CLAUDE.md section 49) and draws it
stretched to exactly the canvas's width/height -- not "cover"-cropped --
so the transparent center always lines up with the photo underneath
regardless of the photo's own aspect ratio. `CompositionEngine.ts`'s one
call site now awaits `drawFrame()`. The now-dead `drawBloodDrips` helper
(only ever used by the old top-of-frame streaks) was removed entirely.

Verified: `tsc -b --force`, `oxlint`, `npm run build`, and the full suite
(180 tests, none exercise `heisterkamp` specifically so none needed
changes) all clean. Also verified visually with a Playwright harness that
fetches the real built asset from a `vite preview` server and runs the
exact border-stretch + banner/text draw calls against a stand-in photo
canvas -- confirmed the border rings the photo with the center showing
through cleanly and the banner text stays legible and untouched by the
border art.

## Frame and Overlays features removed entirely -- done

Per explicit user direction ("Meh -- I think these all stink .. remove
all the frames and overlays, keep the ghosts, filters, and posters"),
the Frame feature (every `FrameKey`/`FRAME_KEYS`/`FRAME_LABELS`,
`drawFrame`, and every procedural frame including the just-shipped
Heisterkamp raster bloody-hands border) and the Overlays feature
(`OverlayKey`/`OVERLAY_KEYS`/`OVERLAY_LABELS`, `drawOverlays`, and every
procedural overlay draw function) are gone from the app, guest-facing UI
through to operator settings. Ghost (cameo picker), Filter (horror
filters), and Poster (tint) are untouched and still work exactly as
before.

Deleted outright: `src/effects/Frames.ts`, `src/effects/Overlays.ts`
(both only ever implemented these two features), and
`public/frames/heisterkamp-hands-border.png` (the raster border asset,
now unreferenced).

Trimmed:

- `src/effects/HalloweenEffects.ts` -- removed the `OverlayKey` type;
  `CAPTIONS`/`pickCaption`/the other caption and processing-message data
  are untouched (that's a separate guest toggle, not part of this
  removal).
- `src/rendering/CompositionEngine.ts` -- `CompositionConfig` no longer
  has `frame`/`overlays`/`overlaySeed`; `compose()` no longer imports or
  calls `drawFrame`/`drawOverlays`, and its layer order is now just
  foreground -> caption.
- `src/app/CapturePipeline.ts` -- `CapturePipelineSettings`,
  `PhotoOptions`, `DefaultSelection`, and `PhotoSelection` all lost their
  frame/overlay fields; `PhotoRecipe` lost `overlaySeed` (nothing
  consumes it anymore); `composeSelectedBitmap` no longer passes
  `frame`/`overlays`/`overlaySeed` to `compose()`.
- `src/app/App.tsx` -- removed `frameKey`/`overlayKeys` state,
  `handleSelectFrame`/`handleToggleOverlayKey`, and every place that read
  or threaded frame/overlay values through `currentSelection`,
  `handleCountdownComplete`, `handleShowOriginal`, `resetGuestPicks`,
  `RenderScreenArgs`, and the props handed to `ResultScreen`.
- `src/components/FeatureCarousel.tsx` -- removed the Frame and Overlays
  tab categories entirely (including the poster-disables-frame graying
  logic, which no longer applies to anything); Ghost/Filter/Poster tabs
  are unchanged.
- `src/components/ResultScreen.tsx` -- removed the frame/overlay props
  and their pass-through to `FeatureCarousel`.
- `src/components/OperatorPanel.tsx` -- removed the "Frame" select
  dropdown and the "Overlays" checkbox fieldset (and their now-unused
  imports); the Horror Filters fieldset directly below reuses the same
  `operator-overlay-fieldset`/`operator-overlay-grid` CSS classes as
  before, so those styles stay in `app.css`.
- `src/app/Settings.ts` -- removed `BoothSettings.frame` and
  `BoothSettings.overlays` and their defaults; existing persisted
  settings objects that still have those keys are simply ignored going
  forward (`SettingsStore.ts` merges onto `defaultSettings`, so no
  migration was needed).
- `src/app/app.css` -- removed the now-dead `.feature-carousel-hint`
  rule (only ever shown for the disabled-by-Poster Frame tab) and
  touched up a couple of comments that mentioned frame/overlay.
- `tests/CompositionEngine.test.ts` -- removed the overlay-drawing test,
  the frame-drawing test, and reworked the layer-order and
  field-pass-through tests to drop frame/overlay config.
- `tests/CapturePipeline.test.ts` -- dropped frame/overlay fields from
  every `CapturePipelineSettings`/`PhotoSelection`/`PhotoRecipe` fixture
  and the assertions that checked frame/overlay options and defaults;
  the Poster-forces-frame-off test was reworded since there's no frame
  to force off anymore, and the "independent seeds" test now checks
  result identity instead of `recipe.overlaySeed` (which no longer
  exists).

No `tests/Frames.test.ts`, `tests/Overlays.test.ts`, or frame/overlay-
specific parts of `tests/HalloweenEffects.test.ts` existed to delete --
`HalloweenEffects.test.ts` only ever covered `pickCaption`, which is
unaffected.

Verified: `tsc -b --force`, `npx vitest run` (178 tests, down from 180 --
two overlay/frame-specific `CompositionEngine` tests were removed with
nothing to replace them), `npx oxlint`, and `npm run build` all clean.
A final repo-wide grep for `FrameKey|frameKey|frameOptions|onSelectFrame|
drawFrame|OverlayKey|overlayKeys|overlayOptions|onToggleOverlay|
drawOverlays|FRAME_KEYS|FRAME_LABELS|OVERLAY_KEYS|OVERLAY_LABELS` across
`src/`, `tests/`, and `public/` came back empty.

## Print-readiness review for the Kodak Mini 2 Retro -- done

The user hooked up the camera and asked for a code review to confirm the
booth is ready to print to the confirmed hardware (Kodak Mini 2 Retro, see
Phase 9 above) at the correct size, plus the fastest way to test it. Full
review of the capture -> print pipeline:

- **Defaults already correct**: `Settings.ts`'s `printerAdapter: "shareSheet"`
  and `printLayout: "2x3"` match the Kodak's actual output shape and the
  only viable hand-off mechanism (no Web Bluetooth in Safari, no Kodak
  SDK -- see `ShareSheetPrinterAdapter.ts`'s own docstring).
- **The bitmap that gets printed is the one the guest actually sees.**
  Traced `masterBitmapRef` end to end: `applyPhotoSelection` -- which runs
  on every Ghost/Filter/Poster/Caption tap -- sets it to the exact same
  composed bitmap `resultImageUrl` is built from, so `handlePrintRequested`
  can't ever print a stale or different combination than what's on screen.
- **Crop-to-paper-shape math (`PrintLayout.ts`) is correct and already
  unit tested** (`tests/PrintLayout.test.ts`) -- a "cover" center-crop to
  2:3, preserving the source's landscape orientation, run once right
  before the adapter call, never touching what's cached for display.
- **Found and fixed a real bug**: the print-failure screen's "SAVE PHOTO"
  button (`PrintingScreen.tsx`) was wired straight to `handleDone`, which
  just resets the booth back to attract mode -- discarding the photo
  without saving it anywhere, the literal thing CLAUDE.md section 39 says
  never to do ("Never discard the finished image merely because printing
  failed"). Added `App.tsx`'s `handleSavePhoto`: re-crops to the print
  layout, then tries the Web Share API directly (same "Save to Photos"
  path the Kodak share-sheet flow already relies on) with a plain
  anchor-tag download as the fallback for a browser/device that can't
  share files at all. Threaded through `RenderScreenArgs` as
  `onSavePhoto` (the existing args-object pattern every other screen
  handler already uses) rather than referenced directly, since
  `renderScreen` is a plain function outside the `App()` component and
  doesn't close over its hooks. Best-effort per CLAUDE.md section 49 -- a
  failed save (or a guest simply backing out of the share sheet,
  `AbortError`) never blocks finishing up.
- **Made the operator's TEST PRINTER button actually useful.** It
  previously printed an empty, zero-byte `Blob` -- technically exercises
  `navigator.canShare`, but shows nothing meaningful in the Kodak app and
  can't confirm the crop shape is right. Replaced with
  `createPrinterTestBitmap()`, a synthetic test card (ghost emoji, the
  configured layout name, a timestamp, and a thick border specifically so
  any stretching/cropping is immediately obvious) run through the exact
  same `cropToPrintLayout` + `printerManager.print` path a real photo
  takes. This is now the fastest way to test the one open question left
  on the printing side (PROJECT_LOG's Phase 9 note): whether the Kodak
  Photo Printer app actually accepts a Web Share API hand-off -- one tap
  in the operator panel, no posing for the camera, no face detection,
  same real adapter and real crop math as a guest's photo would use.

**Still needs a hands-on test on the real device** (this session has no
access to the iPad or the paired printer) -- the fastest path once both
are in the same room: Operator Panel -> Printer dropdown confirms "Share
Sheet" is selected -> Print Layout dropdown confirms "2x3 (Kodak Mini 2
Retro)" -> TEST PRINTER. If the Kodak Photo Printer app appears in the
share sheet and accepts the hand-off, the booth is print-ready end to
end; if it doesn't appear or rejects the file, that's the one genuine
unknown this architecture already flagged, and BrowserPrintAdapter/
AirPrintAdapter are the fallback options already built and selectable
from the same dropdown without further code changes.

Verified: `tsc -b --force`, `npx vitest run` (178 tests, all green --
none needed changes since App.tsx isn't unit tested directly, consistent
with this project's existing convention of keeping business logic in
tested modules like CapturePipeline.ts and treating App.tsx as
orchestration glue), `oxlint`, `npm run build` all clean. Also visually
confirmed the new test card renders correctly (readable text, intact
border, no stretching) via a Playwright screenshot of the exact draw
calls against the real built app.

## Confirmed on the real device: Kodak Photo Printer isn't reachable from the share sheet -- copy fixed

The user tested TEST PRINTER on the actual iPad with the printer set up.
Result: the Kodak Photo Printer app does not appear as a row in the share
sheet at all, and there's no way to add it there either -- confirming
this is a platform limitation, not a bug in the code. The Kodak app is
not a registered iOS share extension (so `navigator.share()` can never
list it, regardless of the file/MIME type) and it's not AirPrint-
compatible either (so the system Print dialog can't reach it either).
There is no web-page mechanism -- Web Share API, `<a download>`, iframe
print, anything -- that can hand a photo directly to an app that hasn't
registered as a share target. This isn't something more code can fix.

The actual working path, confirmed against what "Save Image" already
does in that same share sheet: save the photo to the Photos library, then
the operator opens the Kodak Photo Printer app themselves and picks it
from the camera roll there. A real two-tap, two-app handoff, not the
one-tap print the app's copy had been implying.

Fixed the copy across the app so it stops promising something that can't
happen and tells the operator the real next step instead:
- `ShareSheetPrinterAdapter.ts`: `name` and the share sheet's own `text`
  now say "Save Image, then open Kodak Photo Printer" instead of "pick a
  printer app to print this photo" -- the class/mechanism itself is
  unchanged (it was always just triggering the OS share sheet, which is
  still the only way to get a photo into Photos from a web page), only
  what it tells the guest/operator to do with what they see changed.
- `OperatorPanel.tsx`'s printer dropdown label updated to match.
- `PrintingScreen.tsx`'s "success" state used to unconditionally say "YOUR
  PHOTO HAS BEEN CONJURED" -- implying the print itself finished, which
  for the Share Sheet adapter was never something this app could actually
  confirm. It now takes a `printerAdapter` prop and shows adapter-specific
  copy: "PHOTO SAVED TO YOUR PHOTOS. Open the Kodak Photo Printer app to
  print it from there." for `shareSheet`, keeping the original "conjured"
  message for `browserPrint`/`airPrint`/`mock` where "success" does mean
  the print dialog/mock actually ran. Threaded `printerAdapter` through
  `App.tsx`'s existing `RenderScreenArgs` pattern (same as `onSavePhoto`
  earlier this session).

No behavior change to the actual mechanism -- this is a documentation/UX
fix once the real constraint was confirmed, not a new code path. The
booth is still fully functional end to end; the printing step just
requires the operator to do one more manual switch-to-Kodak-app tap than
the app's copy previously implied, which is now stated plainly instead of
promised away.

Verified: `tsc -b --force`, `npx vitest run` (178 tests, all green -- no
test exercises PrintingScreen/ShareSheetPrinterAdapter copy directly, so
none needed changes), `oxlint`, `npm run build` all clean.

## "Print to Kodak" Shortcut path -- one tap to album + auto-open

The user asked whether photos could land in their existing "Halloween
2026" Photos album and have a shortcut automatically open the Kodak app.
Checked Apple's current Shortcuts docs before proposing anything: iOS
Shortcuts' Personal Automations have no "photo added to album" trigger at
all (confirmed against Apple's own trigger list -- Wi-Fi, Bluetooth,
Focus, Low Power Mode, Battery Level, Charger, NFC, App open/close,
Airplane Mode; nothing Photos-related), so a background automation on
album changes isn't possible on this platform, full stop.

The mechanism that actually gets the same practical result: a Shortcut
can be set to **appear directly in the share sheet** (Shortcuts app ->
shortcut's Details/settings -> "Show in Share Sheet", a real, long-
standing iOS feature -- also confirmed against Apple's docs). Since the
booth's ShareSheetPrinterAdapter already opens that exact share sheet, a
shortcut named "Print to Kodak" with that toggle on, built once by the
operator with two actions --  "Save to Photo Album" (pointed at
"Halloween 2026") then "Open App" (pointed at Kodak Photo Printer) --
shows up as its own tappable icon right next to "Save Image." One tap
there does both things at once: saves to the correct album *and*
launches Kodak automatically, no manual app-switching. Not a fully
unattended zero-tap print (Kodak's own Print button still needs one
tap once it's open, and there's no Kodak-published Shortcuts action to
drive that programmatically), but a real improvement over the
Save-Image-then-hunt-for-the-app flow from earlier this session.

This lives entirely in Settings-app/Shortcuts-app configuration on the
user's device -- nothing here can build it remotely -- so the code
change is just updating references to match once it exists:
`ShareSheetPrinterAdapter.ts`'s docstring and the share sheet's own
`text` now mention "Print to Kodak" by the exact name the operator
should give the shortcut, and `PrintingScreen.tsx`'s success message
covers both paths ("If you tapped 'Print to Kodak,' the Kodak app is
opening now -- otherwise open it yourself to print") since the app has
no way to know from here which of the two share-sheet options the
operator actually tapped.

**Setup steps handed to the user directly (not committed anywhere, since
it's one-time manual device configuration, not app behavior)**: create
the shortcut in the Shortcuts app, add "Save to Photo Album" targeting
Halloween 2026, add "Open App" targeting Kodak Photo Printer, then turn
on "Show in Share Sheet" (optionally restricted to Images) in the
shortcut's settings.

Verified: `tsc -b --force`, `npx vitest run` (178 tests, all green --
copy-only change), `oxlint`, `npm run build` all clean.

## Fixed: share sheet's title/text were saving as a junk extra "image" -- done

The user got "Print to Kodak" working (see the permission-troubleshooting
entry above) but reported an unwanted second item landing in the
Halloween 2026 album alongside each real photo. Root cause: `navigator
.share()` in both `ShareSheetPrinterAdapter.print()` and `App.tsx`'s
`handleSavePhoto` passed `title`/`text` fields alongside `files`. The Web
Share API hands those to whatever's on the other end of the share sheet
as their own separate shared items, not just descriptive metadata for the
sheet's header -- and the "Print to Kodak" Shortcut's "Receive Images and
2 more from Share Sheet" step (the "2 more" being exactly this) picked up
all of them, so "Save to Photo Album" saved the text string as a second,
junk "image" right next to the real photo.

Fixed by dropping `title`/`text` entirely from both `navigator.share()`
calls -- `files: [file]` only. The instructional copy that used to live
in the share sheet's `text` field (pointing the operator at "Print to
Kodak") isn't needed there anyway now that the shortcut has its own name
and icon in the sheet; the surrounding app copy (PrintingScreen's success
message, OperatorPanel's dropdown label) already explains the workflow
elsewhere.

Verified: `tests/ShareSheetPrinterAdapter.test.ts` updated to assert the
share call's argument object has *only* a `files` key (previously
asserted `title` was set, which is exactly what needed to change).
`tsc -b --force`, `npx vitest run` (178 tests, all green), `oxlint`,
`npm run build` all clean.
