import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockPrinterAdapter } from "../src/printing/MockPrinterAdapter";

function fakeBitmap(): ImageBitmap {
  return {} as unknown as ImageBitmap;
}

describe("MockPrinterAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("discover() reports a single mock device", async () => {
    const adapter = new MockPrinterAdapter();
    const devices = await adapter.discover();
    expect(devices).toEqual([{ id: "mock-printer-1", name: "Mock Printer", kind: "mock" }]);
  });

  it("connect() marks the adapter connected, disconnect() clears it", async () => {
    const adapter = new MockPrinterAdapter();
    expect(adapter.connected).toBe(false);

    const devices = await adapter.discover();
    await adapter.connect(devices[0]);
    expect(adapter.connected).toBe(true);

    await adapter.disconnect();
    expect(adapter.connected).toBe(false);
  });

  it("print() resolves after the configured delay when it doesn't simulate a failure", async () => {
    const adapter = new MockPrinterAdapter({ failRate: 0, delayMs: 500 });
    let resolved = false;
    const promise = adapter.print(fakeBitmap()).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it("print() defaults to an 800ms delay when none is configured", async () => {
    const adapter = new MockPrinterAdapter({ failRate: 0 });
    let resolved = false;
    const promise = adapter.print(fakeBitmap()).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(799);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it("print() throws a simulated failure when Math.random() falls under failRate", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const adapter = new MockPrinterAdapter({ failRate: 0.5, delayMs: 0 });

    // Attach the rejection assertion before advancing timers, so the
    // rejection is never "unobserved" between resolving and asserting.
    const assertion = expect(adapter.print(fakeBitmap())).rejects.toThrow("Mock printer simulated failure");
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });

  it("print() succeeds when Math.random() falls at or above failRate", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const adapter = new MockPrinterAdapter({ failRate: 0.5, delayMs: 0 });

    const assertion = expect(adapter.print(fakeBitmap())).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });

  it("print() never fails when failRate is the default (0)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // the most failure-prone draw possible
    const adapter = new MockPrinterAdapter({ delayMs: 0 });

    const assertion = expect(adapter.print(fakeBitmap())).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });

  it("cancel() resolves without side effects", async () => {
    const adapter = new MockPrinterAdapter();
    await expect(adapter.cancel()).resolves.toBeUndefined();
  });
});
