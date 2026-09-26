import { describe, expect, it } from "vitest";
import {
  boothReducer,
  initialBoothContext,
  type BoothContext,
} from "../src/state/BoothStateMachine";

function at(state: BoothContext["state"], patch: Partial<BoothContext> = {}): BoothContext {
  return { ...initialBoothContext, state, ...patch };
}

describe("boothReducer", () => {
  it("starts in attract", () => {
    expect(initialBoothContext.state).toBe("attract");
  });

  it("moves attract -> camera on GUEST_APPROACHED", () => {
    const next = boothReducer(initialBoothContext, { type: "GUEST_APPROACHED" });
    expect(next.state).toBe("camera");
  });

  it("moves camera -> ready on CAMERA_READY", () => {
    const next = boothReducer(at("camera"), { type: "CAMERA_READY" });
    expect(next.state).toBe("ready");
  });

  it("moves camera -> error on CAMERA_ERROR and records a retry target", () => {
    const next = boothReducer(at("camera"), { type: "CAMERA_ERROR", message: "denied" });
    expect(next.state).toBe("error");
    expect(next.error).toBe("denied");
    expect(next.retryTarget).toBe("camera");
  });

  it("walks the full happy path: ready -> countdown -> capturing -> processing -> result", () => {
    let ctx = at("ready");
    ctx = boothReducer(ctx, { type: "START_COUNTDOWN" });
    expect(ctx.state).toBe("countdown");

    ctx = boothReducer(ctx, { type: "COUNTDOWN_COMPLETE" });
    expect(ctx.state).toBe("capturing");

    ctx = boothReducer(ctx, { type: "FRAME_CAPTURED" });
    expect(ctx.state).toBe("processing");

    ctx = boothReducer(ctx, { type: "PROCESSING_COMPLETE" });
    expect(ctx.state).toBe("result");
    expect(ctx.hasFinishedPhoto).toBe(true);
  });

  it("falls back to result (not an error screen) when processing fails", () => {
    const ctx = boothReducer(at("processing"), {
      type: "PROCESSING_FAILED",
      message: "no face detected",
    });
    expect(ctx.state).toBe("result");
    expect(ctx.hasFinishedPhoto).toBe(true);
    expect(ctx.error).toBe("no face detected");
  });

  it("never discards the finished photo when printing fails", () => {
    const printing = at("printing", { hasFinishedPhoto: true });
    const next = boothReducer(printing, { type: "PRINT_FAILED", message: "printer offline" });
    expect(next.state).toBe("error");
    expect(next.hasFinishedPhoto).toBe(true);
    expect(next.retryTarget).toBe("printing");
  });

  it("RETRY returns to the recorded retry target and clears the error", () => {
    const errored = at("error", { error: "printer offline", retryTarget: "printing", hasFinishedPhoto: true });
    const next = boothReducer(errored, { type: "RETRY" });
    expect(next.state).toBe("printing");
    expect(next.error).toBeUndefined();
    expect(next.hasFinishedPhoto).toBe(true);
  });

  it("RETAKE from result returns to camera and clears the finished photo", () => {
    const result = at("result", { hasFinishedPhoto: true });
    const next = boothReducer(result, { type: "RETAKE" });
    expect(next.state).toBe("camera");
    expect(next.hasFinishedPhoto).toBe(false);
  });

  it("DONE from result resets the whole context back to attract", () => {
    const result = at("result", { hasFinishedPhoto: true, error: "x" });
    const next = boothReducer(result, { type: "DONE" });
    expect(next).toEqual(initialBoothContext);
  });

  it("IDLE_TIMEOUT resets to attract from any non-terminal state", () => {
    for (const state of ["camera", "ready", "printComplete"] as const) {
      const next = boothReducer(at(state), { type: "IDLE_TIMEOUT" });
      expect(next).toEqual(initialBoothContext);
    }
  });

  it("ignores events that don't apply to the current state (no-op, no throw)", () => {
    const ctx = at("attract");
    const next = boothReducer(ctx, { type: "COUNTDOWN_COMPLETE" });
    expect(next).toBe(ctx);
  });

  it("printComplete -> attract on RESET", () => {
    const next = boothReducer(at("printComplete"), { type: "RESET" });
    expect(next.state).toBe("attract");
  });
});
