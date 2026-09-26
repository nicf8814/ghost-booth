import { useEffect, useRef, useState, type ReactNode } from "react";
import { CameraPreview } from "../camera/CameraPreview";
import { GetUserMediaCameraManager, CameraError } from "../camera/CameraManager";

interface CameraScreenProps {
  onReady: (camera: GetUserMediaCameraManager) => void;
  onError: (message: string) => void;
  onStartCountdown: () => void;
  /**
   * Rendered on top of the live preview instead of the BOO button — used
   * to keep the camera stream alive and visible behind the countdown and
   * during capture, rather than tearing it down and restarting it
   * (CLAUDE.md section 34: countdown happens over the live view).
   */
  overlay?: ReactNode;
}

/**
 * Live camera view + mode selection (CLAUDE.md sections 5-6, 32-34).
 * Owns the CameraManager lifecycle: starts the stream on mount, stops it
 * on unmount, and surfaces permission/hardware errors to the state machine
 * rather than crashing. Stays mounted through camera/ready/countdown/
 * capturing so the stream is never stopped mid-flow.
 */
export function CameraScreen({ onReady, onError, onStartCountdown, overlay }: CameraScreenProps) {
  const cameraRef = useRef<GetUserMediaCameraManager | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "live">("starting");

  useEffect(() => {
    const camera = new GetUserMediaCameraManager();
    cameraRef.current = camera;
    let cancelled = false;

    camera
      .start()
      .then(() => {
        if (cancelled) return;
        setStream(camera.getStream());
        setStatus("live");
        onReady(camera);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof CameraError ? describeCameraError(err) : "The camera could not be started.";
        onError(message);
      });

    return () => {
      cancelled = true;
      camera.stop();
    };
    // Intentionally run once per screen mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen camera-screen">
      <CameraPreview stream={stream} mirrored />
      {status === "starting" && <div className="camera-overlay-message">WAKING THE CAMERA...</div>}
      {status === "live" && overlay}
      {status === "live" && !overlay && (
        <div className="camera-controls">
          <button className="big-button boo-button" onClick={onStartCountdown}>
            BOO
          </button>
        </div>
      )}
    </div>
  );
}

function describeCameraError(err: CameraError): string {
  switch (err.kind) {
    case "permission-denied":
      return "Camera access was denied. Please allow camera access to use the booth.";
    case "not-found":
      return "No camera was found on this device.";
    case "in-use":
      return "The camera is already in use by another app.";
    case "unsupported":
      return "This browser does not support camera access.";
    default:
      return "The camera ran into a problem.";
  }
}
