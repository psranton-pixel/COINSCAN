import type { CoinRecord, StorageSaveResult, BackupStatusInfo } from '../types/coin';
import { migrateCoinRecord } from '../utils/coinMigration';
import { createCompressedThumbnail } from '../utils/imageProcessor';

const DB_NAME = 'CoinScanProDB';
const DB_VERSION = 1;
const STORE_NAME = 'coins_store';
export const LOCAL_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // 5 MB standard browser localStorage limit

const BACKUP_META_PREFIX = 'coinscan_backup_meta_';

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is unavailable in this browser environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error || new Error('Failed to open IndexedDB storage.'));
    };
  });
}

function measureUtf8Bytes(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length * 2;
  }
}

export function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.max(0, bytes)} B`;
}

/**
 * Calculates current localStorage usage in bytes, formatted string, and quota percentage.
 */
export function getLocalStorageUsageInfo(): {
  usedBytes: number;
  quotaBytes: number;
  percentUsed: number;
  formattedUsed: string;
  formattedQuota: string;
} {
  let usedBytes = 0;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const val = localStorage.getItem(key) || '';
          usedBytes += (key.length + val.length) * 2;
        }
      }
    }
  } catch {
    // Unreadable in restricted sandbox
  }

  const quotaBytes = LOCAL_STORAGE_QUOTA_BYTES;
  const percentUsed = Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10);

  return {
    usedBytes,
    quotaBytes,
    percentUsed,
    formattedUsed: formatStorageBytes(usedBytes),
    formattedQuota: '5.0 MB',
  };
}

/**
 * Returns combined IndexedDB & LocalStorage telemetry for Advanced Storage diagnostics in Settings.
 */
export async function getAdvancedStorageStats(scopeKey: string): Promise<{
  indexedDbSupported: boolean;
  indexedDbBytes: number;
  formattedIndexedDb: string;
  localStorageBytes: number;
  localStoragePercent: number;
  formattedLocalStorage: string;
  recordCount: number;
  photoCount: number;
}> {
  const ls = getLocalStorageUsageInfo();
  let indexedDbBytes = 0;
  let recordCount = 0;
  let photoCount = 0;
  let indexedDbSupported = typeof window !== 'undefined' && Boolean(window.indexedDB);

  try {
    const db = await openIndexedDB();
    const records = await new Promise<CoinRecord[] | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(scopeKey);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (Array.isArray(records)) {
      recordCount = records.length;
      records.forEach((c) => {
        if (c.obverseImage) photoCount += 1;
        if (c.reverseImage) photoCount += 1;
        if (c.originalObverseImage) photoCount += 1;
        if (c.originalReverseImage) photoCount += 1;
      });
      indexedDbBytes = measureUtf8Bytes(JSON.stringify(records));
    }
  } catch {
    indexedDbSupported = false;
  }

  return {
    indexedDbSupported,
    indexedDbBytes,
    formattedIndexedDb: formatStorageBytes(indexedDbBytes),
    localStorageBytes: ls.usedBytes,
    localStoragePercent: ls.percentUsed,
    formattedLocalStorage: ls.formattedUsed,
    recordCount,
    photoCount,
  };
}

/**
 * Backup status tracking (lastBackupAt, lastModifiedAt, hasChangesSinceBackup).
 */
export function getBackupStatus(scopeId: string): BackupStatusInfo {
  try {
    const raw = localStorage.getItem(`${BACKUP_META_PREFIX}${scopeId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        lastBackupAt: parsed.lastBackupAt || null,
        lastModifiedAt: parsed.lastModifiedAt || null,
        hasChangesSinceBackup: Boolean(parsed.hasChangesSinceBackup),
      };
    }
  } catch {
    // Fallback
  }
  return {
    lastBackupAt: null,
    lastModifiedAt: null,
    hasChangesSinceBackup: false,
  };
}

export function markCollectionModified(scopeId: string): BackupStatusInfo {
  const current = getBackupStatus(scopeId);
  const next: BackupStatusInfo = {
    lastBackupAt: current.lastBackupAt,
    lastModifiedAt: new Date().toISOString(),
    hasChangesSinceBackup: true,
  };
  try {
    localStorage.setItem(`${BACKUP_META_PREFIX}${scopeId}`, JSON.stringify(next));
  } catch {
    // Best-effort flag
  }
  return next;
}

export function recordBackupSuccess(scopeId: string): BackupStatusInfo {
  const now = new Date().toISOString();
  const next: BackupStatusInfo = {
    lastBackupAt: now,
    lastModifiedAt: now,
    hasChangesSinceBackup: false,
  };
  try {
    localStorage.setItem(`${BACKUP_META_PREFIX}${scopeId}`, JSON.stringify(next));
  } catch {
    // Best-effort flag
  }
  return next;
}

const thumbnailMemoCache = new Map<string, string>();
const writeQueuesByKey = new Map<string, Promise<StorageSaveResult>>();

async function getCachedThumbnail(dataUrl: string | undefined): Promise<string | undefined> {
  if (!dataUrl || dataUrl.startsWith('data:image/svg')) return dataUrl;
  const sig = `${dataUrl.length}:${dataUrl.slice(0, 48)}:${dataUrl.slice(-48)}`;
  const cached = thumbnailMemoCache.get(sig);
  if (cached) return cached;

  const thumb = await createCompressedThumbnail(dataUrl, 160, 0.65);
  if (thumb) {
    if (thumbnailMemoCache.size >= 300) {
      const firstKey = thumbnailMemoCache.keys().next().value;
      if (firstKey) thumbnailMemoCache.delete(firstKey);
    }
    thumbnailMemoCache.set(sig, thumb);
  }
  return thumb || dataUrl;
}

/**
 * Stores full-resolution coin records in IndexedDB and compressed thumbnails in localStorage.
 * Serialized per key and memoized for thumbnails to prevent main-thread canvas/IDB storms during sync.
 * Explicitly reports save outcomes and errors instead of silently ignoring storage failures.
 */
export function saveCoinsToStorage(key: string, coins: CoinRecord[]): Promise<StorageSaveResult> {
  const prev = writeQueuesByKey.get(key) || Promise.resolve({
    ok: true,
    indexedDbOk: true,
    localStorageOk: true,
    indexedDbBytes: 0,
    localStorageBytes: 0,
  });

  const nextTask = prev
    .catch(() => undefined)
    .then(() => performSaveCoinsToStorage(key, coins));

  writeQueuesByKey.set(key, nextTask);
  return nextTask;
}

async function performSaveCoinsToStorage(key: string, coins: CoinRecord[]): Promise<StorageSaveResult> {
  let indexedDbOk = false;
  let localStorageOk = false;
  let indexedDbError: string | undefined;
  let localStorageError: string | undefined;

  let indexedDbBytes = 0;
  try {
    indexedDbBytes = measureUtf8Bytes(JSON.stringify(coins));
  } catch {
    indexedDbBytes = 0;
  }

  // 1. Persist full records (with full-resolution photos) to IndexedDB
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(coins, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || req.error || new Error('IndexedDB write transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write transaction was aborted (possibly out of disk quota).'));
    });
    indexedDbOk = true;
  } catch (err: any) {
    indexedDbError = err?.message || 'IndexedDB storage write failed.';
    console.warn('IndexedDB save failed:', indexedDbError);
  }

  // 2. Persist lightweight thumbnail index to localStorage (memoized per image signature)
  let localStorageBytes = 0;
  try {
    const thumbnailCoins = await Promise.all(
      coins.map(async (c) => {
        const obvThumb = await getCachedThumbnail(c.obverseImage);
        const revThumb = c.reverseImage ? await getCachedThumbnail(c.reverseImage) : undefined;
        return {
          ...c,
          obverseImage: obvThumb || c.obverseImage,
          ...(revThumb ? { reverseImage: revThumb } : {}),
          originalObverseImage: undefined,
          originalReverseImage: undefined,
        };
      })
    );
    const serialized = JSON.stringify(thumbnailCoins);
    localStorageBytes = measureUtf8Bytes(serialized);
    localStorage.setItem(key, serialized);
    localStorageOk = true;
  } catch (lsErr: any) {
    // Try metadata-only fallback if thumbnails exceed 5MB localStorage quota
    try {
      const metadataOnly = coins.map((c) => ({
        ...c,
        obverseImage: c.obverseImage?.startsWith('data:image/svg') ? c.obverseImage : '',
        reverseImage: undefined,
        originalObverseImage: undefined,
        originalReverseImage: undefined,
      }));
      const serializedMeta = JSON.stringify(metadataOnly);
      localStorageBytes = measureUtf8Bytes(serializedMeta);
      localStorage.setItem(key, serializedMeta);
      localStorageOk = true;
    } catch (metaErr: any) {
      localStorageError = metaErr?.message || lsErr?.message || 'Browser localStorage quota exceeded.';
    }
  }

  const ok = indexedDbOk || localStorageOk;
  let error: string | undefined;
  if (!ok) {
    error = `Device storage write failed (${indexedDbError || localStorageError || 'Quota exceeded'}). Export a JSON backup immediately.`;
  } else if (!indexedDbOk && indexedDbError) {
    error = `Full-resolution local photo storage failed (${indexedDbError}). Only compact local index could be saved.`;
  }

  return {
    ok,
    indexedDbOk,
    localStorageOk,
    indexedDbBytes,
    localStorageBytes,
    error,
  };
}

/**
 * Loads full-resolution coin records from IndexedDB first, with localStorage thumbnail fallback,
 * safely applying record migrations without mutating IDs or SKUs.
 */
export async function loadCoinsFromStorage(key: string): Promise<CoinRecord[]> {
  try {
    const db = await openIndexedDB();
    const records = await new Promise<CoinRecord[] | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (Array.isArray(records) && records.length > 0) {
      return records.map((c) => migrateCoinRecord(c));
    }
  } catch {
    // IndexedDB unavailable or empty, fall back to localStorage
  }

  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c) => migrateCoinRecord(c));
      }
    }
  } catch {
    // Unreadable fallback
  }

  return [];
}

const DELETED_IDS_PREFIX = 'coinscan_deleted_ids_';
const UNCLAIMED_RECOVERY_KEY = 'coinscan_unclaimed_recovery';
const CLEAN_GUEST_SESSION_FLAG = 'coinscan_clean_guest_active';

export function getDeletedCoinIds(scopeId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${DELETED_IDS_PREFIX}${scopeId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((id) => typeof id === 'string'));
      }
    }
  } catch {
    // Ignore
  }
  return new Set();
}

export function markCoinIdsDeleted(coinIds: string[], scopeId: string): void {
  if (!coinIds.length) return;
  try {
    const existing = getDeletedCoinIds(scopeId);
    coinIds.forEach((id) => existing.add(id));
    const arr = Array.from(existing).slice(-1000);
    localStorage.setItem(`${DELETED_IDS_PREFIX}${scopeId}`, JSON.stringify(arr));
  } catch {
    // Ignore
  }
}

export function clearDeletedCoinId(coinId: string, scopeId: string): void {
  try {
    const existing = getDeletedCoinIds(scopeId);
    if (existing.delete(coinId)) {
      localStorage.setItem(`${DELETED_IDS_PREFIX}${scopeId}`, JSON.stringify(Array.from(existing)));
    }
  } catch {
    // Ignore
  }
}

/**
 * Removes a storage key from both IndexedDB and localStorage.
 */
export async function removeStorageKey(key: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
  try {
    const db = await openIndexedDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore
  }
}

/**
 * Merges two versions of the same CoinRecord, preserving the highest-resolution images
 * and the newer metadata fields.
 */
export function mergeCoinRecordVersions(
  first: CoinRecord,
  second: CoinRecord,
  targetOwnerId?: string
): CoinRecord {
  const firstMs = Date.parse(first.updatedAt || first.createdAt || '') || 0;
  const secondMs = Date.parse(second.updatedAt || second.createdAt || '') || 0;
  const newer = secondMs >= firstMs ? second : first;
  const older = secondMs >= firstMs ? first : second;

  const pickBestImage = (imgA?: string, imgB?: string): string | undefined => {
    if (!imgA) return imgB;
    if (!imgB) return imgA;
    // Prefer real raster data URL over SVG placeholder, then prefer longer/higher-res string
    const aIsSvg = imgA.startsWith('data:image/svg');
    const bIsSvg = imgB.startsWith('data:image/svg');
    if (aIsSvg && !bIsSvg) return imgB;
    if (bIsSvg && !aIsSvg) return imgA;
    return imgA.length >= imgB.length ? imgA : imgB;
  };

  const obverseImage = pickBestImage(newer.obverseImage, older.obverseImage) || newer.obverseImage || '';
  const reverseImage = pickBestImage(newer.reverseImage, older.reverseImage);
  const originalObverseImage = pickBestImage(newer.originalObverseImage, older.originalObverseImage);
  const originalReverseImage = pickBestImage(newer.originalReverseImage, older.originalReverseImage);

  return migrateCoinRecord({
    ...older,
    ...newer,
    owner_user_id: targetOwnerId || newer.owner_user_id || older.owner_user_id,
    obverseImage,
    ...(reverseImage ? { reverseImage } : {}),
    ...(originalObverseImage ? { originalObverseImage } : {}),
    ...(originalReverseImage ? { originalReverseImage } : {}),
  });
}

/**
 * Reads records from BOTH IndexedDB and localStorage for a given key and merges them by coin.id,
 * so even if one storage layer was partially overwritten, no coin or full-res photo is lost.
 */
async function loadCoinsFromBothEngines(key: string): Promise<CoinRecord[]> {
  const byId = new Map<string, CoinRecord>();

  try {
    const db = await openIndexedDB();
    const idbRecords = await new Promise<CoinRecord[] | undefined>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    if (Array.isArray(idbRecords)) {
      for (const raw of idbRecords) {
        if (!raw || !raw.id) continue;
        const migrated = migrateCoinRecord(raw);
        const prev = byId.get(migrated.id);
        byId.set(migrated.id, prev ? mergeCoinRecordVersions(prev, migrated) : migrated);
      }
    }
  } catch {
    // Ignore IDB error
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawStr = localStorage.getItem(key);
      if (rawStr) {
        const parsed = JSON.parse(rawStr);
        if (Array.isArray(parsed)) {
          for (const raw of parsed) {
            if (!raw || !raw.id) continue;
            const migrated = migrateCoinRecord(raw);
            const prev = byId.get(migrated.id);
            byId.set(migrated.id, prev ? mergeCoinRecordVersions(prev, migrated) : migrated);
          }
        }
      }
    }
  } catch {
    // Ignore LS error
  }

  return Array.from(byId.values());
}

/**
 * Called when logged out (!userId):
 * - Prevents previous user's scanned coins in `coinscan_last_coins` or `coinscan_cache_guest`
 *   from remaining visible after logging out.
 * - Safely stashes any such coins into `coinscan_unclaimed_recovery` (and their owner's cache key)
 *   BEFORE clearing `coinscan_last_coins` and leaked items from `coinscan_cache_guest`,
 *   guaranteeing zero data loss when the user signs back in.
 */
export async function stashLeakedCoinsAndLoadCleanGuestSession(): Promise<CoinRecord[]> {
  let isCleanGuestSession = false;
  try {
    isCleanGuestSession = sessionStorage.getItem(CLEAN_GUEST_SESSION_FLAG) === '1';
  } catch {
    isCleanGuestSession = false;
  }

  const [lastCoins, guestCoins, existingUnclaimed] = await Promise.all([
    loadCoinsFromBothEngines('coinscan_last_coins'),
    loadCoinsFromBothEngines('coinscan_cache_guest'),
    loadCoinsFromBothEngines(UNCLAIMED_RECOVERY_KEY),
  ]);

  const stashedById = new Map<string, CoinRecord>();
  const addToStash = (coin: CoinRecord) => {
    if (!coin || !coin.id) return;
    const prev = stashedById.get(coin.id);
    stashedById.set(coin.id, prev ? mergeCoinRecordVersions(prev, coin) : migrateCoinRecord(coin));
  };

  existingUnclaimed.forEach(addToStash);
  lastCoins.forEach(addToStash);

  const genuineGuestCoins: CoinRecord[] = [];
  for (const coin of guestCoins) {
    if (!coin || !coin.id) continue;
    const belongsToSignedInUser = Boolean(coin.owner_user_id && coin.owner_user_id !== 'guest');
    if (belongsToSignedInUser || !isCleanGuestSession) {
      // This coin was either owned by a signed-in user or leaked into guest cache on logout
      addToStash(coin);
    } else {
      genuineGuestCoins.push(migrateCoinRecord(coin));
    }
  }

  if (stashedById.size > 0) {
    const stashedList = Array.from(stashedById.values());
    await saveCoinsToStorage(UNCLAIMED_RECOVERY_KEY, stashedList);

    // Also group by any explicit user UID and merge into their user-specific local cache
    const byOwner = new Map<string, CoinRecord[]>();
    for (const c of stashedList) {
      if (c.owner_user_id && c.owner_user_id !== 'guest') {
        const list = byOwner.get(c.owner_user_id) || [];
        list.push(c);
        byOwner.set(c.owner_user_id, list);
      }
    }
    for (const [ownerUid, ownerCoins] of byOwner.entries()) {
      const userKey = `coinscan_cache_${ownerUid}`;
      const existingUserCoins = await loadCoinsFromBothEngines(userKey);
      const mergedMap = new Map<string, CoinRecord>();
      existingUserCoins.forEach((c) => mergedMap.set(c.id, c));
      ownerCoins.forEach((c) => {
        const prev = mergedMap.get(c.id);
        mergedMap.set(c.id, prev ? mergeCoinRecordVersions(prev, c, ownerUid) : migrateCoinRecord({ ...c, owner_user_id: ownerUid }));
      });
      await saveCoinsToStorage(userKey, Array.from(mergedMap.values()));
    }
  }

  // Now clear coinscan_last_coins and update coinscan_cache_guest to contain only genuine guest coins
  await removeStorageKey('coinscan_last_coins');
  if (genuineGuestCoins.length !== guestCoins.length) {
    if (genuineGuestCoins.length === 0) {
      await removeStorageKey('coinscan_cache_guest');
    } else {
      await saveCoinsToStorage('coinscan_cache_guest', genuineGuestCoins);
    }
  }

  try {
    sessionStorage.setItem(CLEAN_GUEST_SESSION_FLAG, '1');
  } catch {
    // Ignore
  }

  return genuineGuestCoins;
}

/**
 * Called upon sign-in (when `userId` is present):
 * - Inspects ALL local storage buckets (IndexedDB + localStorage):
 *   `coinscan_cache_${userId}`, `coinscan_unclaimed_recovery`, `coinscan_last_coins`, `coinscan_cache_guest`
 * - Deduplicates by coin.id, preserving highest-resolution images and newest edits
 * - Filters out any coins explicitly deleted by this user
 * - Persists the full recovered collection to `coinscan_cache_${userId}` and cleans up leaked guest/last caches
 */
export async function recoverAndUnionAllLocalCoins(userId: string): Promise<CoinRecord[]> {
  try {
    sessionStorage.removeItem(CLEAN_GUEST_SESSION_FLAG);
  } catch {
    // Ignore
  }

  const deletedIds = getDeletedCoinIds(userId);
  const userCacheKey = `coinscan_cache_${userId}`;

  const candidateKeys = new Set<string>([
    userCacheKey,
    UNCLAIMED_RECOVERY_KEY,
    'coinscan_last_coins',
    'coinscan_cache_guest',
  ]);

  // Discover any additional keys in IndexedDB coins_store
  try {
    const db = await openIndexedDB();
    const idbKeys = await new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      if (typeof store.getAllKeys === 'function') {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve((req.result || []).map((k) => String(k)));
        req.onerror = () => resolve([]);
      } else {
        resolve([]);
      }
    });
    idbKeys.forEach((k) => {
      if (k.startsWith('coinscan_')) {
        candidateKeys.add(k);
      }
    });
  } catch {
    // Ignore
  }

  // Also discover any coinscan_cache_* keys in localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (
          k &&
          (k === userCacheKey ||
            k === UNCLAIMED_RECOVERY_KEY ||
            k === 'coinscan_last_coins' ||
            k === 'coinscan_cache_guest')
        ) {
          candidateKeys.add(k);
        }
      }
    }
  } catch {
    // Ignore
  }

  const unionById = new Map<string, CoinRecord>();

  for (const key of candidateKeys) {
    const records = await loadCoinsFromBothEngines(key);
    for (const coin of records) {
      if (!coin || !coin.id) continue;
      if (deletedIds.has(coin.id)) continue;
      // Include coins belonging to this user, guest, or unclaimed recovery
      if (
        key !== userCacheKey &&
        key !== UNCLAIMED_RECOVERY_KEY &&
        key !== 'coinscan_last_coins' &&
        key !== 'coinscan_cache_guest' &&
        coin.owner_user_id &&
        coin.owner_user_id !== userId &&
        coin.owner_user_id !== 'guest'
      ) {
        continue;
      }
      const existing = unionById.get(coin.id);
      const merged = existing
        ? mergeCoinRecordVersions(existing, coin, userId)
        : migrateCoinRecord({ ...coin, owner_user_id: userId });
      unionById.set(coin.id, merged);
    }
  }

  const recoveredList = Array.from(unionById.values()).sort(
    (a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)
  );

  if (recoveredList.length > 0) {
    await saveCoinsToStorage(userCacheKey, recoveredList);
  }

  // Clean up temporary / leaked stores so logging out later starts completely clean
  await removeStorageKey(UNCLAIMED_RECOVERY_KEY);
  await removeStorageKey('coinscan_last_coins');
  await removeStorageKey('coinscan_cache_guest');

  return recoveredList;
}

