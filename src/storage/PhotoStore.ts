import { idbClearStore, idbDelete, idbGet, idbGetAllEntries, idbSet, STORES } from "./IndexedDB";

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

/**
 * Deletes every stored photo older than `retentionMinutes` (the operator's
 * "Photo Retention" setting). App.tsx runs this on a timer so retention is
 * enforced continuously through a long unattended event, not just at
 * whatever moment a guest happens to trigger a cleanup. Best-effort
 * (CLAUDE.md section 49): a single photo's delete failing doesn't stop the
 * rest of the sweep, and IndexedDB being unavailable just means nothing to
 * purge.
 */
export async function purgeExpiredPhotos(retentionMinutes: number): Promise<void> {
  const entries = await idbGetAllEntries<StoredPhoto>(STORES.tempPhotos);
  await Promise.all(
    entries
      .filter(([, photo]) => isExpired(photo, retentionMinutes))
      .map(([id]) => idbDelete(STORES.tempPhotos, id)),
  );
}
