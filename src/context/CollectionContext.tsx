import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  subscribeToCoins,
  getUserCoins,
  subscribeToCategories,
  createCoinRecord,
  updateCoinRecord,
  deleteCoinRecord,
  createCategory,
  saveMultipleCoins,
  isFirestoreQuotaCooldownActive,
  clearFirestoreQuotaCooldown,
  markFirestoreQuotaExceeded,
  isFirestoreQuotaError,
} from '../services/firebase';
import type {
  BackupStatusInfo,
  BackupValidationResult,
  CoinRecord,
  CollectionCategory,
  CurrencyCode,
  LabelTemplate,
  ResaleFeeSettings,
  SkuSettings,
} from '../types/coin';
import { normalizeRarity } from '../utils/formatters';
import { migrateCoinRecord } from '../utils/coinMigration';
import { generateBackupPayload, generateCsvExport } from '../services/backupService';
import { evaluateCoinMeltValue, toSpotPriceReference } from '../services/marketRatesService';
import {
  allocateShortBarcodeId,
  DEFAULT_SKU_SETTINGS,
  formatSku,
  getNextAvailableSequence,
} from '../services/skuService';
import { DEFAULT_LABEL_TEMPLATE } from '../services/labelService';
import {
  clearDeletedCoinId,
  getBackupStatus,
  getDeletedCoinIds,
  loadCoinsFromStorage,
  markCoinIdsDeleted,
  markCollectionModified,
  mergeCoinRecordVersions,
   recordBackupSuccess,
  recoverAndUnionAllLocalCoins,
  saveCoinsToStorage,
  stashLeakedCoinsAndLoadCleanGuestSession,
} from '../services/storageService';
import { getResaleFeeSettings, saveResaleFeeSettings } from '../utils/inventoryCalculations';

export type CloudSyncStatus = 'idle' | 'connecting' | 'synced' | 'reconnecting' | 'error';

interface CollectionContextType {
  coins: CoinRecord[];
  categories: CollectionCategory[];
  loading: boolean;
  storageError: string | null;
  cloudSyncError: string | null;
  clearStorageError: () => void;
  cloudSyncStatus: CloudSyncStatus;
  isQuotaExceeded: boolean;
  retryCloudSync: () => Promise<void>;
  backupStatus: BackupStatusInfo;
  includeSampleCoins: boolean;
  setIncludeSampleCoins: (include: boolean) => void;
  hasGuestCoins: boolean;
  migrateGuestCoins: () => Promise<{ count: number }>;
  loadDemoCoins: () => Promise<void>;
  removeSampleCoins: () => Promise<void>;
  importDemoCoinAsReal: (coinId: string) => Promise<CoinRecord | null>;
  addCoin: (coin: CoinRecord) => Promise<void>;
  updateCoin: (coin: Partial<CoinRecord> & { id: string }) => Promise<void>;
  deleteCoin: (coinId: string) => Promise<void>;
  bulkUpdateCoins: (coinIds: string[], updates: Partial<CoinRecord>) => Promise<void>;
  bulkDeleteCoins: (coinIds: string[]) => Promise<void>;
  duplicateCoin: (coin: CoinRecord) => Promise<CoinRecord>;
  refreshCoinValuation: (coinId: string, targetCurrency?: CurrencyCode) => Promise<CoinRecord | null>;
  toggleFavorite: (coinId: string) => Promise<void>;
  addCategory: (name: string, color?: string) => Promise<void>;
  exportCollection: (format?: 'json' | 'csv', includeSamples?: boolean) => void;
  restoreBackup: (
    validation: BackupValidationResult,
    mergeChoice: 'update_and_add' | 'add_only' | 'replace_all'
  ) => Promise<{ added: number; updated: number; skipped: number }>;
  checkForDuplicate: (newCoin: { country?: string; year?: number; denomination?: string; mintMark?: string; id?: string }) => CoinRecord | null;
  selectedCoin: CoinRecord | null;
  setSelectedCoin: (coin: CoinRecord | null) => void;

  // SKU, Compact Barcode ID & Label Printing Extensions
  skuSettings: SkuSettings;
  updateSkuSettings: (settings: Partial<SkuSettings>) => void;
  labelTemplate: LabelTemplate;
  updateLabelTemplate: (template: Partial<LabelTemplate>) => void;
  generateNextSku: (coin: Partial<CoinRecord>, previewOnly?: boolean) => { sku: string; sequenceNum: number };
  allocateBarcodeIdForCoin: (coinId: string) => Promise<string | null>;
  batchApplySkus: (allocations: { coinId: string; proposedSku: string; storageLocation?: string }[]) => Promise<{ updatedCount: number }>;
  splitCoinStock: (coinId: string) => Promise<CoinRecord[]>;
  lookupCoinBySku: (code: string) => CoinRecord | undefined;

  // Resale Platform Fee Presets
  resaleFeeSettings: ResaleFeeSettings;
  updateResaleFeeSettings: (settings: Partial<ResaleFeeSettings>) => void;
}

const CollectionContext = createContext<CollectionContextType | undefined>(undefined);

/**
 * Safely merges persisted label templates while ensuring corrected default dimensions
 * replace legacy overflowing defaults if user still has untouched A4 preset dims.
 */
function hydrateLabelTemplate(savedJson: string | null): LabelTemplate {
  if (!savedJson) return DEFAULT_LABEL_TEMPLATE;
  try {
    const parsed = JSON.parse(savedJson);
    const merged: LabelTemplate = { ...DEFAULT_LABEL_TEMPLATE, ...parsed };
    // Migrate untouched legacy A4 24-up default (66 x 33.8 mm) to the exact 66 x 32 mm sticker paper layout
    if (
      merged.presetId === 'a4_24_66x33' &&
      merged.paperSize === 'A4' &&
      merged.labelWidthMm === 66 &&
      merged.labelHeightMm === 33.8 &&
      merged.labelsAcross === 3 &&
      merged.labelsDown === 8 &&
      merged.marginLeftMm === 4.65 &&
      merged.marginRightMm === 4.65 &&
      merged.marginTopMm === 13.3 &&
      merged.marginBottomMm === 13.3 &&
      merged.gapVerticalMm === 0 &&
      (merged.gapHorizontalMm === 1.35 || merged.gapHorizontalMm === 2.5)
    ) {
      merged.presetId = 'a4_24_66x32';
      merged.name = DEFAULT_LABEL_TEMPLATE.name;
      merged.paperWidthMm = 210;
      merged.paperHeightMm = 297;
      merged.orientation = 'portrait';
      merged.labelWidthMm = 66;
      merged.labelHeightMm = 32;
      merged.marginLeftMm = 6;
      merged.marginRightMm = 0;
      merged.marginTopMm = 12;
      merged.marginBottomMm = 8;
      merged.gapHorizontalMm = 3;
      merged.gapVerticalMm = 3;
      if (merged.barcodeHeightMm === 9) {
        merged.barcodeHeightMm = DEFAULT_LABEL_TEMPLATE.barcodeHeightMm;
      }
    }
    if (
      merged.presetId === 'a4_24_64x33' &&
      merged.labelWidthMm === 64 &&
      merged.marginLeftMm === 7.65 &&
      merged.marginRightMm === 7.65 &&
      merged.gapHorizontalMm === 2.5
    ) {
      merged.marginLeftMm = 6.5;
      merged.marginRightMm = 6.5;
    }
    return merged;
  } catch {
    return DEFAULT_LABEL_TEMPLATE;
  }
}

interface ClassifiedFirestoreError {
  category: 'quota' | 'permission' | 'transient';
  retryable: boolean;
  detail: string;
  message: string;
}

function extractFirestoreErrorDetails(rawError: unknown, wrappedError?: Error): { code: string; text: string } {
  const rawObj = rawError as { code?: string; message?: string } | undefined;
  const code = typeof rawObj?.code === 'string' ? rawObj.code.toLowerCase() : '';
  let text = typeof rawObj?.message === 'string' ? rawObj.message : '';

  if (!text && wrappedError?.message) {
    try {
      const parsed = JSON.parse(wrappedError.message);
      if (parsed && typeof parsed.error === 'string') {
        text = parsed.error;
      } else {
        text = wrappedError.message;
      }
    } catch {
      text = wrappedError.message;
    }
  }
  return { code, text };
}

function classifyFirestoreSyncError(rawError: unknown, wrappedError?: Error): ClassifiedFirestoreError {
  const { code, text } = extractFirestoreErrorDetails(rawError, wrappedError);
  const combined = `${code} ${text}`.toLowerCase();

  if (
    isFirestoreQuotaError(rawError) ||
    isFirestoreQuotaError(wrappedError) ||
    code === 'resource-exhausted' ||
    combined.includes('quota exceeded') ||
    combined.includes('quota limit exceeded') ||
    combined.includes('free daily read units') ||
    combined.includes('resource-exhausted')
  ) {
    return {
      category: 'quota',
      retryable: false,
      detail: 'quota-exceeded',
      message:
        'Firebase daily free-tier Firestore quota exceeded. Your coins remain saved on this device, and quota resets tomorrow unless upgraded in Firebase Console.',
    };
  }

  if (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    combined.includes('permission-denied') ||
    combined.includes('missing or insufficient permissions') ||
    combined.includes('unauthenticated')
  ) {
    return {
      category: 'permission',
      retryable: false,
      detail: code || 'permission-denied',
      message:
        'Cloud sync blocked by Firestore permissions or expired sign-in session. Showing locally cached records — try signing out and signing back in.',
    };
  }

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const detail = isOffline ? 'device offline' : code || 'network interruption';
  return {
    category: 'transient',
    retryable: true,
    detail,
    message: isOffline
      ? 'Device appears offline. Showing locally cached records until connection returns.'
      : `Cloud sync interrupted (${detail}). Showing locally cached records.`,
  };
}

/**
 * Performs a full union of Firestore cloud coin records with local device records:
 * - Preserves higher-resolution local photos (cutouts + raw originals) when cloud records have compact thumbnails
 * - Retains all local coins whose IDs are not yet in Firestore (`unsyncedLocalCoins`) so signing in never drops locally scanned coins
 * - Respects pending local upserts and explicitly deleted coin IDs
 */
export function mergeCloudWithLocalFullResMedia(
  cloudCoins: CoinRecord[],
  localCoins: CoinRecord[],
  pendingUpserts: Map<string, CoinRecord>,
  pendingDeletes: Set<string>,
  deletedIds: Set<string> = new Set(),
  targetUserId?: string
): { merged: CoinRecord[]; unsyncedLocalCoins: CoinRecord[] } {
  const localMap = new Map<string, CoinRecord>();
  for (const c of localCoins) {
    if (!c || !c.id) continue;
    const prev = localMap.get(c.id);
    localMap.set(c.id, prev ? mergeCoinRecordVersions(prev, c, targetUserId) : c);
  }

  const seenIds = new Set<string>();
  const merged: CoinRecord[] = [];
  const unsyncedLocalCoins: CoinRecord[] = [];

  // 1. Merge all cloud coins with any higher-resolution local counterparts
  for (const rawCloud of cloudCoins) {
    if (!rawCloud || !rawCloud.id) continue;
    if (pendingDeletes.has(rawCloud.id) || deletedIds.has(rawCloud.id)) continue;
    seenIds.add(rawCloud.id);

    const pendingLocal = pendingUpserts.get(rawCloud.id);
    if (pendingLocal) {
      merged.push(mergeCoinRecordVersions(rawCloud, pendingLocal, targetUserId));
      continue;
    }

    const localCoin = localMap.get(rawCloud.id);
    if (!localCoin) {
      merged.push(migrateCoinRecord(targetUserId ? { ...rawCloud, owner_user_id: targetUserId } : rawCloud));
      continue;
    }

    merged.push(mergeCoinRecordVersions(rawCloud, localCoin, targetUserId));
  }

  // 2. Preserve every local coin that has not yet been uploaded to Firestore
  for (const [localId, localCoin] of localMap.entries()) {
    if (seenIds.has(localId)) continue;
    if (pendingDeletes.has(localId) || deletedIds.has(localId)) continue;
    seenIds.add(localId);

    const pendingCoin = pendingUpserts.get(localId);
    const unifiedCoin = migrateCoinRecord({
      ...(pendingCoin ? mergeCoinRecordVersions(localCoin, pendingCoin, targetUserId) : localCoin),
      ...(targetUserId ? { owner_user_id: targetUserId } : {}),
    });
    merged.push(unifiedCoin);
    if (!unifiedCoin.isSample) {
      unsyncedLocalCoins.push(unifiedCoin);
    }
  }

  // 3. Preserve any remaining pendingUpserts not yet in seenIds
  for (const [pendingId, pendingCoin] of pendingUpserts.entries()) {
    if (!seenIds.has(pendingId) && !pendingDeletes.has(pendingId) && !deletedIds.has(pendingId)) {
      seenIds.add(pendingId);
      const unifiedPending = migrateCoinRecord(
        targetUserId ? { ...pendingCoin, owner_user_id: targetUserId } : pendingCoin
      );
      merged.unshift(unifiedPending);
      if (!unifiedPending.isSample) {
        unsyncedLocalCoins.push(unifiedPending);
      }
    }
  }

  merged.sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
  return { merged, unsyncedLocalCoins };
}

export const CollectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const backupScopeId = user?.uid || 'guest';

  // Start empty until auth state resolves so a previous user's coins never flash or persist when logged out
  const [coins, setCoins] = useState<CoinRecord[]>([]);
  const [categories, setCategories] = useState<CollectionCategory[]>([]);

  const [loading, setLoading] = useState(true);
  const [localStorageError, setLocalStorageError] = useState<string | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('idle');
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [syncNonce, setSyncNonce] = useState(0);
  const [backupStatus, setBackupStatus] = useState<BackupStatusInfo>(() => getBackupStatus(backupScopeId));
  const [includeSampleCoins, setIncludeSampleCoins] = useState(false);
  const [hasGuestCoins, setHasGuestCoins] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<CoinRecord | null>(null);

  const storageError = localStorageError;

  const userId = user?.uid || null;

  const coinsRef = React.useRef<CoinRecord[]>(coins);
  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);

  const pendingUpsertsRef = React.useRef<Map<string, CoinRecord>>(new Map());
  const pendingDeletesRef = React.useRef<Set<string>>(new Set());

  const cloudSyncStatusRef = React.useRef<CloudSyncStatus>(cloudSyncStatus);
  useEffect(() => {
    cloudSyncStatusRef.current = cloudSyncStatus;
  }, [cloudSyncStatus]);

  const isQuotaExceededRef = React.useRef<boolean>(isQuotaExceeded);
  useEffect(() => {
    isQuotaExceededRef.current = isQuotaExceeded;
  }, [isQuotaExceeded]);

  const clearStorageError = () => {
    setLocalStorageError(null);
    setCloudSyncError(null);
  };

  useEffect(() => {
    setBackupStatus(getBackupStatus(backupScopeId));
  }, [backupScopeId]);

  const persistLocalCollection = async (key: string, nextCoins: CoinRecord[], markDirty: boolean) => {
    const primaryResult = await saveCoinsToStorage(key, nextCoins);
    if (!primaryResult.ok) {
      setLocalStorageError(primaryResult.error || 'Failed to persist collection on this device.');
      throw new Error(primaryResult.error || 'Device storage write failed.');
    } else if (primaryResult.error) {
      setLocalStorageError(primaryResult.error);
    } else {
      setLocalStorageError(null);
    }
    if (markDirty) {
      setBackupStatus(markCollectionModified(backupScopeId));
    }
  };

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true;

    if (!userId) {
      // Immediately clear previous user's coins and selection from screen upon log out
      pendingUpsertsRef.current.clear();
      pendingDeletesRef.current.clear();
      coinsRef.current = [];
      setCoins([]);
      setCategories([]);
      setSelectedCoin(null);
      setHasGuestCoins(false);
      setCloudSyncStatus('idle');
      setCloudSyncError(null);
      setIsQuotaExceeded(false);

      // Safely stash any unclaimed/leaked coins from previous session into recovery storage before loading clean guest session
      stashLeakedCoinsAndLoadCleanGuestSession()
        .then((cleanGuestCoins) => {
          if (!isMounted) return;
          coinsRef.current = cleanGuestCoins;
          setCoins(cleanGuestCoins);
          setLoading(false);
        })
        .catch(() => {
          if (!isMounted) return;
          setCoins([]);
          setLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }

    const cacheKey = `coinscan_cache_${userId}`;
    const RETRY_DELAYS_MS = [1500, 3000, 6000, 12000, 20000, 30000];
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let localPersistTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubCoins: (() => void) | null = null;
    let unsubCategories: (() => void) | null = null;
    let flushingPending = false;

    const flushPendingCloudQueue = async () => {
      if (flushingPending || !isMounted || isQuotaExceededRef.current) return;
      if (pendingUpsertsRef.current.size === 0 && pendingDeletesRef.current.size === 0) return;

      flushingPending = true;
      try {
        const upserts = Array.from(pendingUpsertsRef.current.entries());
        const BATCH_SIZE = 3;
        for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
          if (!isMounted || isQuotaExceededRef.current) break;
          const batch = upserts.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async ([id, pendingCoin]) => {
              try {
                await createCoinRecord(userId, pendingCoin);
                pendingUpsertsRef.current.delete(id);
              } catch (itemErr: any) {
                const classified = classifyFirestoreSyncError(itemErr, itemErr instanceof Error ? itemErr : undefined);
                if (classified.category === 'quota') {
                  isQuotaExceededRef.current = true;
                  setIsQuotaExceeded(true);
                  setCloudSyncStatus('error');
                  setCloudSyncError(classified.message);
                } else {
                  console.warn(`Deferred cloud upload for coin ${id}:`, classified.detail);
                }
              }
            })
          );
        }

        for (const id of Array.from(pendingDeletesRef.current.values())) {
          if (!isMounted || isQuotaExceededRef.current) break;
          try {
            await deleteCoinRecord(userId, id);
            pendingDeletesRef.current.delete(id);
          } catch (delErr) {
            console.warn(`Deferred cloud delete for coin ${id}:`, delErr);
          }
        }
      } finally {
        flushingPending = false;
      }
    };

    const teardownListeners = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (localPersistTimer) {
        clearTimeout(localPersistTimer);
        localPersistTimer = null;
      }
      if (unsubCoins) {
        unsubCoins();
        unsubCoins = null;
      }
      if (unsubCategories) {
        unsubCategories();
        unsubCategories = null;
      }
    };

    const enterQuotaLocalMode = (message?: string) => {
      markFirestoreQuotaExceeded();
      teardownListeners();
      isQuotaExceededRef.current = true;
      setIsQuotaExceeded(true);
      setCloudSyncStatus('error');
      setCloudSyncError(
        message ||
          'Firebase daily free-tier Firestore quota exceeded. Your coins remain saved on this device, and quota resets tomorrow unless upgraded in Firebase Console.'
      );
      setLoading(false);
    };

    const attachListeners = () => {
      if (!isMounted) return;
      if (isFirestoreQuotaCooldownActive() || isQuotaExceededRef.current) {
        enterQuotaLocalMode();
        return;
      }

      teardownListeners();
      setCloudSyncStatus(retryAttempt > 0 ? 'reconnecting' : 'connecting');

      unsubCoins = subscribeToCoins(
        userId,
        (fetchedCoins, meta) => {
          if (!isMounted) return;
          retryAttempt = 0;
          setCloudSyncStatus('synced');
          setCloudSyncError(null);
          setIsQuotaExceeded(false);

          const deletedIds = getDeletedCoinIds(userId);
          const { merged, unsyncedLocalCoins } = mergeCloudWithLocalFullResMedia(
            fetchedCoins,
            coinsRef.current,
            pendingUpsertsRef.current,
            pendingDeletesRef.current,
            deletedIds,
            userId
          );
          coinsRef.current = merged;
          setCoins(merged);
          setLoading(false);

          // Queue any locally scanned coins that aren't in Firestore yet once server snapshot arrives
          if (!meta?.fromCache) {
            for (const unsynced of unsyncedLocalCoins) {
              if (!pendingDeletesRef.current.has(unsynced.id)) {
                pendingUpsertsRef.current.set(unsynced.id, unsynced);
              }
            }
          }

          if (localPersistTimer) clearTimeout(localPersistTimer);
          localPersistTimer = setTimeout(() => {
            if (!isMounted) return;
            saveCoinsToStorage(cacheKey, merged);
          }, 350);

          if (!meta?.fromCache && (pendingUpsertsRef.current.size > 0 || pendingDeletesRef.current.size > 0)) {
            flushPendingCloudQueue();
          }
        },
        (wrappedErr, rawErr) => {
          if (!isMounted) return;
          setLoading(false);

          const classified = classifyFirestoreSyncError(rawErr, wrappedErr);
          if (classified.category === 'quota') {
            enterQuotaLocalMode(classified.message);
            return;
          }

          if (!classified.retryable) {
            teardownListeners();
            setCloudSyncStatus('error');
            setIsQuotaExceeded(false);
            setCloudSyncError(classified.message);
            return;
          }

          if (unsubCoins) {
            unsubCoins();
            unsubCoins = null;
          }

          if (retryAttempt < RETRY_DELAYS_MS.length) {
            const delayMs = RETRY_DELAYS_MS[retryAttempt];
            retryAttempt += 1;
            setCloudSyncStatus('reconnecting');
            // Let brief mobile 5G / socket handoffs recover silently before showing reconnecting banner
            if (retryAttempt >= 3) {
              setCloudSyncError(
                `Cloud sync interrupted (${classified.detail}) — reconnecting (attempt ${retryAttempt}/${RETRY_DELAYS_MS.length})... Showing locally cached records.`
              );
            }
            retryTimer = setTimeout(() => {
              if (isMounted) attachListeners();
            }, delayMs);
          } else {
            setCloudSyncStatus('error');
            setCloudSyncError(
              `Cloud sync interrupted (${classified.detail}). Showing locally cached records — tap Retry Sync when ready.`
            );
          }
        }
      );

      unsubCategories = subscribeToCategories(
        userId,
        (fetchedCats) => {
          if (!isMounted) return;
          setCategories(fetchedCats);
          try {
            localStorage.setItem(`coinscan_cache_cat_${userId}`, JSON.stringify(fetchedCats));
          } catch {
            // Ignore
          }
        },
        (wrappedErr, rawErr) => {
          if (!isMounted) return;
          const classified = classifyFirestoreSyncError(rawErr, wrappedErr);
          if (classified.category === 'quota') {
            enterQuotaLocalMode(classified.message);
            return;
          }
          if (unsubCategories) {
            unsubCategories();
            unsubCategories = null;
          }
          console.warn('Category sync listener interrupted:', classified.detail);
        }
      );
    };

    // Hydrate cached categories immediately so categories remain available offline / during quota cooldown
    try {
      const cachedCats = localStorage.getItem(`coinscan_cache_cat_${userId}`);
      if (cachedCats) {
        const parsedCats = JSON.parse(cachedCats);
        if (Array.isArray(parsedCats)) setCategories(parsedCats);
      }
    } catch {
      // Ignore
    }

    // Recover and union all local stores (user cache, unclaimed recovery, guest scans, last cache) BEFORE attaching cloud listener
    recoverAndUnionAllLocalCoins(userId)
      .then((recoveredLocal) => {
        if (!isMounted) return;
        setHasGuestCoins(false);
        if (recoveredLocal.length > 0) {
          coinsRef.current = recoveredLocal;
          setCoins(recoveredLocal);
          setLoading(false);
        }
        if (isFirestoreQuotaCooldownActive()) {
          enterQuotaLocalMode();
        } else {
          attachListeners();
        }
      })
      .catch(() => {
        if (!isMounted) return;
        if (isFirestoreQuotaCooldownActive()) {
          enterQuotaLocalMode();
        } else {
          attachListeners();
        }
      });

    const handleNetworkOrResume = () => {
      if (!isMounted || isQuotaExceededRef.current || isFirestoreQuotaCooldownActive()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (cloudSyncStatusRef.current === 'reconnecting' || cloudSyncStatusRef.current === 'error') {
        retryAttempt = 0;
        attachListeners();
      } else if (pendingUpsertsRef.current.size > 0 || pendingDeletesRef.current.size > 0) {
        flushPendingCloudQueue();
      }
    };

    window.addEventListener('online', handleNetworkOrResume);
    document.addEventListener('visibilitychange', handleNetworkOrResume);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleNetworkOrResume);
      document.removeEventListener('visibilitychange', handleNetworkOrResume);
      teardownListeners();
    };
  }, [userId, authLoading, syncNonce]);

  const retryCloudSync = async () => {
    if (!user) return;
    clearFirestoreQuotaCooldown();
    isQuotaExceededRef.current = false;
    setCloudSyncError(null);
    setIsQuotaExceeded(false);
    setCloudSyncStatus('connecting');
    try {
      const recoveredLocal = await recoverAndUnionAllLocalCoins(user.uid);
      if (recoveredLocal.length > coinsRef.current.length) {
        coinsRef.current = recoveredLocal;
        setCoins(recoveredLocal);
      }

      const fetchedCoins = await getUserCoins(user.uid);
      const deletedIds = getDeletedCoinIds(user.uid);
      const { merged, unsyncedLocalCoins } = mergeCloudWithLocalFullResMedia(
        fetchedCoins,
        coinsRef.current,
        pendingUpsertsRef.current,
        pendingDeletesRef.current,
        deletedIds,
        user.uid
      );
      coinsRef.current = merged;
      setCoins(merged);
      setLoading(false);

      for (const unsynced of unsyncedLocalCoins) {
        pendingUpsertsRef.current.set(unsynced.id, unsynced);
      }

      for (const [id, pendingCoin] of Array.from(pendingUpsertsRef.current.entries())) {
        if (isFirestoreQuotaCooldownActive()) break;
        try {
          await createCoinRecord(user.uid, pendingCoin);
          pendingUpsertsRef.current.delete(id);
        } catch (upErr) {
          if (isFirestoreQuotaError(upErr)) throw upErr;
          console.warn(`Retry sync skipped coin ${id}:`, upErr);
        }
      }
      for (const id of Array.from(pendingDeletesRef.current.values())) {
        if (isFirestoreQuotaCooldownActive()) break;
        try {
          await deleteCoinRecord(user.uid, id);
          pendingDeletesRef.current.delete(id);
        } catch (delErr) {
          if (isFirestoreQuotaError(delErr)) throw delErr;
          console.warn(`Retry delete skipped coin ${id}:`, delErr);
        }
      }

      const cacheKey = `coinscan_cache_${user.uid}`;
      await saveCoinsToStorage(cacheKey, merged);
      setCloudSyncStatus('synced');
      setSyncNonce((n) => n + 1);
    } catch (err) {
      const classified = classifyFirestoreSyncError(err, err instanceof Error ? err : undefined);
      setCloudSyncStatus('error');
      const isQuota = classified.category === 'quota';
      if (isQuota) {
        markFirestoreQuotaExceeded();
        isQuotaExceededRef.current = true;
      }
      setIsQuotaExceeded(isQuota);
      setCloudSyncError(classified.message);
      if (classified.retryable) {
        setSyncNonce((n) => n + 1);
      }
    }
  };

  const [skuSettings, setSkuSettingsState] = useState<SkuSettings>(() => {
    try {
      const key = user ? `coinscan_sku_settings_${user.uid}` : 'coinscan_sku_settings_guest';
      const saved = localStorage.getItem(key) || localStorage.getItem('coinscan_sku_settings_guest');
      if (saved) return { ...DEFAULT_SKU_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // Fallback
    }
    return DEFAULT_SKU_SETTINGS;
  });

  const [labelTemplate, setLabelTemplateState] = useState<LabelTemplate>(() => {
    try {
      const key = user ? `coinscan_label_template_${user.uid}` : 'coinscan_label_template_guest';
      const saved = localStorage.getItem(key) || localStorage.getItem('coinscan_label_template_guest');
      return hydrateLabelTemplate(saved);
    } catch {
      return DEFAULT_LABEL_TEMPLATE;
    }
  });

  const updateSkuSettings = (newSettings: Partial<SkuSettings>) => {
    setSkuSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        const key = user ? `coinscan_sku_settings_${user.uid}` : 'coinscan_sku_settings_guest';
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const updateLabelTemplate = (newTemplate: Partial<LabelTemplate>) => {
    setLabelTemplateState((prev) => {
      const updated = { ...prev, ...newTemplate };
      try {
        const key = user ? `coinscan_label_template_${user.uid}` : 'coinscan_label_template_guest';
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  };

  const [resaleFeeSettings, setResaleFeeSettings] = useState<ResaleFeeSettings>(() => getResaleFeeSettings());

  const updateResaleFeeSettings = (newSettings: Partial<ResaleFeeSettings>) => {
    setResaleFeeSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveResaleFeeSettings(updated);
      return updated;
    });
  };

  const generateNextSku = (coin: Partial<CoinRecord>, previewOnly: boolean = false) => {
    const nextSeq = getNextAvailableSequence(coins, skuSettings);
    const sku = formatSku(coin, nextSeq, skuSettings);
    if (!previewOnly) {
      updateSkuSettings({ highestAllocatedSequence: nextSeq });
    }
    return { sku, sequenceNum: nextSeq };
  };

  const allocateBarcodeIdForCoin = async (coinId: string): Promise<string | null> => {
    const target = coins.find((c) => c.id === coinId);
    if (!target) return null;
    if (target.barcodeId) return target.barcodeId;
    const barcodeId = allocateShortBarcodeId(coins);
    await updateCoin({ id: coinId, barcodeId });
    return barcodeId;
  };

  const batchApplySkus = async (
    allocations: { coinId: string; proposedSku: string; storageLocation?: string }[]
  ): Promise<{ updatedCount: number }> => {
    const now = new Date().toISOString();
    const allocMap = new Map(allocations.map((a) => [a.coinId, a]));

    let maxSeq = skuSettings.highestAllocatedSequence;
    allocations.forEach((a) => {
      const match = a.proposedSku.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    });

    const updatedCoins = coins.map((c) => {
      const alloc = allocMap.get(c.id);
      if (alloc) {
        return {
          ...c,
          sku: alloc.proposedSku,
          storageLocation: alloc.storageLocation !== undefined ? alloc.storageLocation : c.storageLocation,
          updatedAt: now,
        };
      }
      return c;
    });

    setCoins(updatedCoins);
    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    await persistLocalCollection(storageKey, updatedCoins, true);
    updateSkuSettings({ highestAllocatedSequence: maxSeq });

    if (user) {
      const coinsToPersist = updatedCoins.filter((c) => allocMap.has(c.id));
      await saveMultipleCoins(user.uid, coinsToPersist);
    }

    return { updatedCount: allocations.length };
  };

  const splitCoinStock = async (coinId: string): Promise<CoinRecord[]> => {
    const sourceCoin = coins.find((c) => c.id === coinId);
    if (!sourceCoin || (sourceCoin.quantity || 1) <= 1) {
      return sourceCoin ? [sourceCoin] : [];
    }

    const totalQty = sourceCoin.quantity;
    const now = new Date().toISOString();
    const ownerId = user?.uid || 'guest';

    const unitPurchasePrice =
      sourceCoin.purchasePrice !== undefined
        ? sourceCoin.costBasisType === 'total'
          ? Math.round((sourceCoin.purchasePrice / totalQty) * 100) / 100
          : sourceCoin.purchasePrice
        : undefined;

    const updatedOriginal: CoinRecord = {
      ...sourceCoin,
      quantity: 1,
      costBasisType: 'per_coin',
      purchasePrice: unitPurchasePrice,
      updatedAt: now,
    };

    const newSpecimens: CoinRecord[] = [];
    let currentSeq = getNextAvailableSequence(coins, skuSettings);

    for (let i = 1; i < totalQty; i++) {
      const newSku = formatSku(sourceCoin, currentSeq, skuSettings);
      currentSeq++;
      const specimen: CoinRecord = {
        ...sourceCoin,
        id: `coin_${Date.now()}_split_${i}_${Math.random().toString(36).substring(2, 6)}`,
        owner_user_id: ownerId,
        title: `${sourceCoin.title} (Specimen #${i + 1})`,
        quantity: 1,
        costBasisType: 'per_coin',
        purchasePrice: unitPurchasePrice,
        sku: newSku,
        barcodeId: undefined,
        createdAt: now,
        updatedAt: now,
      };
      newSpecimens.push(specimen);
    }

    updateSkuSettings({ highestAllocatedSequence: currentSeq - 1 });

    const allNewAndUpdated = [updatedOriginal, ...newSpecimens];
    const newFullCollection = coins.map((c) => (c.id === sourceCoin.id ? updatedOriginal : c)).concat(newSpecimens);

    setCoins(newFullCollection);
    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    await persistLocalCollection(storageKey, newFullCollection, true);

    if (user) {
      await saveMultipleCoins(user.uid, allNewAndUpdated);
    }

    return allNewAndUpdated;
  };

  /**
   * Matches EITHER the full SKU OR the immutable short barcodeId (case-insensitive).
   */
  const lookupCoinBySku = (code: string): CoinRecord | undefined => {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) return undefined;
    return coins.find(
      (c) =>
        (c.sku || '').trim().toLowerCase() === trimmed ||
        (c.barcodeId || '').trim().toLowerCase() === trimmed
    );
  };

  const addCoin = async (coin: CoinRecord) => {
    const ownerId = user?.uid || 'guest';

    let finalSku = coin.sku;
    let newHighestSeq = skuSettings.highestAllocatedSequence;

    if (!finalSku && skuSettings.autoGenerateOnSave && !coin.isSample) {
      const nextSeq = getNextAvailableSequence(coins, skuSettings);
      finalSku = formatSku(coin, nextSeq, skuSettings);
      newHighestSeq = Math.max(newHighestSeq, nextSeq);
      updateSkuSettings({ highestAllocatedSequence: newHighestSeq });
    } else if (finalSku) {
      const match = finalSku.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > newHighestSeq) {
          updateSkuSettings({ highestAllocatedSequence: num });
        }
      }
    }

    const coinWithUser = migrateCoinRecord({
      ...coin,
      sku: finalSku || undefined,
      storageLocation: coin.storageLocation || skuSettings.defaultStorageLocation,
      owner_user_id: ownerId,
      rarity: normalizeRarity(coin.rarity),
      createdAt: coin.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    clearDeletedCoinId(coinWithUser.id, backupScopeId);
    const currentList = coinsRef.current;
    const exists = currentList.some((c) => c.id === coinWithUser.id);
    const nextCoins = exists
      ? currentList.map((c) => (c.id === coinWithUser.id ? coinWithUser : c))
      : [coinWithUser, ...currentList];
    coinsRef.current = nextCoins;
    setCoins(nextCoins);

    await persistLocalCollection(storageKey, nextCoins, !coinWithUser.isSample);

    if (user) {
      pendingDeletesRef.current.delete(coinWithUser.id);
      pendingUpsertsRef.current.set(coinWithUser.id, coinWithUser);
      if (!isQuotaExceededRef.current && !isFirestoreQuotaCooldownActive()) {
        try {
          await createCoinRecord(user.uid, coinWithUser);
          pendingUpsertsRef.current.delete(coinWithUser.id);
        } catch (cloudErr: any) {
          const classified = classifyFirestoreSyncError(cloudErr, cloudErr instanceof Error ? cloudErr : undefined);
          const isQuota = classified.category === 'quota';
          if (isQuota) {
            markFirestoreQuotaExceeded();
            isQuotaExceededRef.current = true;
          }
          setIsQuotaExceeded(isQuota);
          if (classified.retryable) {
            setCloudSyncStatus('reconnecting');
            setCloudSyncError(
              `Saved on this device (${classified.detail}). Cloud sync queued and will retry automatically.`
            );
          } else {
            if (!isQuota) pendingUpsertsRef.current.delete(coinWithUser.id);
            setCloudSyncStatus('error');
            setCloudSyncError(`Saved on this device, but cloud sync paused: ${classified.message}`);
          }
        }
      }
    }
  };

  const updateCoin = async (coin: Partial<CoinRecord> & { id: string }) => {
    const now = new Date().toISOString();
    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    const currentList = coinsRef.current;
    const exists = currentList.some((c) => c.id === coin.id);
    let updatedTarget: CoinRecord | null = null;

    const nextCoins = exists
      ? currentList.map((c) => {
          if (c.id !== coin.id) return c;
          updatedTarget = migrateCoinRecord({
            ...c,
            ...coin,
            rarity: coin.rarity ? normalizeRarity(coin.rarity) : c.rarity,
            updatedAt: now,
          } as CoinRecord);
          return updatedTarget;
        })
      : [migrateCoinRecord({ ...(coin as CoinRecord), updatedAt: now }), ...currentList];

    if (!updatedTarget && !exists) {
      updatedTarget = nextCoins[0];
    }

    coinsRef.current = nextCoins;
    setCoins(nextCoins);

    if (selectedCoin && selectedCoin.id === coin.id && updatedTarget) {
      setSelectedCoin(updatedTarget);
    }

    await persistLocalCollection(storageKey, nextCoins, !updatedTarget?.isSample);

    if (user) {
      const targetForCloud = migrateCoinRecord({
        ...(updatedTarget || coin),
        owner_user_id: user.uid,
        updatedAt: now,
      } as CoinRecord);
      pendingUpsertsRef.current.set(targetForCloud.id, targetForCloud);
      if (!isQuotaExceededRef.current && !isFirestoreQuotaCooldownActive()) {
        try {
          await updateCoinRecord(user.uid, targetForCloud);
          pendingUpsertsRef.current.delete(targetForCloud.id);
        } catch (cloudErr: any) {
          const classified = classifyFirestoreSyncError(cloudErr, cloudErr instanceof Error ? cloudErr : undefined);
          const isQuota = classified.category === 'quota';
          if (isQuota) {
            markFirestoreQuotaExceeded();
            isQuotaExceededRef.current = true;
          }
          setIsQuotaExceeded(isQuota);
          if (classified.retryable) {
            setCloudSyncStatus('reconnecting');
            setCloudSyncError(
              `Updated on this device (${classified.detail}). Cloud sync queued and will retry automatically.`
            );
          } else {
            if (!isQuota) pendingUpsertsRef.current.delete(targetForCloud.id);
            setCloudSyncStatus('error');
            setCloudSyncError(`Updated on this device, but cloud sync paused: ${classified.message}`);
          }
        }
      }
    }
  };

  const deleteCoin = async (coinId: string) => {
    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    markCoinIdsDeleted([coinId], backupScopeId);
    const currentList = coinsRef.current;
    const removed = currentList.find((c) => c.id === coinId);
    const nextCoins = currentList.filter((c) => c.id !== coinId);
    coinsRef.current = nextCoins;
    setCoins(nextCoins);

    if (selectedCoin?.id === coinId) {
      setSelectedCoin(null);
    }
    await persistLocalCollection(storageKey, nextCoins, !removed?.isSample);
    if (user) {
      pendingUpsertsRef.current.delete(coinId);
      pendingDeletesRef.current.add(coinId);
      if (!isQuotaExceededRef.current && !isFirestoreQuotaCooldownActive()) {
        try {
          await deleteCoinRecord(user.uid, coinId);
          pendingDeletesRef.current.delete(coinId);
        } catch (cloudErr: any) {
          const classified = classifyFirestoreSyncError(cloudErr, cloudErr instanceof Error ? cloudErr : undefined);
          const isQuota = classified.category === 'quota';
          if (isQuota) {
            markFirestoreQuotaExceeded();
            isQuotaExceededRef.current = true;
          }
          setIsQuotaExceeded(isQuota);
          if (classified.retryable) {
            setCloudSyncStatus('reconnecting');
            setCloudSyncError(
              `Removed on this device (${classified.detail}). Cloud delete queued and will retry automatically.`
            );
          } else {
            if (!isQuota) pendingDeletesRef.current.delete(coinId);
            setCloudSyncStatus('error');
            setCloudSyncError(`Removed on this device, but cloud delete paused: ${classified.message}`);
          }
        }
      }
    }
  };

  const bulkUpdateCoins = async (coinIds: string[], updates: Partial<CoinRecord>) => {
    if (coinIds.length === 0) return;
    const idSet = new Set(coinIds);
    const now = new Date().toISOString();
    const nextCoins = coinsRef.current.map((c) => {
      if (idSet.has(c.id)) {
        return migrateCoinRecord({
          ...c,
          ...updates,
          rarity: updates.rarity ? normalizeRarity(updates.rarity) : c.rarity,
          updatedAt: now,
        } as CoinRecord);
      }
      return c;
    });
    const coinsToPersist = nextCoins.filter((c) => idSet.has(c.id));
    coinsRef.current = nextCoins;
    setCoins(nextCoins);

    if (selectedCoin && idSet.has(selectedCoin.id)) {
      setSelectedCoin((prev) => (prev ? migrateCoinRecord({ ...prev, ...updates, updatedAt: now } as CoinRecord) : null));
    }

    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    await persistLocalCollection(storageKey, nextCoins, true);

    if (user && coinsToPersist.length > 0) {
      await saveMultipleCoins(user.uid, coinsToPersist);
    }
  };

  const bulkDeleteCoins = async (coinIds: string[]) => {
    if (coinIds.length === 0) return;
    markCoinIdsDeleted(coinIds, backupScopeId);
    const idSet = new Set(coinIds);
    const nextCoins = coinsRef.current.filter((c) => !idSet.has(c.id));
    coinsRef.current = nextCoins;
    setCoins(nextCoins);

    if (selectedCoin && idSet.has(selectedCoin.id)) {
      setSelectedCoin(null);
    }

    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    await persistLocalCollection(storageKey, nextCoins, true);

    if (user) {
      for (const coinId of coinIds) {
        pendingUpsertsRef.current.delete(coinId);
        pendingDeletesRef.current.add(coinId);
        if (isQuotaExceededRef.current || isFirestoreQuotaCooldownActive()) continue;
        try {
          await deleteCoinRecord(user.uid, coinId);
          pendingDeletesRef.current.delete(coinId);
        } catch (delErr) {
          if (isFirestoreQuotaError(delErr)) {
            markFirestoreQuotaExceeded();
            isQuotaExceededRef.current = true;
            setIsQuotaExceeded(true);
            continue;
          }
          console.warn(`Deferred bulk delete for coin ${coinId}:`, delErr);
        }
      }
    }
  };

  const duplicateCoin = async (coin: CoinRecord): Promise<CoinRecord> => {
    const ownerId = user?.uid || 'guest';
    const newId = `coin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const nextSeq = getNextAvailableSequence(coinsRef.current, skuSettings);
    const newSku = skuSettings.autoGenerateOnSave ? formatSku(coin, nextSeq, skuSettings) : undefined;
    if (newSku) updateSkuSettings({ highestAllocatedSequence: nextSeq });

    const duplicated = migrateCoinRecord({
      ...coin,
      id: newId,
      owner_user_id: ownerId,
      title: `${coin.title} (Copy)`,
      sku: newSku,
      barcodeId: undefined,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });

    const storageKey = user ? `coinscan_cache_${user.uid}` : 'coinscan_cache_guest';
    const nextCoins = [duplicated, ...coinsRef.current];
    coinsRef.current = nextCoins;
    setCoins(nextCoins);
    await persistLocalCollection(storageKey, nextCoins, true);

    if (user) {
      pendingUpsertsRef.current.set(duplicated.id, duplicated);
      if (!isQuotaExceededRef.current && !isFirestoreQuotaCooldownActive()) {
        try {
          await createCoinRecord(user.uid, duplicated);
          pendingUpsertsRef.current.delete(duplicated.id);
        } catch (dupErr) {
          if (isFirestoreQuotaError(dupErr)) {
            markFirestoreQuotaExceeded();
            isQuotaExceededRef.current = true;
            setIsQuotaExceeded(true);
          } else {
            console.warn('Duplicate coin cloud sync deferred:', dupErr);
          }
        }
      }
    }
    return duplicated;
  };

  /**
   * Explicitly converts a demo coin into a genuine real user record (allocates new ID & SKU, clears isSample).
   */
  const importDemoCoinAsReal = async (coinId: string): Promise<CoinRecord | null> => {
    const sample = coins.find((c) => c.id === coinId && c.isSample);
    if (!sample) return null;

    const ownerId = user?.uid || 'guest';
    const now = new Date().toISOString();
    const newId = `coin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nextSeq = getNextAvailableSequence(coins, skuSettings);
    const newSku = formatSku(sample, nextSeq, skuSettings);
    updateSkuSettings({ highestAllocatedSequence: nextSeq });

    const imported = migrateCoinRecord({
      ...sample,
      id: newId,
      owner_user_id: ownerId,
      sku: newSku,
      barcodeId: undefined,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });

    await addCoin(imported);
    return imported;
  };

  /**
   * Refreshes dated spot-based melt valuation and FX timestamps cleanly without inventing auction evidence.
   */
  const refreshCoinValuation = async (coinId: string, targetCurrency: CurrencyCode = 'USD'): Promise<CoinRecord | null> => {
    const coin = coins.find((c) => c.id === coinId);
    if (!coin) return null;

    const now = new Date().toISOString();
    const meltResult = evaluateCoinMeltValue(coin, targetCurrency);
    const nextMeltUSD = meltResult.available && meltResult.breakdown ? meltResult.breakdown.meltValueUSD : undefined;

    // Ensure market value does not silently remain below verified intrinsic bullion melt
    let updatedEst = coin.estimatedValue;
    let updatedLow = coin.lowValue;
    let updatedHigh = coin.highValue;
    if (nextMeltUSD !== undefined && updatedEst < nextMeltUSD) {
      updatedEst = Math.round(nextMeltUSD * 1.03 * 100) / 100;
      updatedLow = Math.max(updatedLow, nextMeltUSD);
      updatedHigh = Math.max(updatedHigh, Math.round(nextMeltUSD * 1.15 * 100) / 100);
    }

    const updatedHistory = [
      ...(coin.valuationHistory || []),
      {
        date: now,
        estimatedValue: updatedEst,
        lowValue: updatedLow,
        highValue: updatedHigh,
        currency: coin.currency || 'USD',
        grade: coin.estimatedGradeRange || coin.estimatedGrade,
        methodology: coin.valuationMethodology || (nextMeltUSD ? 'bullion_melt' : 'provisional_ai_inference'),
        evidenceQuality: coin.evidenceQuality || 'provisional_estimate',
        evidenceCount: coin.evidenceCount ?? 0,
        valuationConfidence: coin.valuationConfidence,
        bullionMeltValue: nextMeltUSD,
        spotPriceReference: coin.metalCategory ? toSpotPriceReference(coin.metalCategory) : undefined,
      },
    ];

    const patch: Partial<CoinRecord> & { id: string } = {
      id: coinId,
      estimatedValue: updatedEst,
      lowValue: updatedLow,
      highValue: updatedHigh,
      bullionMeltValue: nextMeltUSD,
      bullionDetails: meltResult.available ? meltResult.breakdown : undefined,
      spotPriceReference: coin.metalCategory ? toSpotPriceReference(coin.metalCategory) : undefined,
      lastValuationUpdate: now,
      valuationHistory: updatedHistory,
    };

    await updateCoin(patch);
    return migrateCoinRecord({ ...coin, ...patch, updatedAt: now } as CoinRecord);
  };

  const toggleFavorite = async (coinId: string) => {
    const coin = coins.find((c) => c.id === coinId);
    if (!coin) return;
    await updateCoin({
      id: coinId,
      isFavorite: !coin.isFavorite,
    });
  };

  const addCategory = async (name: string, color?: string) => {
    const ownerId = user?.uid || 'guest';
    const newCat: CollectionCategory = {
      id: `cat_${Date.now()}`,
      owner_user_id: ownerId,
      name,
      color: color || '#d4af37',
      createdAt: new Date().toISOString(),
    };
    setCategories((prev) => {
      const next = [...prev, newCat];
      if (user) {
        try {
          localStorage.setItem(`coinscan_cache_cat_${user.uid}`, JSON.stringify(next));
        } catch {
          // Ignore
        }
      }
      return next;
    });
    if (user && !isQuotaExceededRef.current && !isFirestoreQuotaCooldownActive()) {
      try {
        await createCategory(user.uid, newCat);
      } catch (catErr) {
        if (isFirestoreQuotaError(catErr)) {
          markFirestoreQuotaExceeded();
          isQuotaExceededRef.current = true;
          setIsQuotaExceeded(true);
        } else {
          console.warn('Category cloud sync deferred:', catErr);
        }
      }
    }
  };

  const migrateGuestCoins = async (): Promise<{ count: number }> => {
    if (!user) return { count: 0 };
    try {
      const guestCoins = await loadCoinsFromStorage('coinscan_cache_guest');
      if (!Array.isArray(guestCoins) || guestCoins.length === 0) return { count: 0 };

      const existingIds = new Set(coins.map((c) => c.id));
      const coinsToMigrate = guestCoins.map((c) => {
        const id = existingIds.has(c.id) ? `coin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : c.id;
        return migrateCoinRecord({
          ...c,
          id,
          owner_user_id: user.uid,
          updatedAt: new Date().toISOString(),
        });
      });

      await saveMultipleCoins(user.uid, coinsToMigrate);
      await saveCoinsToStorage('coinscan_cache_guest', []);
      localStorage.removeItem('coinscan_cache_guest');
      setHasGuestCoins(false);

      const merged = [...coinsToMigrate, ...coins];
      setCoins(merged);
      const storageKey = `coinscan_cache_${user.uid}`;
      await persistLocalCollection(storageKey, merged, true);

      return { count: coinsToMigrate.length };
    } catch (err) {
      console.error('Failed to migrate guest coins:', err);
      throw err;
    }
  };

  const loadDemoCoins = async () => {
    const ownerId = user?.uid || 'guest';
    const now = new Date().toISOString();

    const sampleMorgan = migrateCoinRecord({
      id: 'sample_morgan_1921',
      owner_user_id: ownerId,
      title: '1921 Morgan Silver Dollar (Sample)',
      country: 'United States',
      denomination: '$1.00 USD',
      currency: 'USD',
      year: 1921,
      mintMark: 'P',
      series: 'Morgan Dollar',
      metalCategory: 'silver',
      metalComposition: '90% Silver, 10% Copper',
      fineness: 0.9,
      weightGrams: 26.73,
      diameterMm: 38.1,
      rarity: 'Common',
      bullionType: 'semi_numismatic',
      identificationConfidence: 95,
      gradingConfidence: 78,
      valuationConfidence: 80,
      confidenceScore: 88,
      estimatedGrade: 'MS-63 Choice Uncirculated',
      estimatedGradeRange: 'MS-62 to MS-64',
      conditionDetails: 'Example specimen record showing illustrative luster & wear notes.',
      gradingProvisionalNotice: 'Provisional photo assessment - not professional certification from PCGS/NGC.',
      historicalSignificance: 'Final year of the Morgan Silver Dollar series.',
      estimatedValue: 65.0,
      lowValue: 45.0,
      highValue: 90.0,
      faceValue: '$1.00 USD',
      valuationMethodology: 'catalogue_reference',
      evidenceQuality: 'moderate_confidence',
      evidenceCount: 0,
      valuationRationale: 'Illustrative demo example combining verified 90% silver melt floor with typical MS-63 catalogue demand.',
      isProvisionalValuation: true,
      valuationDate: now,
      lastValuationUpdate: now,
      purchasePrice: 42.0,
      purchaseCurrency: 'USD',
      purchaseDate: '2025-08-14',
      costBasisType: 'total',
      quantity: 1,
      category: 'Silver Dollars',
      isFavorite: true,
      status: 'in_collection',
      isSample: true,
      obverseImage:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><defs><radialGradient id="silverGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23f8fafc"/><stop offset="60%" stop-color="%23cbd5e1"/><stop offset="100%" stop-color="%2364748b"/></radialGradient><linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23e2e8f0"/><stop offset="50%" stop-color="%2394a3b8"/><stop offset="100%" stop-color="%23475569"/></linearGradient></defs><circle cx="250" cy="250" r="230" fill="url(%23rim)"/><circle cx="250" cy="250" r="215" fill="url(%23silverGlow)" stroke="%2394a3b8" stroke-width="4"/><circle cx="250" cy="250" r="195" fill="none" stroke="%23475569" stroke-width="3" stroke-dasharray="5 7"/><text x="250" y="100" font-family="serif" font-size="28" font-weight="bold" fill="%231e293b" text-anchor="middle" letter-spacing="4">E • PLURIBUS • UNUM</text><text x="250" y="270" font-family="serif" font-size="80" font-weight="bold" fill="%23334155" text-anchor="middle">LIBERTY</text><text x="250" y="420" font-family="serif" font-size="34" font-weight="bold" fill="%231e293b" text-anchor="middle" letter-spacing="6">1921</text></svg>',
      reverseImage:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><defs><radialGradient id="silverGlow2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23f8fafc"/><stop offset="60%" stop-color="%23cbd5e1"/><stop offset="100%" stop-color="%2364748b"/></radialGradient></defs><circle cx="250" cy="250" r="230" fill="%2394a3b8"/><circle cx="250" cy="250" r="215" fill="url(%23silverGlow2)"/><text x="250" y="90" font-family="serif" font-size="24" font-weight="bold" fill="%231e293b" text-anchor="middle">UNITED STATES OF AMERICA</text><text x="250" y="270" font-family="serif" font-size="60" font-weight="bold" fill="%23334155" text-anchor="middle">🦅</text><text x="250" y="340" font-family="serif" font-size="20" font-style="italic" fill="%231e293b" text-anchor="middle">In God We Trust</text><text x="250" y="420" font-family="serif" font-size="28" font-weight="bold" fill="%231e293b" text-anchor="middle">ONE DOLLAR</text></svg>',
      recentAuctionComps: [],
      valuationHistory: [
        {
          date: now,
          estimatedValue: 65.0,
          lowValue: 45.0,
          highValue: 90.0,
          currency: 'USD',
          grade: 'MS-63',
          methodology: 'catalogue_reference',
          evidenceQuality: 'moderate_confidence',
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const sampleSovereign = migrateCoinRecord({
      id: 'sample_sovereign_1914',
      owner_user_id: ownerId,
      title: '1914 British Gold Sovereign (Sample)',
      country: 'United Kingdom',
      denomination: 'One Sovereign (£1)',
      currency: 'USD',
      year: 1914,
      mintMark: 'London',
      series: 'George V Sovereign',
      metalCategory: 'gold',
      metalComposition: '22K Gold (.9167 Fineness, 0.2354 oz AGW)',
      fineness: 0.9167,
      weightGrams: 7.988,
      diameterMm: 22.05,
      rarity: 'Common',
      bullionType: 'bullion',
      identificationConfidence: 96,
      gradingConfidence: 82,
      valuationConfidence: 86,
      confidenceScore: 90,
      estimatedGrade: 'AU-58 About Uncirculated',
      estimatedGradeRange: 'AU-55 to MS-60',
      conditionDetails: 'Example specimen showing classic sovereign luster and light cabinet friction.',
      gradingProvisionalNotice: 'Provisional photo assessment - not professional certification from PCGS/NGC.',
      historicalSignificance: 'Minted on the eve of World War I under King George V.',
      estimatedValue: 710.0,
      lowValue: 680.0,
      highValue: 780.0,
      faceValue: '£1.00',
      valuationMethodology: 'bullion_melt',
      evidenceQuality: 'moderate_confidence',
      evidenceCount: 0,
      valuationRationale: 'Illustrative demo example anchored to 22K Sovereign intrinsic gold weight (7.322 g fine Au) plus small collector premium.',
      isProvisionalValuation: true,
      valuationDate: now,
      lastValuationUpdate: now,
      purchasePrice: 620.0,
      purchaseCurrency: 'USD',
      purchaseDate: '2025-02-19',
      costBasisType: 'total',
      quantity: 1,
      category: 'Gold Bullion',
      isFavorite: true,
      status: 'in_collection',
      isSample: true,
      obverseImage:
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><defs><radialGradient id="goldGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23fef08a"/><stop offset="50%" stop-color="%23f59e0b"/><stop offset="100%" stop-color="%23b45309"/></radialGradient></defs><circle cx="250" cy="250" r="230" fill="%23d97706"/><circle cx="250" cy="250" r="215" fill="url(%23goldGlow)" stroke="%23fef08a" stroke-width="4"/><circle cx="250" cy="250" r="195" fill="none" stroke="%2378350f" stroke-width="3" stroke-dasharray="6 6"/><text x="250" y="100" font-family="serif" font-size="24" font-weight="bold" fill="%2378350f" text-anchor="middle">GEORGIVS V D.G.BRITT:OMN:REX</text><text x="250" y="270" font-family="serif" font-size="80" font-weight="bold" fill="%2378350f" text-anchor="middle">👑</text><text x="250" y="420" font-family="serif" font-size="34" font-weight="bold" fill="%2378350f" text-anchor="middle" letter-spacing="4">1914</text></svg>',
      recentAuctionComps: [],
      valuationHistory: [
        {
          date: now,
          estimatedValue: 710.0,
          lowValue: 680.0,
          highValue: 780.0,
          currency: 'USD',
          grade: 'AU-58',
          methodology: 'bullion_melt',
          evidenceQuality: 'moderate_confidence',
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    await addCoin(sampleMorgan);
    await addCoin(sampleSovereign);
    setIncludeSampleCoins(true);
  };

  const removeSampleCoins = async () => {
    const sampleIds = coins.filter((c) => Boolean(c.isSample)).map((c) => c.id);
    for (const id of sampleIds) {
      await deleteCoin(id);
    }
    setIncludeSampleCoins(false);
  };

  const exportCollection = (format: 'json' | 'csv' = 'json', includeSamples: boolean = false) => {
    const dateStamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
      const csvContent = generateCsvExport(coins, includeSamples, resaleFeeSettings);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CoinScanPro_Spreadsheet_${dateStamp}.csv`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      return;
    }

    const payload = generateBackupPayload(
      coins,
      categories,
      user?.uid || 'guest',
      includeSamples,
      skuSettings,
      [labelTemplate]
    );
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CoinScanPro_FullBackup_v${payload.schemaVersion}_${dateStamp}.json`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 15000);

    // Record successful full JSON backup
    setBackupStatus(recordBackupSuccess(backupScopeId));
  };

  const restoreBackup = async (
    validation: BackupValidationResult,
    mergeChoice: 'update_and_add' | 'add_only' | 'replace_all'
  ): Promise<{ added: number; updated: number; skipped: number }> => {
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    if (validation.skuSettings) {
      updateSkuSettings(validation.skuSettings);
    }
    if (validation.labelTemplates && validation.labelTemplates.length > 0) {
      updateLabelTemplate(validation.labelTemplates[0]);
    }

    if (mergeChoice === 'replace_all') {
      const coinsToDelete = [...coins];
      for (const c of coinsToDelete) {
        await deleteCoin(c.id);
      }
      const allToImport = [...validation.recordsToAdd, ...validation.recordsToUpdate];
      for (const coin of allToImport) {
        await addCoin(coin);
        addedCount += 1;
      }
      return { added: addedCount, updated: 0, skipped: 0 };
    }

    if (mergeChoice === 'update_and_add') {
      for (const coin of validation.recordsToAdd) {
        await addCoin(coin);
        addedCount += 1;
      }
      for (const coin of validation.recordsToUpdate) {
        await updateCoin(coin);
        updatedCount += 1;
      }
      return { added: addedCount, updated: updatedCount, skipped: 0 };
    }

    for (const coin of validation.recordsToAdd) {
      await addCoin(coin);
      addedCount += 1;
    }
    skippedCount = validation.recordsToUpdate.length;
    return { added: addedCount, updated: 0, skipped: skippedCount };
  };

  const checkForDuplicate = (newCoin: {
    country?: string;
    year?: number;
    denomination?: string;
    mintMark?: string;
    id?: string;
  }): CoinRecord | null => {
    if (!newCoin.country || !newCoin.year) return null;
    const targetCountry = (newCoin.country || '').trim().toLowerCase();
    const targetDenom = (newCoin.denomination || '').trim().toLowerCase();
    const targetMint = (newCoin.mintMark || '').trim().toLowerCase();

    return (
      coins.find(
        (c) =>
          c.id !== newCoin.id &&
          c.year === newCoin.year &&
          (c.country || '').trim().toLowerCase() === targetCountry &&
          (c.denomination || '').trim().toLowerCase() === targetDenom &&
          (c.mintMark || '').trim().toLowerCase() === targetMint
      ) || null
    );
  };

  return (
    <CollectionContext.Provider
      value={{
        coins,
        categories,
        loading,
        storageError,
        cloudSyncError,
        clearStorageError,
        cloudSyncStatus,
        isQuotaExceeded,
        retryCloudSync,
        backupStatus,
        includeSampleCoins,
        setIncludeSampleCoins,
        hasGuestCoins,
        migrateGuestCoins,
        loadDemoCoins,
        removeSampleCoins,
        importDemoCoinAsReal,
        addCoin,
        updateCoin,
        deleteCoin,
        bulkUpdateCoins,
        bulkDeleteCoins,
        duplicateCoin,
        refreshCoinValuation,
        toggleFavorite,
        addCategory,
        exportCollection,
        restoreBackup,
        checkForDuplicate,
        selectedCoin,
        setSelectedCoin,
        skuSettings,
        updateSkuSettings,
        labelTemplate,
        updateLabelTemplate,
        generateNextSku,
        allocateBarcodeIdForCoin,
        batchApplySkus,
        splitCoinStock,
        lookupCoinBySku,
        resaleFeeSettings,
        updateResaleFeeSettings,
      }}
    >
      {children}
    </CollectionContext.Provider>
  );
};

export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (!context) {
    throw new Error('useCollection must be used within a CollectionProvider');
  }
  return context;
};
