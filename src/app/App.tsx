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
import { resolvePreset, scaleTowardNeutral } from "../effects/Presets";
import { pickCaption, type OverlayKey } from "../effects/HalloweenEffects";
import type { FrameKey } from "../effects/Frames";
import { applyPosterEffect, POSTER_TINTS, type PosterTint } from "../effects/PosterEffect";
import { Canvas2DCompositionEngine } from "../rendering/CompositionEngine";
import { createSeed, seededRandom } from "../utils/random";
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
// Caption/frame compositing (CLAUDE.md section 28) -- Canvas2D is the
// baseline/guaranteed-available tier (section 29); no state worth
// reconstructing between photos, so one shared instance.
const compositionEngine = new Canvas2DCompositionEngine();
// "My Cameo" -- the booth owner's own ghostly cutout(s), composited in as a
// recurring haunting easter egg (see effects/OwnerCameoEngine.ts). A real
// per-guest ghost generated live from each guest's own segmented photo was
// tried and reverted (it didn't look great and wasn't reliable enough --
// CLAUDE.md section 64 prioritizes booth reliability over a fancier
// effect); this fixed-asset approach is simpler and more predictable.
// List every filename you drop into public/cameo/ here -- once there's more
// than one, a per-photo seeded rng (same one driving the caricature preset)
// picks a different one each time (CLAUDE.md section 20's reproducible
// randomness), so it reads as several different "ghosts" of the owner
// rather than a single unvarying stamp. Same subpath-safe resolution as the
// face-detector models below -- these need to resolve correctly under a
// GitHub Pages subpath deployment too.
const CAMEO_ASSET_FILENAMES = ["nic-cutout.png"];
const ownerCameoEngine = new OwnerCameoEngine(
  CAMEO_ASSET_FILENAMES.map((name) => new URL(`cameo/${name}`, document.baseURI).href),
);

// Resolved against document.baseURI (not a bare relative path) so the
// worker's model fetches still land on /models/ correctly even when the
// app is served from a subpath, e.g. GitHub Pages at
// https://<user>.github.io/ghost-booth/ rather than a domain root.
const faceDetector = new WorkerFaceDetector(new URL("models/", document.baseURI).href);

export default function App() {
  const [state, dispatch] = useAppReducer();
  const [operatorPanelOpen, setOperatorPanelOpen] = useState(false);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<"printing" | "success" | "failed">("printing");
  const [faces, setFaces] = useState<FaceModel[]>([]);
  // Guest-facing toggles for the current photo. Each is independent of
  // the others (any combination is valid) and, unlike the old design,
  // none of these are baked into a precomputed bitmap variant -- see
  // applyPhotoSelection below for why. Defaults are set fresh on every
  // capture in handleCountdownComplete.
  const [goofyFilterOn, setGoofyFilterOn] = useState(true);
  const [ghostOn, setGhostOn] = useState(false);
  const [frameOn, setFrameOn] = useState(false);
  const [overlaysOn, setOverlaysOn] = useState(false);
  const [posterOn, setPosterOn] = useState(false);

  const cameraRef = useRef<GetUserMediaCameraManager | null>(null);
  const masterBitmapRef = useRef<ImageBitmap | null>(null);
  // The four "base" bitmaps for the current photo -- goofy x ghost, and
  // nothing else. Frame/overlays/caption/poster are no longer baked into
  // precomputed pairs (the old design's originalFramedBitmapRef etc.):
  // with five independent guest toggles now instead of three, caching
  // every combination up front (2^5 = 32 variants) doesn't scale, so
  // applyPhotoSelection below composes the current toggle state on
  // demand instead. A compose() call is one cheap canvas draw, well
  // within toggle-tap latency, so this doesn't cost noticeably more per
  // tap than the old swap-a-cached-bitmap approach did.
  const originalBitmapRef = useRef<ImageBitmap | null>(null);
  const caricaturedBitmapRef = useRef<ImageBitmap | null>(null);
  const originalGhostBitmapRef = useRef<ImageBitmap | null>(null);
  const caricaturedGhostBitmapRef = useRef<ImageBitmap | null>(null);
  // The per-photo "recipe" (caption/frame/overlays/poster tint) decided
  // once at capture time from the seeded rng (CLAUDE.md section 20), so
  // toggling frame/overlays/poster on and off doesn't reshuffle which
  // caption or overlay layout the photo uses.
  const photoRecipeRef = useRef<{
    caption?: string;
    frame: FrameKey;
    overlays: OverlayKey[];
    overlaySeed: string;
    posterTint: PosterTint;
  } | null>(null);
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
  useEffect(() => {
    if (state.booth.state === "attract" || !state.settings.attractModeEnabled) return;
    const timer = setTimeout(() => {
      dispatch({ kind: "booth", event: { type: "IDLE_TIMEOUT" } });
    }, state.settings.idleTimeoutSeconds * 1000);
    return () => clearTimeout(timer);
    // Re-arm on every booth state change so activity resets the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.booth.state, state.settings.attractModeEnabled, state.settings.idleTimeoutSeconds]);

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

  // Composes the currently-selected combination of guest toggles into the
  // photo shown/printed, and swaps resultImageUrl to it. Poster Mode, when
  // on, replaces the regular caption+frame+overlay composition entirely
  // (same mutually-exclusive-treatment rationale PosterEffect.ts has
  // always documented -- its own vignette/tagline would clash with a
  // frame border and duplicate the caption); otherwise frame/overlays are
  // drawn (or not) on top of the base bitmap, with the caption always
  // included (CLAUDE.md section 25 -- not guest-toggleable, consistent
  // with the original design).
  const applyPhotoSelection = useCallback(
    async (goofy: boolean, ghost: boolean, framed: boolean, overlaid: boolean, postered: boolean) => {
      const ghostVariant = goofy ? caricaturedGhostBitmapRef.current : originalGhostBitmapRef.current;
      const plainVariant = goofy ? caricaturedBitmapRef.current : originalBitmapRef.current;
      // Falls back to the non-ghost variant if ghost was requested but
      // isn't available for this photo (cameo disabled), so a stray
      // ghostOn=true can never show a missing photo.
      const source = (ghost && ghostVariant) || plainVariant;
      const recipe = photoRecipeRef.current;
      if (!source || !recipe) return;

      const bitmap = postered
        ? await applyPosterEffect(source, { tagline: recipe.caption, tint: recipe.posterTint })
        : await compositionEngine.compose({
            foreground: source,
            ghosts: [],
            caption: recipe.caption,
            frame: framed ? recipe.frame : "none",
            overlays: overlaid ? recipe.overlays : [],
            overlaySeed: recipe.overlaySeed,
          });

      masterBitmapRef.current = bitmap;
      const blob = await imageBitmapToBlob(bitmap);
      const url = URL.createObjectURL(blob);
      setResultImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    },
    [],
  );

  const handleToggleGoofyFilter = useCallback(() => {
    const next = !goofyFilterOn;
    setGoofyFilterOn(next);
    void applyPhotoSelection(next, ghostOn, frameOn, overlaysOn, posterOn);
  }, [goofyFilterOn, ghostOn, frameOn, overlaysOn, posterOn, applyPhotoSelection]);

  const handleToggleGhost = useCallback(() => {
    const next = !ghostOn;
    setGhostOn(next);
    void applyPhotoSelection(goofyFilterOn, next, frameOn, overlaysOn, posterOn);
  }, [goofyFilterOn, ghostOn, frameOn, overlaysOn, posterOn, applyPhotoSelection]);

  const handleToggleFrame = useCallback(() => {
    const next = !frameOn;
    setFrameOn(next);
    void applyPhotoSelection(goofyFilterOn, ghostOn, next, overlaysOn, posterOn);
  }, [goofyFilterOn, ghostOn, frameOn, overlaysOn, posterOn, applyPhotoSelection]);

  const handleToggleOverlays = useCallback(() => {
    const next = !overlaysOn;
    setOverlaysOn(next);
    void applyPhotoSelection(goofyFilterOn, ghostOn, frameOn, next, posterOn);
  }, [goofyFilterOn, ghostOn, frameOn, overlaysOn, posterOn, applyPhotoSelection]);

  const handleTogglePoster = useCallback(() => {
    const next = !posterOn;
    setPosterOn(next);
    void applyPhotoSelection(goofyFilterOn, ghostOn, frameOn, overlaysOn, next);
  }, [goofyFilterOn, ghostOn, frameOn, overlaysOn, posterOn, applyPhotoSelection]);

  // One-tap revert to the plain candid: turns every guest toggle off in a
  // single action (CLAUDE.md section 36's result screen always needs a
  // clean way back to "just the photo," and beta testing needs to be able
  // to check every feature against a known-off baseline quickly).
  const handleShowOriginal = useCallback(() => {
    setGoofyFilterOn(false);
    setGhostOn(false);
    setFrameOn(false);
    setOverlaysOn(false);
    setPosterOn(false);
    void applyPhotoSelection(false, false, false, false, false);
  }, [applyPhotoSelection]);

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

      // Vision analysis (Phase 3) runs during "processing". detect() never
      // throws (CLAUDE.md section 49) — 0 faces just means the rest of the
      // pipeline falls back to a plain Halloween photo. detect() takes
      // ownership of the bitmap it's given (transferred into the worker),
      // so we hand it a clone and keep `master` intact for the result
      // photo and printing.
      const detectionCopy = await createImageBitmap(master);
      const detectedFaces = await faceDetector.detect(detectionCopy);
      setFaces(detectedFaces);

      // Caricature warp (Phase 4): nose enlargement only so far (section
      // 59's incremental build order). A fresh per-photo seed drives the
      // "Random"/WTF preset (section 20) so a given photo's result can be
      // reproduced for debugging by logging the seed. Each detected face is
      // warped in turn against the same working bitmap — faces don't
      // overlap in a normal group photo, so sequential per-face warps on
      // one bitmap are equivalent to warping them independently.
      const seed = createSeed();
      const rng = seededRandom(seed);
      const config = scaleTowardNeutral(
        resolvePreset(state.settings.preset, rng),
        state.settings.caricatureStrength,
      );
      let working: ImageBitmap = master;
      for (const face of detectedFaces) {
        const warped = await caricatureEngine.warp(working, face, config);
        if (warped !== working) {
          working = warped;
        }
      }

      // Ghost layer for the "Spookify" toggle: "My Cameo" (the booth
      // owner's own fixed cutout(s), effects/OwnerCameoEngine.ts). Only
      // computed when enabled -- composite() doesn't mutate its input, so
      // `master`/`working` stay valid for the non-ghost variants below.
      // When there are several cameo images (CAMEO_ASSET_FILENAMES above),
      // one is picked per photo from the same seeded rng as the caricature
      // preset -- picked once and reused for both variants below so the
      // candid and goofy versions of one photo show the same "ghost"
      // rather than two different ones.
      const ghostAvailable = state.settings.ownerCameoMode !== "off";
      let ghostOriginal: ImageBitmap | null = null;
      let ghostCaricatured: ImageBitmap | null = null;
      if (ghostAvailable) {
        const cameoPick = rng();
        const pickRng = () => cameoPick;
        ghostOriginal = await ownerCameoEngine.composite(master, {}, pickRng);
        ghostCaricatured = await ownerCameoEngine.composite(working, {}, pickRng);
      }

      // Everything past this point (caption, frame, overlays, poster
      // tint) is decided once per photo from the same seeded rng
      // (CLAUDE.md section 20) and stashed in photoRecipeRef rather than
      // baked into precomputed bitmaps -- applyPhotoSelection composes
      // the guest's current toggle state against these four base bitmaps
      // on demand (see its own comment for why).
      const caption = pickCaption(state.settings.captionMode, state.settings.fixedCaption, rng);
      photoRecipeRef.current = {
        caption,
        frame: state.settings.frame,
        overlays: state.settings.overlays,
        overlaySeed: createSeed(),
        posterTint: POSTER_TINTS[Math.floor(rng() * POSTER_TINTS.length)],
      };

      originalBitmapRef.current = master;
      caricaturedBitmapRef.current = working;
      originalGhostBitmapRef.current = ghostOriginal;
      caricaturedGhostBitmapRef.current = ghostCaricatured;

      const frameAvailable = state.settings.frame !== "none";
      const overlaysAvailable = state.settings.overlays.length > 0;
      const posterAvailable = state.settings.posterMode;

      // Every fresh photo starts with Goofy Filter on (maxed-out effect by
      // default) and every other toggle on exactly when the operator has
      // that feature enabled/configured for this event (the guest can
      // flip any of them off independently, or tap Original to reset all
      // of them at once).
      setGoofyFilterOn(true);
      setGhostOn(ghostAvailable);
      setFrameOn(frameAvailable);
      setOverlaysOn(overlaysAvailable);
      setPosterOn(posterAvailable);
      await applyPhotoSelection(true, ghostAvailable, frameAvailable, overlaysAvailable, posterAvailable);
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
    state.settings.frame,
    state.settings.overlays,
    state.settings.posterMode,
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

  const handleRetake = useCallback(() => {
    setFaces([]);
    setGoofyFilterOn(true);
    setGhostOn(false);
    setFrameOn(false);
    setOverlaysOn(false);
    setPosterOn(false);
    dispatch({ kind: "booth", event: { type: "RETAKE" } });
  }, [dispatch]);

  const handleDone = useCallback(() => {
    setFaces([]);
    setGoofyFilterOn(true);
    setGhostOn(false);
    setFrameOn(false);
    setOverlaysOn(false);
    setPosterOn(false);
    dispatch({ kind: "booth", event: { type: "DONE" } });
  }, [dispatch]);

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
            faces,
            debugMode: state.settings.debugMode,
            goofyFilterOn,
            ghostOn,
            ghostAvailable: state.settings.ownerCameoMode !== "off",
            frameOn,
            // Frame/Overlays have no visible effect while Poster Mode is
            // currently applied (it replaces that treatment entirely, see
            // applyPhotoSelection) -- hidden rather than shown-but-inert
            // whenever posterOn is the *live* toggle state, not just the
            // operator's posterMode setting, so the guest/tester sees them
            // reappear the instant they flip Poster back off.
            frameAvailable: state.settings.frame !== "none" && !posterOn,
            overlaysOn,
            overlaysAvailable: state.settings.overlays.length > 0 && !posterOn,
            posterOn,
            posterAvailable: state.settings.posterMode,
            onStart: () => dispatch({ kind: "booth", event: { type: "GUEST_APPROACHED" } }),
            onCameraReady: handleCameraReady,
            onCameraError: handleCameraError,
            onStartCountdown: handleStartCountdown,
            onCountdownComplete: handleCountdownComplete,
            onPrint: handlePrintRequested,
            onRetake: handleRetake,
            onDone: handleDone,
            onRetry: handleRetry,
            onToggleGoofyFilter: handleToggleGoofyFilter,
            onToggleGhost: handleToggleGhost,
            onToggleFrame: handleToggleFrame,
            onToggleOverlays: handleToggleOverlays,
            onTogglePoster: handleTogglePoster,
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
              onTestPrinter={() => printerManager.print(new Blob())}
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
  faces: FaceModel[];
  debugMode: boolean;
  goofyFilterOn: boolean;
  ghostOn: boolean;
  ghostAvailable: boolean;
  frameOn: boolean;
  frameAvailable: boolean;
  overlaysOn: boolean;
  overlaysAvailable: boolean;
  posterOn: boolean;
  posterAvailable: boolean;
  onStart: () => void;
  onCameraReady: (camera: GetUserMediaCameraManager) => void;
  onCameraError: (message: string) => void;
  onStartCountdown: () => void;
  onCountdownComplete: () => void;
  onPrint: () => void;
  onRetake: () => void;
  onDone: () => void;
  onRetry: () => void;
  onToggleGoofyFilter: () => void;
  onToggleGhost: () => void;
  onToggleFrame: () => void;
  onToggleOverlays: () => void;
  onTogglePoster: () => void;
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
          ghostOn={args.ghostOn}
          onToggleGhost={args.onToggleGhost}
          ghostAvailable={args.ghostAvailable}
          frameOn={args.frameOn}
          onToggleFrame={args.onToggleFrame}
          frameAvailable={args.frameAvailable}
          overlaysOn={args.overlaysOn}
          onToggleOverlays={args.onToggleOverlays}
          overlaysAvailable={args.overlaysAvailable}
          posterOn={args.posterOn}
          onTogglePoster={args.onTogglePoster}
          posterAvailable={args.posterAvailable}
          onShowOriginal={args.onShowOriginal}
        />
      );
    case "printing":
      return (
        <PrintingScreen
          status={args.printStatus}
          onRetry={args.onPrint}
          onSavePhoto={args.onDone}
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
