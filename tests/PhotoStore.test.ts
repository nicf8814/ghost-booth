import { afterEach, describe, expect, it, vi } from "vitest";

// PhotoStore.ts is a thin layer over IndexedDB.ts -- mocked here rather than
// exercised against real IndexedDB (jsdom doesn't implement it, and this
// project has no fake-indexeddb dependency), same approach the rest of this
// suite uses for other browser-only APIs (OffscreenCanvas, etc).
vi.mock("../src/storage/IndexedDB", () => ({
  idbGet: vi.fn(),
  idbSet: vi.fn(),
  idbDelete: vi.fn(),
  idbClearStore: vi.fn(),
  idbGetAllEntries: vi.fn(),
  STORES: { settings: "settings", tempPhotos: "tempPhotos" },
}));

import { idbDelete, idbGetAllEntries } from "../src/storage/IndexedDB";
import { isExpired, purgeExpiredPhotos, type StoredPhoto } from "../src/storage/PhotoStore";

function fakePhoto(id: string, ageMinutes: number): StoredPhoto {
  return {
    id,
    blob: new Blob(["x"]),
    createdAt: Date.now() - ageMinutes * 60_000,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isExpired", () => {
  it("is false for a photo younger than the retention window", () => {
    expect(isExpired(fakePhoto("a", 5), 30)).toBe(false);
  });

  it("is true for a photo older than the retention window", () => {
    expect(isExpired(fakePhoto("a", 45), 30)).toBe(true);
  });
});

describe("purgeExpiredPhotos", () => {
  it("deletes only the photos past the retention window, leaving fresh ones alone", async () => {
    vi.mocked(idbGetAllEntries).mockResolvedValue([
      ["fresh", fakePhoto("fresh", 5)],
      ["stale-1", fakePhoto("stale-1", 45)],
      ["stale-2", fakePhoto("stale-2", 90)],
    ]);
    vi.mocked(idbDelete).mockResolvedValue(undefined);

    await purgeExpiredPhotos(30);

    expect(idbDelete).toHaveBeenCalledTimes(2);
    expect(idbDelete).toHaveBeenCalledWith("tempPhotos", "stale-1");
    expect(idbDelete).toHaveBeenCalledWith("tempPhotos", "stale-2");
    expect(idbDelete).not.toHaveBeenCalledWith("tempPhotos", "fresh");
  });

  it("deletes nothing when every stored photo is still within the window", async () => {
    vi.mocked(idbGetAllEntries).mockResolvedValue([["fresh", fakePhoto("fresh", 1)]]);

    await purgeExpiredPhotos(30);

    expect(idbDelete).not.toHaveBeenCalled();
  });

  it("is a no-op against an empty store", async () => {
    vi.mocked(idbGetAllEntries).mockResolvedValue([]);

    await expect(purgeExpiredPhotos(30)).resolves.toBeUndefined();
    expect(idbDelete).not.toHaveBeenCalled();
  });
});
