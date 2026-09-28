import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppDispatchContext, AppStateContext, useAppReducer } from "./AppState";
import { AttractScreen } from "../components/AttractScreen";
import { CameraScreen } from "../components/CameraScreen";
import { Countdown } from "../components/Countdown";
import { ProcessingScreen } from "../components/ProcessingScreen";
import { ResultScreen } from "../components/ResultScreen";
import { PrintingScreen } from "../components/PrintingScreen";
import { OperatorPanel } from "../components/OperatorPanel";
import { GetUserMediaCameraManager } from "../camera/CameraManager";
import { captureMasterFrame } from "../camera/CaptureService";
import { imageBitmapToBlob } from "../utils/image";
import { PrinterManager } from "../printing/PrinterManager";
import { cropToPrintLayout } from "../printing/PrintLayout";
import { MockPrinterAdapter } from "../printing/MockPrinterAdapter";
import { ShareSheetPrinterAdapter } from "../printing/ShareSheetPrinterAdapter";
import { BrowserPrintAdapter } from "../printing/BrowserPrintAdapter";
import { AirPrintAdapter } from "../printing/AirPrintAdapter";
import type { PrinterAdapterKind } from "./Settings";
import type { PhotoPrinter } from "../printing/PrinterAdapter";
import { loadSettings, saveSettings } from "../storage/SettingsStore";
import { WorkerFaceDetector } from "../vision/WorkerFaceDetector";
import type { FaceModel } from "../vision/VisionTypes";
import { MeshWarpCaricatureEngine } from "../effects/CaricatureEngine";
import { OwnerCameoEngine } from "../effects/OwnerCameoEngine";
import { CAMEO_FILENAMES, type CameoKey } from "../effects/Cameos";
import { pickCaption } from "../effects/HalloweenEffects";
import type { PosterTint } from "../effects/PosterEffect";
import type { FilterKey } from "../effects/HorrorFilters";
import { Canvas2DCompositionEngine } from "../rendering/CompositionEngine";
import { createSeed, seededRandom } from "../utils/random";
import {
  analyzeAndWarpPhoto,
  composeSelectedBitmap,
  type PhotoBaseBitmaps,
  type PhotoOptions,
  type PhotoRecipe,
  type PhotoSelection,
} from "./CapturePipeline";
import "./app.css";

const printerManager = new PrinterManager(new MockPrinterAdapter({ failRate: 0 }));

// One instance per adapter kind, reused rather than reconstructed on every
// settings change -- none of these adapters hold a real connection worth
// tearing down/rebuilding (CLAUDE.md section 37-38's abstraction: swapping
// which one PrinterManager delegates to is the only thing that changes).
function createPrinterAdapter(kind: PrinterAdapterKind): PhotoPrinter {
  switch (kind) {
    case "shareSheet":
      return new ShareSheetPrinterAdapter();
    case "browserPrint":
      return new BrowserPrintAdapter();
    case "airPrint":
      return new AirPrintAdapter();
    case "mock":
    default:
      return new MockPrinterAdapter({ failRate: 0 });
  }
}
const caricatureEngine = new MeshWarpCaricatureEngine();
// Caption compositing (CLAUDE.md section 28) -- Canvas2D is the
// baseline/guaranteed-available tier (section 29); no state worth
// reconstructing between photos, so one shared instance.
const compositionEngine = new Canvas2DCompositionEngine();
// Ghost cameos -- ghostly-styled images the guest explicitly picks from a
// menu to composite into their photo (see effects/OwnerCameoEngine.ts and
// effects/Cameos.ts), sized to dominate the frame rather than sit as a
// small corner sticker. A real per-guest ghost generated live from each
// guest's own segmented photo was tried and reverted (it didn't look great
// and wasn't reliable enough -- CLAUDE.md section 64 prioritizes booth
// reliability over a fancier effect); this fixed-asset approach is simpler
// and more predictable. Add a new file under public/cameo/ plus a key in
// effects/Cameos.ts to add another choosable cameo -- nothing else needs to
// change. Same subpath-safe URL resolution as the face-detector models
// below -- these need to resolve correctly under a GitHub Pages subpath
// deployment too.
const ownerCameoEngine = new OwnerCameoEngine(
  Object.fromEntries(
    Object.entries(CAMEO_FILENAMES).map(([key, name]) => [key, new URL(`cameo/${name}`, document.baseURI).href]),
  ) as Record<CameoKey, string>,
);

// Resolved against document.baseURI (not a bare relative path) so the
// worker's model fetches still land on /models/ correctly even when the
// app is served from a subpath, e.g. GitHub Pages at
// https://<user>.github.io/ghost-booth/ rather than a domain root.
const faceDetector = new WorkerFaceDetector(new URL("models/", document.baseURI).href);

// Renders a synthetic test card -- not a captured photo -- for the
// operator panel's TEST PRINTER button (CLAUDE.md section 48). Goes
// through the exact same crop-to-paper-shape + printer-adapter path a
// real print does (see handlePrintRequested), so one tap verifies the
// real Kodak Mini 2 Retro hand-off (share sheet -> Kodak Photo Printer
// app -> actual paper) without posing for the camera or running face
// detection first -- the fastest way to test the one open question this
// booth has left (PROJECT_LOG.md): whether the Kodak app actually accepts
// a Web Share API hand-off. The big centered crop-shape label is the
// point: if the test print comes out stretched, letterboxed, or the wrong
// shape, that's immediately obvious without needing to compare against a
// real photo.
async function createPrinterTestBitmap(layout: string): Promise<ImageBitmap> {
  const width = 1600;
  const height = 1067; // matches the 1920x1080-ish master aspect from CameraManager
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D context unavailable for printer test card");
  }
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1a0d24");
  gradient.addColorStop(1, "#3a0a12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#ff7a1a";
  ctx.lineWidth = 20;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ff7a1a";
  ctx.font = '900 100px Impact, "Arial Black", sans-serif';
  ctx.fillText("👻 PRINTER TEST", width / 2, height / 2 - 90);
  ctx.fillStyle = "#f4e6c8";
  ctx.font = '700 56px Impact, "Arial Black", sans-serif';
  ctx.fillText(`Layout: ${layout.toUpperCase()}`, width / 2, height / 2 + 10);
  ctx.font = "400 34px sans-serif";
  ctx.fillText(new Date().toLocaleString(), width / 2, height / 2 + 80);
  ctx.font = "400 30px sans-serif";
  ctx.fillText("If this border isn't stretched or cropped, printing is ready.", width / 2, height / 2 + 150);

  return canvas.transferToImageBitmap();
}

const EMPTY_PHOTO_OPTIONS: PhotoOptions = {
  ghostOptions: [],
  caption: false,
  posterTints: [],
  filterOptions: [],
};

export default function App() {
  const [state, dispatch] = useAppReducer();
  const [operatorPanelOpen, setOperatorPanelOpen] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"printing" | "success" | "failed">("printing");
  const [faces, setFaces] = useState<FaceModel[]>([]);
  // Guest-facing picks for the current photo. Goofy/Ghost/Caption stay
  // simple booleans (CLAUDE.md section 25's captions and "My Cameo" aren't
  // guest-selectable beyond on/off); Poster/Filter are now
  // explicit choices the guest makes in CustomizePanel, not just on/off --
  // see CapturePipeline.ts's PhotoSelection for why. None of these are
  // baked into a precomputed bitmap variant -- see applyPhotoSelection
  // below for why. Defaults are set fresh on every capture in
  // handleCountdownComplete, from analyzeAndWarpPhoto's `defaults`.
  const [goofyFilterOn, setGoofyFilterOn] = useState(true);
  const [ghostKey, setGhostKey] = useState<CameoKey | null>(null);
  const [captionOn, setCaptionOn] = useState(false);
  const [posterTint, setPosterTint] = useState<PosterTint | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey | null>(null);
  // What the guest can currently choose from (CapturePipeline.ts's
  // PhotoOptions) -- drives which sections CustomizePanel shows, and
  // whether the result screen's CUSTOMIZE/CAPTION/SPOOKY buttons render at
  // all. Recomputed every capture; empty (nothing to offer) before the
  // first photo.
  const [photoOptions, setPhotoOptions] = useState<PhotoOptions>(EMPTY_PHOTO_OPTIONS);
  // Bumped on every guest interaction with the result screen (goofy/ghost/
  // caption toggle, or any FeatureCarousel pick) so the idle timer below
  // re-arms on that activity, not just on booth-state changes. Without
  // this, a guest quietly browsing filter/poster options
  // never touches state.booth.state, so the idle timer kept counting down
  // underneath them and discarded the photo mid-choice (reported: photo
  // vanishing ~30s in, before printing).
  const [activityTick, setActivityTick] = useState(0);

  const cameraRef = useRef<GetUserMediaCameraManager | null>(null);
  const masterBitmapRef = useRef<ImageBitmap | null>(null);
  // The four "base" bitmaps for the current photo -- goofy x ghost, and
  // nothing else. Frame/overlays/caption/poster/filter are no longer baked
  // into precomputed pairs: with an open-ended combination of guest picks
  // now instead of a handful of booleans, caching every combination up
  // front doesn't scale, so applyPhotoSelection below composes the current
  // selection on demand instead. A compose() call is one cheap canvas
  // draw, well within toggle-tap latency, so this doesn't cost noticeably
  // more per tap than the old swap-a-cached-bitmap approach did.
  const originalBitmapRef = useRef<ImageBitmap | null>(null);
  const caricaturedBitmapRef = useRef<ImageBitmap | null>(null);
  // The per-photo "recipe" (caption) decided once
  // at capture time from the seeded rng (CLAUDE.md section 20), so
  // re-picking poster/filter never reshuffles which caption the photo uses.
  const photoRecipeRef = useRef<PhotoRecipe | null>(null);
  const settingsLoadedRef = useRef(false);

  // Load persisted operator settings once on startup.
  useEffect(() => {
    if (settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    loadSettings().then((settings) => {
      dispatch({ kind: "settings", patch: settings });
    });
  }, [dispatch]);

  // Load the face-detection model during booth setup, not while a guest is
  // waiting mid-flow (mirrors CLAUDE.md section 2's rule for camera
  // permission). A failed/slow load degrades gracefully: detect() just
  // returns no faces until/unless init succeeds (section 49).
  useEffect(() => {
    faceDetector.init().catch((err) => {
      console.warn("Face detection model failed to load; falling back to no-face-detected.", err);
    });
    return () => faceDetector.dispose();
  }, []);

  // Persist settings whenever they change (debounced by React batching).
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    saveSettings(state.settings);
  }, [state.settings]);

  // Keep the printer manager's active adapter in sync with the operator's
  // "Printer" setting (defaults to the mock adapter until this runs once
  // settings finish loading).
  useEffect(() => {
    printerManager.setAdapter(createPrinterAdapter(state.settings.printerAdapter));
  }, [state.settings.printerAdapter]);

  // Idle timeout: return to attract from any non-attract, non-error state
  // after the configured window of inactivity (CLAUDE.md sections 33, 43).
  // Also re-arms on activityTick (see its declaration above) so time spent
  // actively picking frame/overlay/filter/poster options on the result
  // screen -- which never changes state.booth.state -- doesn't silently
  // eat into the same countdown as genuine inactivity. Skips "printing" too:
  // that transition is driven by the printer adapter finishing, not by
  // guest taps, so it shouldn't be racing the idle timer at all.
  useEffect(() => {
    if (
      state.booth.state === "attract" ||
      state.booth.state === "printing" ||
      !state.settings.attractModeEnabled
    ) {
      return;
    }
    const timer = setTimeout(() => {
      dispatch({ kind: "booth", event: { type: "IDLE_TIMEOUT" } });
    }, state.settings.idleTimeoutSeconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.booth.state, state.settings.attractModeEnabled, state.settings.idleTimeoutSeconds, activityTick]);

  const handleCameraReady = useCallback((camera: GetUserMediaCameraManager) => {
    cameraRef.current = camera;
    dispatch({ kind: "booth", event: { type: "CAMERA_READY" } });
  }, [dispatch]);

  const handleCameraError = useCallback((message: string) => {
    dispatch({ kind: "booth", event: { type: "CAMERA_ERROR", message } });
  }, [dispatch]);

  const handleStartCountdown = useCallback(() => {
    dispatch({ kind: "booth", event: { type: "START_COUNTDOWN" } });
  }, [dispatch]);

  // Composes the guest's current picks into the photo shown/printed, and
  // swaps resultImageUrl to it. The chosen filter (if any) grades the
  // source first, then the chosen poster tint (if any) grades on top of
  // that. The caption toggle is independent of that choice
  // and, when on, is drawn on top.
  const applyPhotoSelection = useCallback(async (selection: PhotoSelection) => {
    const recipe = photoRecipeRef.current;
    const original = originalBitmapRef.current;
    const caricatured = caricaturedBitmapRef.current;
    if (!recipe || !original || !caricatured) return;
    const base: PhotoBaseBitmaps = { original, caricatured };

    const bitmap = await composeSelectedBitmap(base, recipe, selection, { compositionEngine, ownerCameoEngine });
    if (!bitmap) return;

    masterBitmapRef.current = bitmap;
    const blob = await imageBitmapToBlob(bitmap);
    const url = URL.createObjectURL(blob);
    setResultImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    // Every guest pick is activity -- see activityTick's declaration.
    setActivityTick((t) => t + 1);
  }, []);

  const currentSelection = useCallback(
    (overrides: Partial<PhotoSelection> = {}): PhotoSelection => ({
      goofy: goofyFilterOn,
      ghostKey,
      ghostOpacity: state.settings.ghostStrength,
      captioned: captionOn,
      posterTint,
      filterKey,
      ...overrides,
    }),
    [goofyFilterOn, ghostKey, state.settings.ghostStrength, captionOn, posterTint, filterKey],
  );

  // "Ghost Strength" is meant to be adjustable live (the user's explicit
  // ask: adjust ghost transparency on the fly, not just at capture time) --
  // recompose the currently-shown photo whenever the operator drags that
  // slider while a ghost is actually picked, same as any other guest pick
  // changing. A no-op when there's no photo yet or no ghost active (the
  // dependency on ghostKey guards the latter).
  useEffect(() => {
    if (!ghostKey) return;
    void applyPhotoSelection(currentSelection());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.ghostStrength]);

  const handleToggleGoofyFilter = useCallback(() => {
    const next = !goofyFilterOn;
    setGoofyFilterOn(next);
    void applyPhotoSelection(currentSelection({ goofy: next }));
  }, [goofyFilterOn, currentSelection, applyPhotoSelection]);

  const handleSelectGhost = useCallback((key: CameoKey | null) => {
    setGhostKey(key);
    void applyPhotoSelection(currentSelection({ ghostKey: key }));
  }, [currentSelection, applyPhotoSelection]);

  const handleSelectPoster = useCallback((tint: PosterTint | null) => {
    setPosterTint(tint);
    void applyPhotoSelection(currentSelection({ posterTint: tint }));
  }, [currentSelection, applyPhotoSelection]);

  const handleSelectFilter = useCallback((key: FilterKey | null) => {
    setFilterKey(key);
    void applyPhotoSelection(currentSelection({ filterKey: key }));
  }, [currentSelection, applyPhotoSelection]);

  // Caption toggle: unlike the picker categories above, every tap --
  // whether it's turning the caption on or switching it back off -- also
  // rerolls which line is queued, so a guest who keeps tapping cycles
  // through different captions rather than seeing the same one reappear
  // every time they turn it back on. Only rerolls in "random" caption
  // mode; a "fixed" caption is still just shown/hidden (there's nothing to
  // randomize between). Uses a fresh seeded rng (createSeed()/
  // seededRandom(), same PRNG as every other random choice in the app --
  // CLAUDE.md section 20) rather than a bare Math.random(), so this is the
  // only place in the effects pipeline consistently going through one
  // randomness source; a new seed each tap still means each reroll is
  // effectively unpredictable, this interaction just isn't meant to be
  // reproduced for debugging the way a captured photo's own recipe is.
  const handleToggleCaption = useCallback(() => {
    const next = !captionOn;
    setCaptionOn(next);
    if (photoRecipeRef.current && state.settings.captionMode === "random") {
      const caption = pickCaption("random", "", seededRandom(createSeed()));
      photoRecipeRef.current = { ...photoRecipeRef.current, caption };
    }
    void applyPhotoSelection(currentSelection({ captioned: next }));
  }, [captionOn, state.settings.captionMode, currentSelection, applyPhotoSelection]);

  // One-tap revert to the plain candid: turns every guest pick off/back to
  // "nothing applied" in a single action (CLAUDE.md section 36's result
  // screen always needs a clean way back to "just the photo," and beta
  // testing needs to be able to check every feature against a known-off
  // baseline quickly).
  const handleShowOriginal = useCallback(() => {
    setGoofyFilterOn(false);
    setGhostKey(null);
    setCaptionOn(false);
    setPosterTint(null);
    setFilterKey(null);
    void applyPhotoSelection({
      goofy: false,
      ghostKey: null,
      ghostOpacity: state.settings.ghostStrength,
      captioned: false,
      posterTint: null,
      filterKey: null,
    });
  }, [applyPhotoSelection, state.settings.ghostStrength]);

  const handleCountdownComplete = useCallback(async () => {
    dispatch({ kind: "booth", event: { type: "COUNTDOWN_COMPLETE" } });
    const camera = cameraRef.current;
    if (!camera) {
      dispatch({ kind: "booth", event: { type: "CAPTURE_ERROR", message: "Camera not ready" } });
      return;
    }
    try {
      const master = await captureMasterFrame(camera, { mirrorPreview: true });
      masterBitmapRef.current = master;
      dispatch({ kind: "booth", event: { type: "FRAME_CAPTURED" } });

      // Vision analysis, caricature warp, "My Cameo" ghost compositing, and
      // this photo's caption recipe -- CapturePipeline.ts's
      // analyzeAndWarpPhoto (see that file for why this is a plain
      // function and not inline here). Never throws in a way that loses
      // the photo (CLAUDE.md section 49): 0 detected faces just means the
      // loop inside it does nothing, which is the spec's "no face
      // detected -> plain Halloween photo" fallback.
      const analyzed = await analyzeAndWarpPhoto(
        master,
        { faceDetector, caricatureEngine },
        {
          preset: state.settings.preset,
          caricatureStrength: state.settings.caricatureStrength,
          ownerCameoMode: state.settings.ownerCameoMode,
          captionMode: state.settings.captionMode,
          fixedCaption: state.settings.fixedCaption,
          posterMode: state.settings.posterMode,
          filters: state.settings.filters,
        },
      );

      setFaces(analyzed.faces);
      photoRecipeRef.current = analyzed.recipe;
      originalBitmapRef.current = analyzed.original;
      caricaturedBitmapRef.current = analyzed.caricatured;
      setPhotoOptions(analyzed.options);

      // Every fresh photo starts with Goofy Filter on (maxed-out effect by
      // default), Ghost off (the guest opts into a specific cameo from the
      // menu) -- Poster/Filter/Ghost default off so the guest deliberately
      // opts into those more dramatic whole-photo treatments via CUSTOMIZE
      // rather than finding them already applied.
      const { defaults, options } = analyzed;
      setGoofyFilterOn(true);
      setGhostKey(defaults.ghostKey);
      setCaptionOn(options.caption);
      setPosterTint(defaults.posterTint);
      setFilterKey(defaults.filterKey);
      await applyPhotoSelection({
        goofy: true,
        ghostKey: defaults.ghostKey,
        ghostOpacity: state.settings.ghostStrength,
        captioned: options.caption,
        posterTint: defaults.posterTint,
        filterKey: defaults.filterKey,
      });
      dispatch({ kind: "booth", event: { type: "PROCESSING_COMPLETE" } });
    } catch (err) {
      dispatch({
        kind: "booth",
        event: { type: "CAPTURE_ERROR", message: err instanceof Error ? err.message : "Capture failed" },
      });
    }
  }, [
    dispatch,
    state.settings.preset,
    state.settings.caricatureStrength,
    state.settings.ownerCameoMode,
    state.settings.captionMode,
    state.settings.fixedCaption,
    state.settings.posterMode,
    state.settings.filters,
    state.settings.ghostStrength,
    applyPhotoSelection,
  ]);

  const handlePrintRequested = useCallback(async () => {
    dispatch({ kind: "booth", event: { type: "PRINT_REQUESTED" } });
    setPrintStatus("printing");
    try {
      if (masterBitmapRef.current) {
        // Crop to the physical print shape (CLAUDE.md section 40's "master
        // image -> crop/fit to paper" step) once, right here, right before
        // handing off to the printer adapter -- doesn't touch what's cached
        // for the result screen or affect any of the on-screen toggles.
        const printReady = await cropToPrintLayout(masterBitmapRef.current, state.settings.printLayout);
        await printerManager.print(printReady, state.settings.copies);
      }
      setPrintStatus("success");
      dispatch({ kind: "booth", event: { type: "PRINT_SUCCESS" } });
    } catch (err) {
      setPrintStatus("failed");
      dispatch({
        kind: "booth",
        event: { type: "PRINT_FAILED", message: err instanceof Error ? err.message : "Print failed" },
      });
    }
  }, [dispatch, state.settings.copies, state.settings.printLayout]);

  const resetGuestPicks = useCallback(() => {
    setFaces([]);
    setGoofyFilterOn(true);
    setGhostKey(null);
    setCaptionOn(false);
    setPosterTint(null);
    setFilterKey(null);
    setPhotoOptions(EMPTY_PHOTO_OPTIONS);
  }, []);

  const handleRetake = useCallback(() => {
    resetGuestPicks();
    dispatch({ kind: "booth", event: { type: "RETAKE" } });
  }, [dispatch, resetGuestPicks]);

  const handleDone = useCallback(() => {
    resetGuestPicks();
    dispatch({ kind: "booth", event: { type: "DONE" } });
  }, [dispatch, resetGuestPicks]);

  // CLAUDE.md section 39: "Never discard the finished image merely because
  // printing failed" -- the PrintingScreen's "SAVE PHOTO" button used to
  // just call handleDone() directly, discarding the photo exactly like the
  // failure screen says never to do. This actually saves it first: the iOS
  // share sheet (same mechanism as ShareSheetPrinterAdapter, used here
  // directly rather than through the operator's chosen printer adapter,
  // since this needs to work regardless of *why* printing failed) offers
  // "Save to Photos" as one of its built-in options. A plain anchor-tag
  // download is the fallback for a browser/device that can't share files
  // at all. Either way this is best-effort (CLAUDE.md section 49) -- a
  // failed save must never block the guest from finishing up.
  const handleSavePhoto = useCallback(async () => {
    const bitmap = masterBitmapRef.current;
    if (bitmap) {
      try {
        const printReady = await cropToPrintLayout(bitmap, state.settings.printLayout);
        const blob = await imageBitmapToBlob(printReady);
        const file = new File([blob], `ghost-booth-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Ghost Booth Photo" });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        // AbortError just means the guest backed out of the share sheet --
        // not a failure. Anything else is a best-effort save that didn't
        // pan out; either way, don't block finishing up over it.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("Save photo failed:", err);
        }
      }
    }
    handleDone();
  }, [handleDone, state.settings.printLayout]);

  const handleRetry = useCallback(() => {
    dispatch({ kind: "booth", event: { type: "RETRY" } });
  }, [dispatch]);

  const contextValue = useMemo(() => state, [state]);

  return (
    <AppStateContext.Provider value={contextValue}>
      <AppDispatchContext.Provider value={dispatch}>
        <div className="booth-shell">
          {/* CLAUDE.md section 47 specifies a 5-second press-and-hold to
              reach operator settings, so guests don't stumble into it. The
              hold gesture (HoldToActivate, pointer events) isn't
              registering reliably in iPhone Safari, so this is a plain tap
              for now until that's root-caused; swap back to
              <HoldToActivate> once it works everywhere. */}
          <button
            type="button"
            className="booth-logo"
            aria-label="Open operator settings"
            onClick={() => setOperatorPanelOpen(true)}
          >
            👻
          </button>

          {renderScreen({
            boothState: state.booth.state,
            error: state.booth.error,
            countdownSeconds: state.settings.countdownSeconds,
            resultImageUrl,
            printStatus,
            printerAdapter: state.settings.printerAdapter,
            faces,
            debugMode: state.settings.debugMode,
            goofyFilterOn,
            ghostKey,
            ghostOptions: photoOptions.ghostOptions,
            captionOn,
            captionAvailable: photoOptions.caption,
            posterTints: photoOptions.posterTints,
            posterTint,
            filterOptions: photoOptions.filterOptions,
            filterKey,
            onStart: () => dispatch({ kind: "booth", event: { type: "GUEST_APPROACHED" } }),
            onCameraReady: handleCameraReady,
            onCameraError: handleCameraError,
            onStartCountdown: handleStartCountdown,
            onCountdownComplete: handleCountdownComplete,
            onPrint: handlePrintRequested,
            onRetake: handleRetake,
            onDone: handleDone,
            onSavePhoto: handleSavePhoto,
            onRetry: handleRetry,
            onToggleGoofyFilter: handleToggleGoofyFilter,
            onSelectGhost: handleSelectGhost,
            onToggleCaption: handleToggleCaption,
            onSelectPoster: handleSelectPoster,
            onSelectFilter: handleSelectFilter,
            onShowOriginal: handleShowOriginal,
          })}

          {operatorPanelOpen && (
            <OperatorPanel
              settings={state.settings}
              onChange={(patch) => dispatch({ kind: "settings", patch })}
              onReset={() => dispatch({ kind: "settings/reset" })}
              onClose={() => setOperatorPanelOpen(false)}
              onTestCamera={() => dispatch({ kind: "booth", event: { type: "GUEST_APPROACHED" } })}
              onTestCapture={handleCountdownComplete}
              onTestEffect={() => alert("Effect pipeline is stubbed in this phase.")}
              onTestPrinter={() =>
                createPrinterTestBitmap(state.settings.printLayout)
                  .then((bitmap) => cropToPrintLayout(bitmap, state.settings.printLayout))
                  .then((printReady) => printerManager.print(printReady, 1))
                  .catch((err) => alert(err instanceof Error ? err.message : "Test print failed"))
              }
              onDiscoverPrinter={() => printerManager.discover().then((d) => alert(JSON.stringify(d)))}
              onClearPrintQueue={() => printerManager.cancel()}
              onClearTempPhotos={() => {
                if (resultImageUrl) URL.revokeObjectURL(resultImageUrl);
                setResultImageUrl(null);
              }}
            />
          )}
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

interface RenderScreenArgs {
  boothState: import("../state/BoothStateMachine").BoothState;
  error?: string;
  countdownSeconds: number;
  resultImageUrl: string | null;
  printStatus: "printing" | "success" | "failed";
  printerAdapter: PrinterAdapterKind;
  faces: FaceModel[];
  debugMode: boolean;
  goofyFilterOn: boolean;
  ghostKey: CameoKey | null;
  ghostOptions: CameoKey[];
  captionOn: boolean;
  captionAvailable: boolean;
  posterTints: PosterTint[];
  posterTint: PosterTint | null;
  filterOptions: FilterKey[];
  filterKey: FilterKey | null;
  onStart: () => void;
  onCameraReady: (camera: GetUserMediaCameraManager) => void;
  onCameraError: (message: string) => void;
  onStartCountdown: () => void;
  onCountdownComplete: () => void;
  onPrint: () => void;
  onRetake: () => void;
  onDone: () => void;
  onSavePhoto: () => void;
  onRetry: () => void;
  onToggleGoofyFilter: () => void;
  onSelectGhost: (key: CameoKey | null) => void;
  onToggleCaption: () => void;
  onSelectPoster: (tint: PosterTint | null) => void;
  onSelectFilter: (key: FilterKey | null) => void;
  onShowOriginal: () => void;
}

function renderScreen(args: RenderScreenArgs) {
  switch (args.boothState) {
    case "attract":
      return <AttractScreen onStart={args.onStart} />;
    // The camera stream must stay alive and visible through ready ->
    // countdown -> capturing: CameraScreen stays mounted for all three and
    // we layer the countdown/processing UI on top of the live preview
    // instead of unmounting it (unmounting stops the MediaStream, which
    // previously broke capture — see tests/manual smoke run).
    case "camera":
    case "ready":
    case "countdown":
    case "capturing":
      return (
        <CameraScreen
          onReady={args.onCameraReady}
          onError={args.onCameraError}
          onStartCountdown={args.onStartCountdown}
          overlay={
            args.boothState === "countdown" ? (
              <Countdown seconds={args.countdownSeconds} onComplete={args.onCountdownComplete} />
            ) : args.boothState === "capturing" ? (
              <ProcessingScreen />
            ) : undefined
          }
        />
      );
    case "processing":
      return <ProcessingScreen />;
    case "result":
    case "printComplete":
      return (
        <ResultScreen
          imageUrl={args.resultImageUrl}
          onPrint={args.onPrint}
          onRetake={args.onRetake}
          faces={args.faces}
          debugMode={args.debugMode}
          goofyFilterOn={args.goofyFilterOn}
          onToggleGoofyFilter={args.onToggleGoofyFilter}
          ghostKey={args.ghostKey}
          onSelectGhost={args.onSelectGhost}
          ghostOptions={args.ghostOptions}
          captionOn={args.captionOn}
          onToggleCaption={args.onToggleCaption}
          captionAvailable={args.captionAvailable}
          onShowOriginal={args.onShowOriginal}
          posterTints={args.posterTints}
          posterTint={args.posterTint}
          onSelectPoster={args.onSelectPoster}
          filterOptions={args.filterOptions}
          filterKey={args.filterKey}
          onSelectFilter={args.onSelectFilter}
        />
      );
    case "printing":
      return (
        <PrintingScreen
          status={args.printStatus}
          printerAdapter={args.printerAdapter}
          onRetry={args.onPrint}
          onSavePhoto={args.onSavePhoto}
          onContinueWithoutPrinting={args.onDone}
        />
      );
    case "error":
      return (
        <div className="screen error-screen">
          <h2>SOMETHING SPOOKY WENT WRONG</h2>
          <p>{args.error}</p>
          <button className="big-button" onClick={args.onRetry}>
            TRY AGAIN
          </button>
        </div>
      );
    default:
      return null;
  }
}
