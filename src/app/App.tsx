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
// Same subpath-safe resolution as the face-detector models below --
// public/cameo/nic-cutout.png needs to resolve correctly under a GitHub
// Pages subpath deployment too.
const ownerCameoEngine = new OwnerCameoEngine(new URL("cameo/nic-cutout.png", document.baseURI).href);

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
  // Whether the result screen is currently showing the caricatured
  // ("Goofy Filter") photo or the plain candid capture. Defaults to on
  // (maxed-out effect front and center) every fresh photo; the guest can
  // flip it off if they want a normal candid instead. Independent of
  // ghostOn below -- either can be combined with either.
  const [goofyFilterOn, setGoofyFilterOn] = useState(true);
  // Whether the booth owner's ghostly cameo ("Spookify") is layered onto
  // whichever photo is currently showing. Only meaningful/shown when the
  // operator has "My Cameo" enabled at all; defaults to on for a fresh
  // photo when the operator has it enabled, off otherwise.
  const [ghostOn, setGhostOn] = useState(false);

  const cameraRef = useRef<GetUserMediaCameraManager | null>(null);
  const masterBitmapRef = useRef<ImageBitmap | null>(null);
  // All four combinations (goofy x ghost) of the current photo are kept
  // after processing so the two toggles are instant (swap which cached
  // bitmap is displayed/printed) rather than re-running detection, the mesh
  // warp, or the cameo composite.
  const originalBitmapRef = useRef<ImageBitmap | null>(null);
  const caricaturedBitmapRef = useRef<ImageBitmap | null>(null);
  const originalGhostBitmapRef = useRef<ImageBitmap | null>(null);
  const caricaturedGhostBitmapRef = useRef<ImageBitmap | null>(null);
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

  // Swaps which cached bitmap (candid vs. goofy, ghost on vs. off) is
  // currently shown on the result screen and would be sent to the printer,
  // without touching detection, the mesh warp, or the cameo composite —
  // all four combinations already exist by the time this is called. Falls
  // back to the plain (non-ghost) variant if a ghost version wasn't
  // computed (cameo feature disabled), so a stray ghostOn=true can never
  // show a missing photo.
  const applyPhotoSelection = useCallback(async (goofy: boolean, ghost: boolean) => {
    const base = goofy ? caricaturedBitmapRef.current : originalBitmapRef.current;
    const ghostVariant = goofy ? caricaturedGhostBitmapRef.current : originalGhostBitmapRef.current;
    const bitmap = (ghost && ghostVariant) || base;
    if (!bitmap) return;
    masterBitmapRef.current = bitmap;
    const blob = await imageBitmapToBlob(bitmap);
    const url = URL.createObjectURL(blob);
    setResultImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const handleToggleGoofyFilter = useCallback(() => {
    const next = !goofyFilterOn;
    setGoofyFilterOn(next);
    void applyPhotoSelection(next, ghostOn);
  }, [goofyFilterOn, ghostOn, applyPhotoSelection]);

  const handleToggleGhost = useCallback(() => {
    const next = !ghostOn;
    setGhostOn(next);
    void applyPhotoSelection(goofyFilterOn, next);
  }, [goofyFilterOn, ghostOn, applyPhotoSelection]);

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

      // Ghost/composition pipeline (Phases 6-8) proper isn't built yet, so
      // the "goofy" photo is the working (warped) bitmap, or the plain
      // master frame when no faces were detected. Both the candid original
      // and the goofy version are kept so the guest can toggle Goofy
      // Filter on the result screen without redoing detection/warping.
      originalBitmapRef.current = master;
      caricaturedBitmapRef.current = working;

      // "My Cameo" (operator beta toggle): composites the booth owner's own
      // ghostly cameo onto BOTH the candid and goofy versions, so the
      // guest's "Spookify" toggle can layer the ghost onto whichever photo
      // (candid or goofy) they're currently viewing, independent of the
      // Goofy Filter toggle. Only computed when the operator has the
      // feature enabled at all -- composite() doesn't mutate its input, so
      // `master`/`working` stay valid for the non-ghost variants above.
      const ghostAvailable = state.settings.ownerCameoMode !== "off";
      if (ghostAvailable) {
        originalGhostBitmapRef.current = await ownerCameoEngine.composite(master);
        caricaturedGhostBitmapRef.current = await ownerCameoEngine.composite(working);
      } else {
        originalGhostBitmapRef.current = null;
        caricaturedGhostBitmapRef.current = null;
      }

      // Every fresh photo starts with Goofy Filter on (maxed-out effect by
      // default) and Spookify on whenever the operator has the cameo
      // feature enabled (the guest can flip either off independently).
      setGoofyFilterOn(true);
      setGhostOn(ghostAvailable);
      await applyPhotoSelection(true, ghostAvailable);
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
    applyPhotoSelection,
  ]);

  const handlePrintRequested = useCallback(async () => {
    dispatch({ kind: "booth", event: { type: "PRINT_REQUESTED" } });
    setPrintStatus("printing");
    try {
      if (masterBitmapRef.current) {
        await printerManager.print(masterBitmapRef.current, state.settings.copies);
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
  }, [dispatch, state.settings.copies]);

  const handleRetake = useCallback(() => {
    setFaces([]);
    setGoofyFilterOn(true);
    setGhostOn(false);
    dispatch({ kind: "booth", event: { type: "RETAKE" } });
  }, [dispatch]);

  const handleDone = useCallback(() => {
    setFaces([]);
    setGoofyFilterOn(true);
    setGhostOn(false);
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
