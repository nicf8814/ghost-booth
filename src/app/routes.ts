import type { BoothState } from "../state/BoothStateMachine";

// Maps each BoothState to the component that renders it. Kept as a plain
// lookup (not JSX) so App.tsx stays the only place that actually renders
// screens; this file exists so the state<->screen mapping is documented
// and easy to audit in one place as new screens are added.
export const SCREEN_FOR_STATE: Record<BoothState, string> = {
  attract: "AttractScreen",
  camera: "CameraScreen",
  ready: "CameraScreen",
  countdown: "Countdown",
  capturing: "ProcessingScreen",
  processing: "ProcessingScreen",
  result: "ResultScreen",
  printing: "PrintingScreen",
  printComplete: "ResultScreen",
  error: "ErrorScreen",
};
