// Single authoritative state machine for the booth.
// Per CLAUDE.md section 4: one BoothState, no scattered booleans.

export type BoothState =
  | "attract"
  | "camera"
  | "ready"
  | "countdown"
  | "capturing"
  | "processing"
  | "result"
  | "printing"
  | "printComplete"
  | "error";

export type BoothEvent =
  // attract -> camera: guest interaction or auto-detect kicks off the live view
  | { type: "GUEST_APPROACHED" }
  // camera -> ready: camera stream is live and stable
  | { type: "CAMERA_READY" }
  // camera/ready -> error: permission denied, unavailable, in use, unsupported
  | { type: "CAMERA_ERROR"; message: string }
  // ready -> countdown: operator/guest pressed BOO, or auto-detect stability timer fired
  | { type: "START_COUNTDOWN" }
  // countdown -> capturing: countdown reached BOO!
  | { type: "COUNTDOWN_COMPLETE" }
  // capturing -> processing: frame captured successfully
  | { type: "FRAME_CAPTURED" }
  // capturing -> error: capture failed
  | { type: "CAPTURE_ERROR"; message: string }
  // processing -> result: vision + effects + composition finished
  | { type: "PROCESSING_COMPLETE" }
  // processing -> result: any pipeline stage failed gracefully (falls back to plain photo)
  | { type: "PROCESSING_FAILED"; message: string }
  // result -> printing: guest/operator chose to print, or auto-print is enabled
  | { type: "PRINT_REQUESTED" }
  // result -> attract: guest chose to skip printing / finish
  | { type: "DONE" }
  // result -> camera: retake
  | { type: "RETAKE" }
  // printing -> printComplete: printer reported success
  | { type: "PRINT_SUCCESS" }
  // printing -> error: printer failed (still carries the finished image forward)
  | { type: "PRINT_FAILED"; message: string }
  // printComplete -> attract: idle timeout or explicit reset
  | { type: "RESET" }
  // error -> attract/camera: operator or guest dismisses the error and retries
  | { type: "RETRY" }
  // any -> attract: idle timeout fired
  | { type: "IDLE_TIMEOUT" };

export interface BoothContext {
  state: BoothState;
  error?: string;
  /** Preserved across printing failures so a failed print never discards the finished photo. */
  hasFinishedPhoto: boolean;
  /** Where RETRY should return to; set whenever we transition into "error". */
  retryTarget: BoothState;
}

export const initialBoothContext: BoothContext = {
  state: "attract",
  hasFinishedPhoto: false,
  retryTarget: "attract",
};

/**
 * Pure reducer. Given the current context and an event, returns the next
 * context. Unknown/invalid transitions are no-ops (context is returned
 * unchanged) rather than throwing, so a stray event never crashes the booth.
 */
export function boothReducer(ctx: BoothContext, event: BoothEvent): BoothContext {
  switch (ctx.state) {
    case "attract":
      if (event.type === "GUEST_APPROACHED") {
        return { ...ctx, state: "camera", error: undefined };
      }
      break;

    case "camera":
      if (event.type === "CAMERA_READY") {
        return { ...ctx, state: "ready" };
      }
      if (event.type === "CAMERA_ERROR") {
        return { ...ctx, state: "error", error: event.message, retryTarget: "camera" };
      }
      if (event.type === "IDLE_TIMEOUT") {
        return { ...initialBoothContext };
      }
      break;

    case "ready":
      if (event.type === "START_COUNTDOWN") {
        return { ...ctx, state: "countdown" };
      }
      if (event.type === "CAMERA_ERROR") {
        return { ...ctx, state: "error", error: event.message, retryTarget: "camera" };
      }
      if (event.type === "IDLE_TIMEOUT") {
        return { ...initialBoothContext };
      }
      break;

    case "countdown":
      if (event.type === "COUNTDOWN_COMPLETE") {
        return { ...ctx, state: "capturing" };
      }
      break;

    case "capturing":
      if (event.type === "FRAME_CAPTURED") {
        return { ...ctx, state: "processing" };
      }
      if (event.type === "CAPTURE_ERROR") {
        return { ...ctx, state: "error", error: event.message, retryTarget: "camera" };
      }
      break;

    case "processing":
      if (event.type === "PROCESSING_COMPLETE" || event.type === "PROCESSING_FAILED") {
        // A failed processing stage still yields a result: graceful fallback
        // to the plain Halloween photo rather than an error screen (CLAUDE.md 49).
        return {
          ...ctx,
          state: "result",
          hasFinishedPhoto: true,
          error: event.type === "PROCESSING_FAILED" ? event.message : undefined,
        };
      }
      break;

    case "result":
      if (event.type === "PRINT_REQUESTED") {
        return { ...ctx, state: "printing" };
      }
      if (event.type === "RETAKE") {
        return { ...ctx, state: "camera", hasFinishedPhoto: false, error: undefined };
      }
      if (event.type === "DONE") {
        return { ...initialBoothContext };
      }
      break;

    case "printing":
      if (event.type === "PRINT_SUCCESS") {
        return { ...ctx, state: "printComplete" };
      }
      if (event.type === "PRINT_FAILED") {
        // hasFinishedPhoto stays true: printing errors never discard the photo.
        return { ...ctx, state: "error", error: event.message, retryTarget: "printing" };
      }
      break;

    case "printComplete":
      if (event.type === "RESET" || event.type === "IDLE_TIMEOUT") {
        return { ...initialBoothContext };
      }
      break;

    case "error":
      if (event.type === "RETRY") {
        return { ...ctx, state: ctx.retryTarget, error: undefined };
      }
      if (event.type === "DONE" || event.type === "IDLE_TIMEOUT") {
        return { ...initialBoothContext };
      }
      break;
  }

  // Global override: an idle timeout from any state returns to attract,
  // except states already handled above.
  if (event.type === "IDLE_TIMEOUT") {
    return { ...initialBoothContext };
  }

  return ctx;
}
