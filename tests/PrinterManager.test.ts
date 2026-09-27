import { describe, expect, it, vi } from "vitest";
import { PrinterManager } from "../src/printing/PrinterManager";
import { MockPrinterAdapter } from "../src/printing/MockPrinterAdapter";
import type { PhotoPrinter, PrinterDevice } from "../src/printing/PrinterAdapter";

function fakeBitmap(): ImageBitmap {
  return {} as unknown as ImageBitmap;
}

function makeSpyAdapter(): PhotoPrinter {
  return {
    name: "Spy Printer",
    discover: vi.fn(async () => [{ id: "spy-1", name: "Spy", kind: "mock" }] as PrinterDevice[]),
    connect: vi.fn(async () => {}),
    print: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
}

describe("PrinterManager", () => {
  it("defaults to a MockPrinterAdapter when constructed with no argument", () => {
    const manager = new PrinterManager();
    expect(manager.getAdapter()).toBeInstanceOf(MockPrinterAdapter);
  });

  it("uses the adapter passed to the constructor", () => {
    const adapter = makeSpyAdapter();
    const manager = new PrinterManager(adapter);
    expect(manager.getAdapter()).toBe(adapter);
  });

  it("setAdapter() swaps the active adapter for all subsequent calls", async () => {
    const first = makeSpyAdapter();
    const second = makeSpyAdapter();
    const manager = new PrinterManager(first);
    manager.setAdapter(second);

    expect(manager.getAdapter()).toBe(second);
    await manager.discover();
    expect(second.discover).toHaveBeenCalledTimes(1);
    expect(first.discover).not.toHaveBeenCalled();
  });

  it("delegates discover/connect/cancel straight through to the active adapter", async () => {
    const adapter = makeSpyAdapter();
    const manager = new PrinterManager(adapter);
    const device: PrinterDevice = { id: "d1", name: "Dev", kind: "airPrint" };

    await manager.discover();
    await manager.connect(device);
    await manager.cancel();

    expect(adapter.discover).toHaveBeenCalledTimes(1);
    expect(adapter.connect).toHaveBeenCalledWith(device);
    expect(adapter.cancel).toHaveBeenCalledTimes(1);
  });

  it("print() defaults to a single copy", async () => {
    const adapter = makeSpyAdapter();
    const manager = new PrinterManager(adapter);
    const image = fakeBitmap();

    await manager.print(image);

    expect(adapter.print).toHaveBeenCalledTimes(1);
    expect(adapter.print).toHaveBeenCalledWith(image);
  });

  it("print() calls the adapter once per requested copy, sequentially, with the same image", async () => {
    const adapter = makeSpyAdapter();
    const order: number[] = [];
    let inFlight = 0;
    (adapter.print as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      inFlight++;
      order.push(inFlight);
      await Promise.resolve();
      inFlight--;
    });

    const manager = new PrinterManager(adapter);
    const image = fakeBitmap();
    await manager.print(image, 3);

    expect(adapter.print).toHaveBeenCalledTimes(3);
    for (const call of (adapter.print as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(image);
    }
    // Never more than one copy in flight at once -- copies are awaited in
    // sequence, not fired concurrently (matters for a real printer queue).
    expect(Math.max(...order)).toBe(1);
  });

  it("print() with copies=0 never calls the adapter", async () => {
    const adapter = makeSpyAdapter();
    const manager = new PrinterManager(adapter);
    await manager.print(fakeBitmap(), 0);
    expect(adapter.print).not.toHaveBeenCalled();
  });

  it("print() propagates a mid-batch failure and stops issuing further copies", async () => {
    const adapter = makeSpyAdapter();
    let calls = 0;
    (adapter.print as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      calls++;
      if (calls === 2) throw new Error("printer jammed");
    });

    const manager = new PrinterManager(adapter);
    await expect(manager.print(fakeBitmap(), 4)).rejects.toThrow("printer jammed");
    expect(adapter.print).toHaveBeenCalledTimes(2); // stopped after the failing 2nd copy, never tried a 3rd/4th
  });
});
