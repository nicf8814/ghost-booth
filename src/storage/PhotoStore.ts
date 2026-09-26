import { idbClearStore, idbDelete, idbGet, idbSet, STORES } from "./IndexedDB";

// CLAUDE.md sections 43-44: temporary local storage only, no biometric
// metadata, and photos are deleted after session / a configurable timeout.

export interface StoredPhoto {
  id: string;
  blob: Blob;
  createdAt: number; // epoch ms
}

export async function storePhoto(photo: StoredPhoto): Promise<void> {
  await idbSet(STORES.tempPhotos, photo.id, photo);
}

export async function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  return idbGet<StoredPhoto>(STORES.tempPhotos, id);
}

export async function deletePhoto(id: string): Promise<void> {
  await idbDelete(STORES.tempPhotos, id);
}

export async function clearAllPhotos(): Promise<void> {
  await idbClearStore(STORES.tempPhotos);
}

/**
 * Call periodically (e.g. on idle-timeout / attract-mode return) to purge
 * photos older than the operator-configured retention window.
 */
export function isExpired(photo: StoredPhoto, retentionMinutes: number): boolean {
  const ageMs = Date.now() - photo.createdAt;
  return ageMs > retentionMinutes * 60_000;
}
