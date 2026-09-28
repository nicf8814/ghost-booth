import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareSheetPrinterAdapter } from "../src/printing/ShareSheetPrinterAdapter";

// print() with an ImageBitmap goes through utils/image.ts's
// imageBitmapToBlob(), which builds an OffscreenCanvas + 2D context --
// jsdom has neither, so it's faked the same way the other rendering tests
// in this suite fake it.
class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(kind: string) {
    if (kind !== "2d") return null;
    return { drawImage: vi.fn() };
  }
  convertToBlob() {
    return Promise.resolve(new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" }));
  }
}

function fakeBitmap(): ImageBitmap {
  return { width: 100, height: 100 } as unknown as ImageBitmap;
}

function fakeBlob(): Blob {
  return new Blob(["already-a-blob"], { type: "image/jpeg" });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeOffscreenCanvas;
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of properties this suite adds to navigator
  delete navigator.canShare;
  // @ts-expect-error -- test-only cleanup of properties this suite adds to navigator
  delete navigator.share;
});

describe("ShareSheetPrinterAdapter", () => {
  it("discover() reports the single virtual share-sheet device", async () => {
    const adapter = new ShareSheetPrinterAdapter();
    const devices = await adapter.discover();
    expect(devices).toEqual([{ id: "share-sheet", name: "iOS Share Sheet", kind: "vendorBridge" }]);
  });

  it("connect() and disconnect() are no-ops that resolve", async () => {
    const adapter = new ShareSheetPrinterAdapter();
    await expect(adapter.connect({ id: "share-sheet", name: "iOS Share Sheet", kind: "vendorBridge" })).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it("cancel() is a no-op that resolves", async () => {
    await expect(new ShareSheetPrinterAdapter().cancel()).resolves.toBeUndefined();
  });

  it("print() throws a clear error when the browser can't share files at all", async () => {
    Object.assign(navigator, { canShare: undefined, share: vi.fn() });
    const adapter = new ShareSheetPrinterAdapter();
    await expect(adapter.print(fakeBlob())).rejects.toThrow(/can't share image files/);
  });

  it("print() throws when canShare() reports it can't share this particular file", async () => {
    Object.assign(navigator, { canShare: vi.fn(() => false), share: vi.fn() });
    const adapter = new ShareSheetPrinterAdapter();
    await expect(adapter.print(fakeBlob())).rejects.toThrow(/can't share image files/);
  });

  it("print() opens the native share sheet with the photo attached when sharing is supported", async () => {
    const shareMock = vi.fn(async () => {});
    Object.assign(navigator, { canShare: vi.fn(() => true), share: shareMock });

    const adapter = new ShareSheetPrinterAdapter();
    await adapter.print(fakeBlob());

    expect(shareMock).toHaveBeenCalledTimes(1);
    const arg = shareMock.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].type).toBe("image/jpeg");
    // files only -- no title/text. A Shortcut's "Receive ... and N more
    // from Share Sheet" step picks up title/text as their own separate
    // shared items and can save them as junk extra "images" in the target
    // album alongside the real photo (confirmed on the real device).
    expect(arg.title).toBeUndefined();
    expect(arg.text).toBeUndefined();
    expect(Object.keys(arg)).toEqual(["files"]);
  });

  it("print() converts an ImageBitmap to a blob first when not already given a Blob", async () => {
    const canShareMock = vi.fn(() => true);
    const shareMock = vi.fn(async () => {});
    Object.assign(navigator, { canShare: canShareMock, share: shareMock });

    const adapter = new ShareSheetPrinterAdapter();
    await adapter.print(fakeBitmap());

    expect(shareMock).toHaveBeenCalledTimes(1);
    const file = shareMock.mock.calls[0][0].files[0];
    expect(file).toBeInstanceOf(File);
  });

  it("print() treats a cancelled share sheet (AbortError) as a success, not a failure", async () => {
    const abortError = new DOMException("The user aborted a request.", "AbortError");
    Object.assign(navigator, { canShare: vi.fn(() => true), share: vi.fn(async () => { throw abortError; }) });

    const adapter = new ShareSheetPrinterAdapter();
    await expect(adapter.print(fakeBlob())).resolves.toBeUndefined();
  });

  it("print() re-throws a genuine, non-abort share error", async () => {
    const realError = new Error("share failed unexpectedly");
    Object.assign(navigator, { canShare: vi.fn(() => true), share: vi.fn(async () => { throw realError; }) });

    const adapter = new ShareSheetPrinterAdapter();
    await expect(adapter.print(fakeBlob())).rejects.toThrow("share failed unexpectedly");
  });

  it("print() re-throws a DOMException that isn't an AbortError", async () => {
    const otherDomException = new DOMException("Not allowed", "NotAllowedError");
    Object.assign(navigator, { canShare: vi.fn(() => true), share: vi.fn(async () => { throw otherDomException; }) });

    const adapter = new ShareSheetPrinterAdapter();
    await expect(adapter.print(fakeBlob())).rejects.toThrow("Not allowed");
  });
});
