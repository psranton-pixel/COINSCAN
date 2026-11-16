import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  deleteUser,
  updateProfile,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  getDocFromServer,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { CoinRecord, CollectionCategory, UserProfile, CurrencyCode } from '../types/coin';
import { ensureImageUnderSizeLimit } from '../utils/imageProcessor';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/* CRITICAL: Must use firestoreDatabaseId from firebase-applet-config.json; persistent cache + forced long polling prevent mobile 5G / Safari stream drops and avoid re-reading unchanged docs */
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  try {
    dbInstance = initializeFirestore(
      app,
      { experimentalForceLongPolling: true },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}
export const db = dbInstance;

export const FIRESTORE_QUOTA_CONSOLE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
export const FIREBASE_AUTH_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;
export const FIREBASE_AUTH_SETTINGS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

const QUOTA_COOLDOWN_STORAGE_KEY = 'coinscan_firestore_quota_until';
const PROFILE_CACHE_PREFIX = 'coinscan_user_profile_';

function getNextFirestoreQuotaResetMs(): number {
  const now = new Date();
  // Daily Firestore free-tier quotas reset at midnight Pacific time (UTC-8 / UTC-7)
  // Compute next 08:05 UTC (or +6 hours minimum fallback) as a safe cooldown bound
  const nextUtcReset = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 8 ? 1 : 0),
    8,
    5,
    0
  );
  const sixHoursMs = Date.now() + 6 * 60 * 60 * 1000;
  return Math.min(nextUtcReset, sixHoursMs);
}

export function isFirestoreQuotaError(error: unknown): boolean {
  const obj = error as { code?: string; message?: string; isQuotaExceeded?: boolean } | undefined;
  if (obj?.isQuotaExceeded) return true;
  const code = typeof obj?.code === 'string' ? obj.code.toLowerCase() : '';
  const msg = typeof obj?.message === 'string' ? obj.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily read units')
  );
}

export function markFirestoreQuotaExceeded(): void {
  try {
    const until = getNextFirestoreQuotaResetMs();
    localStorage.setItem(QUOTA_COOLDOWN_STORAGE_KEY, String(until));
  } catch {
    // Ignore storage error
  }
}

export function clearFirestoreQuotaCooldown(): void {
  try {
    localStorage.removeItem(QUOTA_COOLDOWN_STORAGE_KEY);
  } catch {
    // Ignore storage error
  }
}

export function isFirestoreQuotaCooldownActive(): boolean {
  try {
    const raw = localStorage.getItem(QUOTA_COOLDOWN_STORAGE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() >= until) {
      localStorage.removeItem(QUOTA_COOLDOWN_STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function readCachedUserProfile(uid: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id === uid) return parsed as UserProfile;
  } catch {
    // Ignore
  }
  return null;
}

function writeCachedUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(`${PROFILE_CACHE_PREFIX}${profile.id}`, JSON.stringify(profile));
  } catch {
    // Ignore
  }
}

function utf8ByteLength(str: string): number {
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    return str.length * 2;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  if (isFirestoreQuotaError(error)) {
    markFirestoreQuotaExceeded();
    const quotaErr = Object.assign(
      new Error('Firestore daily free-tier quota exceeded. Working from local device cache until reset.'),
      { code: 'resource-exhausted', isQuotaExceeded: true, operationType, path }
    );
    console.warn(`Firestore daily quota exceeded (${operationType} ${path || ''}). Using local device cache.`);
    throw quotaErr;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  if (isFirestoreQuotaCooldownActive()) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markFirestoreQuotaExceeded();
      return false;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network is warming up.');
    }
    return false;
  }
}

// User Profile Database Services
export async function syncUserProfile(
  firebaseUser: FirebaseUser,
  defaultCurrency: CurrencyCode = 'USD',
  forceRefresh: boolean = false
): Promise<UserProfile> {
  const cached = readCachedUserProfile(firebaseUser.uid);
  const now = new Date().toISOString();
  const safeEmail = (firebaseUser.email || '').trim().slice(0, 150);
  const safeDisplayName = (
    firebaseUser.displayName ||
    (safeEmail ? safeEmail.split('@')[0] : '') ||
    'Coin Collector'
  )
    .trim()
    .slice(0, 100);
  const safeCurrency: CurrencyCode = (['USD', 'AUD', 'GBP', 'EUR', 'CAD'] as CurrencyCode[]).includes(defaultCurrency)
    ? defaultCurrency
    : 'USD';

  const fallbackProfile: UserProfile = cached || {
    id: firebaseUser.uid.slice(0, 128),
    email: safeEmail,
    displayName: safeDisplayName,
    preferredCurrency: safeCurrency,
    createdAt: now,
    updatedAt: now,
  };

  // Avoid redundant server profile reads on every page refresh when cached locally or during quota cooldown
  if (!forceRefresh && (cached || isFirestoreQuotaCooldownActive())) {
    if (!cached) writeCachedUserProfile(fallbackProfile);
    return fallbackProfile;
  }

  const userRef = doc(db, 'users', firebaseUser.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const newProfile: UserProfile = {
        id: firebaseUser.uid.slice(0, 128),
        email: safeEmail,
        displayName: safeDisplayName,
        preferredCurrency: safeCurrency,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(userRef, newProfile);
      writeCachedUserProfile(newProfile);
      return newProfile;
    } else {
      const existing = snap.data() as UserProfile;
      writeCachedUserProfile(existing);
      return existing;
    }
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded();
      writeCachedUserProfile(fallbackProfile);
      return fallbackProfile;
    }
    handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
  }
}

export async function updateUserCurrency(userId: string, currency: CurrencyCode): Promise<void> {
  const cached = readCachedUserProfile(userId);
  const now = new Date().toISOString();
  if (cached) {
    writeCachedUserProfile({ ...cached, preferredCurrency: currency, updatedAt: now });
  }

  if (isFirestoreQuotaCooldownActive()) return;

  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      preferredCurrency: currency,
      updatedAt: now,
    });
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      markFirestoreQuotaExceeded();
      return;
    }
    if (err?.code === 'not-found' && auth.currentUser) {
      try {
        await setDoc(userRef, {
          id: userId,
          email: auth.currentUser.email || '',
          displayName: auth.currentUser.displayName || 'Coin Collector',
          preferredCurrency: currency,
          createdAt: now,
          updatedAt: now,
        });
        return;
      } catch (createErr) {
        if (isFirestoreQuotaError(createErr)) {
          markFirestoreQuotaExceeded();
          return;
        }
        handleFirestoreError(createErr, OperationType.CREATE, `users/${userId}`);
      }
    }
    handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
  }
}

const NUMERIC_COIN_KEYS = new Set([
  'year',
  'weightGrams',
  'diameterMm',
  'estimatedValue',
  'lowValue',
  'highValue',
  'bullionMeltValue',
  'valuationConfidence',
  'identificationConfidence',
  'gradingConfidence',
  'confidenceScore',
  'purchasePrice',
  'quantity',
  'askingPrice',
  'soldPrice',
  'soldQuantity',
  'sellingFees',
  'sellerPaidPostage',
  'otherDirectCosts',
  'realizedNetProfit',
  'fineness',
  'preciousMetalGrams',
  'evidenceCount',
]);

const BOOLEAN_COIN_KEYS = new Set([
  'isFavorite',
  'isSample',
  'isProvisionalValuation',
]);

/**
 * Deep sanitization of coin payloads for Firestore:
 * - Strips undefined, null, and NaN properties
 * - Coerces numeric and boolean schema fields so Firestore rules (isValidCoin) never fail on stringified numbers
 * - Bounds strings and numbers to ensure compliance with Firestore rules
 * - Enforces a strict UTF-8 byte ceiling (~140 KB per doc)
 */
export function sanitizeCoinForFirestore(coin: Record<string, any>, isRootCoin: boolean = true): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, val] of Object.entries(coin)) {
    if (val === undefined || val === null) continue;
    if (key === 'originalObverseImage' || key === 'originalReverseImage') {
      // Keep raw full-resolution originals on-device in IndexedDB & full JSON backups instead of bloating Firestore docs
      continue;
    }

    if (NUMERIC_COIN_KEYS.has(key)) {
      if (typeof val === 'string' && val.trim() === '') continue;
      const num = typeof val === 'number' ? val : Number(String(val).replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(num)) continue;

      if (key === 'year') sanitized[key] = Math.round(num);
      else if (key === 'quantity') sanitized[key] = Math.max(1, Math.round(num));
      else if (key === 'soldQuantity' || key === 'evidenceCount') sanitized[key] = Math.max(0, Math.round(num));
      else if (
        key === 'valuationConfidence' ||
        key === 'identificationConfidence' ||
        key === 'gradingConfidence' ||
        key === 'confidenceScore'
      ) {
        sanitized[key] = Math.min(100, Math.max(0, Math.round(num)));
      } else if (key === 'fineness') {
        sanitized[key] = Math.round(num * 10000) / 10000;
      } else if (key === 'preciousMetalGrams') {
        sanitized[key] = Math.round(num * 1000) / 1000;
      } else {
        sanitized[key] = Math.round(num * 100) / 100;
      }
      continue;
    }

    if (BOOLEAN_COIN_KEYS.has(key)) {
      sanitized[key] = Boolean(val);
      continue;
    }

    if (typeof val === 'number') {
      if (!Number.isFinite(val)) continue;
      sanitized[key] = Math.round(val * 10000) / 10000;
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (key === 'id' || key === 'owner_user_id') sanitized[key] = trimmed.slice(0, 128);
      else if (key === 'title') sanitized[key] = (trimmed || 'Untitled Coin').slice(0, 280);
      else if (key === 'country') sanitized[key] = (trimmed || 'Unknown').slice(0, 110);
      else if (key === 'denomination') sanitized[key] = trimmed.slice(0, 110);
      else if (key === 'series') sanitized[key] = trimmed.slice(0, 180);
      else if (key === 'metalComposition') sanitized[key] = trimmed.slice(0, 180);
      else if (key === 'rarity') sanitized[key] = trimmed.slice(0, 90);
      else if (key === 'estimatedGrade' || key === 'estimatedGradeRange') sanitized[key] = trimmed.slice(0, 90);
      else if (key === 'mintMark') sanitized[key] = trimmed.slice(0, 50);
      else if (key === 'faceValue') sanitized[key] = trimmed.slice(0, 90);
      else if (key === 'currency' || key === 'purchaseCurrency' || key === 'soldCurrency') sanitized[key] = trimmed.slice(0, 20);
      else if (key === 'category') sanitized[key] = trimmed.slice(0, 110);
      else if (key === 'sku' || key === 'barcodeId') sanitized[key] = trimmed.slice(0, 100);
      else if (key === 'storageLocation') sanitized[key] = trimmed.slice(0, 100);
      else if (key === 'listingPlatform') sanitized[key] = trimmed.slice(0, 100);
      else if (key === 'listingUrl') sanitized[key] = trimmed.slice(0, 500);
      else if (key === 'listingStatus') sanitized[key] = trimmed.slice(0, 50);
      else if (key === 'status') sanitized[key] = trimmed.slice(0, 45);
      else if (key === 'costBasisType') sanitized[key] = trimmed.slice(0, 30);
      else if (key === 'bullionType') sanitized[key] = trimmed.slice(0, 50);
      else if (key === 'metalCategory') sanitized[key] = trimmed.slice(0, 50);
      else if (key === 'valuationMethodology') sanitized[key] = trimmed.slice(0, 50);
      else if (key === 'evidenceQuality') sanitized[key] = trimmed.slice(0, 50);
      else if (key === 'soldDate' || key === 'valuationDate' || key === 'lastValuationUpdate' || key === 'purchaseDate') {
        sanitized[key] = trimmed.slice(0, 55);
      } else if (
        key === 'personalNotes' ||
        key === 'conditionDetails' ||
        key === 'historicalSignificance' ||
        key === 'valuationRationale' ||
        key === 'gradingProvisionalNotice'
      ) {
        sanitized[key] = trimmed.slice(0, 1000);
      } else if (key === 'obverseImage' || key === 'reverseImage') {
        if (utf8ByteLength(trimmed) <= 65000) {
          sanitized[key] = trimmed;
        }
      } else {
        sanitized[key] = trimmed;
      }
    } else if (typeof val === 'boolean') {
      sanitized[key] = val;
    } else if (Array.isArray(val)) {
      const bounded = key === 'valuationHistory' && val.length > 10 ? val.slice(-10) : val;
      sanitized[key] = bounded.map((item) =>
        typeof item === 'object' && item !== null ? sanitizeCoinForFirestore(item, false) : item
      );
    } else if (typeof val === 'object') {
      sanitized[key] = sanitizeCoinForFirestore(val, false);
    }
  }

  if (isRootCoin) {
    if (!sanitized.title || typeof sanitized.title !== 'string') {
      sanitized.title = 'Untitled Coin';
    }
    if (!sanitized.country || typeof sanitized.country !== 'string') {
      sanitized.country = 'Unknown';
    }
    if (!sanitized.createdAt || typeof sanitized.createdAt !== 'string') {
      sanitized.createdAt = new Date().toISOString();
    }
    if (!sanitized.updatedAt || typeof sanitized.updatedAt !== 'string') {
      sanitized.updatedAt = new Date().toISOString();
    }
  }

  // Strict UTF-8 byte ceiling (~140 KB per doc) keeps collection snapshots fast and avoids quota/stream stalls
  const MAX_FIRESTORE_SAFE_UTF8_BYTES = 140000;
  try {
    let serializedBytes = utf8ByteLength(JSON.stringify(sanitized));
    if (serializedBytes > MAX_FIRESTORE_SAFE_UTF8_BYTES && sanitized.reverseImage) {
      delete sanitized.reverseImage;
      serializedBytes = utf8ByteLength(JSON.stringify(sanitized));
    }
    if (serializedBytes > MAX_FIRESTORE_SAFE_UTF8_BYTES && sanitized.obverseImage) {
      delete sanitized.obverseImage;
      serializedBytes = utf8ByteLength(JSON.stringify(sanitized));
    }
    if (serializedBytes > MAX_FIRESTORE_SAFE_UTF8_BYTES && Array.isArray(sanitized.valuationHistory) && sanitized.valuationHistory.length > 3) {
      sanitized.valuationHistory = sanitized.valuationHistory.slice(-3);
    }
  } catch {
    // Fallback
  }

  return sanitized;
}

/**
 * Downscales coin cutout images to lightweight cloud previews (~35-42 KB each) before Firestore upload
 * and omits raw camera originals (which remain preserved locally in IndexedDB & full JSON backups).
 */
async function compactCoinImagesForFirestore<T extends Record<string, any>>(coin: T): Promise<T> {
  const copy: Record<string, any> = { ...coin };
  delete copy.originalObverseImage;
  delete copy.originalReverseImage;

  if (typeof copy.obverseImage === 'string' && utf8ByteLength(copy.obverseImage) > 42000) {
    copy.obverseImage = await ensureImageUnderSizeLimit(copy.obverseImage, 42000);
  }
  if (typeof copy.reverseImage === 'string' && utf8ByteLength(copy.reverseImage) > 42000) {
    copy.reverseImage = await ensureImageUnderSizeLimit(copy.reverseImage, 42000);
  }
  return copy as T;
}

function sanitizeFirestoreDocId(rawId: string): string {
  const cleaned = (rawId || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
  return cleaned || `coin_${Date.now()}`;
}

function createQuotaCooldownError(operationType: OperationType, path: string): Error {
  return Object.assign(
    new Error('Firestore daily free-tier quota exceeded. Working from local device cache until reset.'),
    { code: 'resource-exhausted', isQuotaExceeded: true, operationType, path }
  );
}

// Coin CRUD operations
export async function createCoinRecord(userId: string, coin: CoinRecord): Promise<void> {
  const safeId = sanitizeFirestoreDocId(coin.id);
  const path = `users/${userId}/coins/${safeId}`;
  if (isFirestoreQuotaCooldownActive()) {
    throw createQuotaCooldownError(OperationType.CREATE, path);
  }

  const coinRef = doc(db, 'users', userId, 'coins', safeId);
  const compacted = await compactCoinImagesForFirestore({ ...coin, id: safeId });
  const sanitized = sanitizeCoinForFirestore({
    ...compacted,
    id: safeId,
    owner_user_id: userId,
    createdAt: coin.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, true);

  try {
    await setDoc(coinRef, sanitized);
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
    // Only on permission-denied (possible update with mismatched createdAt), align with existing doc
    const code = typeof err?.code === 'string' ? err.code.toLowerCase() : '';
    if (code === 'permission-denied') {
      try {
        const existingSnap = await getDoc(coinRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data();
          const aligned = sanitizeCoinForFirestore({
            ...existingData,
            ...sanitized,
            id: safeId,
            owner_user_id: userId,
            createdAt: existingData.createdAt || sanitized.createdAt,
            updatedAt: new Date().toISOString(),
          }, true);
          await setDoc(coinRef, aligned);
          return;
        }
      } catch (retryErr) {
        if (isFirestoreQuotaError(retryErr)) {
          handleFirestoreError(retryErr, OperationType.CREATE, path);
        }
      }
    }
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateCoinRecord(userId: string, coin: Partial<CoinRecord> & { id: string }): Promise<void> {
  const safeId = sanitizeFirestoreDocId(coin.id);
  const path = `users/${userId}/coins/${safeId}`;
  if (isFirestoreQuotaCooldownActive()) {
    throw createQuotaCooldownError(OperationType.UPDATE, path);
  }

  const coinRef = doc(db, 'users', userId, 'coins', safeId);
  const compacted = await compactCoinImagesForFirestore({ ...coin, id: safeId });

  try {
    // Direct setDoc merge with zero read when required identity/metadata fields are already provided
    if (compacted.title && compacted.country && compacted.createdAt) {
      const sanitized = sanitizeCoinForFirestore({
        ...compacted,
        id: safeId,
        owner_user_id: userId,
        updatedAt: new Date().toISOString(),
      }, true);
      await setDoc(coinRef, sanitized, { merge: true });
      return;
    }

    const existingSnap = await getDoc(coinRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};
    const sanitized = sanitizeCoinForFirestore({
      ...existingData,
      ...compacted,
      id: safeId,
      owner_user_id: userId,
      createdAt: existingData.createdAt || coin.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, true);
    await setDoc(coinRef, sanitized, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCoinRecord(userId: string, coinId: string): Promise<void> {
  const safeId = sanitizeFirestoreDocId(coinId);
  const path = `users/${userId}/coins/${safeId}`;
  if (isFirestoreQuotaCooldownActive()) {
    throw createQuotaCooldownError(OperationType.DELETE, path);
  }

  const coinRef = doc(db, 'users', userId, 'coins', safeId);
  try {
    await deleteDoc(coinRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveMultipleCoins(userId: string, coins: CoinRecord[]): Promise<void> {
  if (isFirestoreQuotaCooldownActive()) return;
  const BATCH_SIZE = 3;
  let quotaHit = false;
  for (let i = 0; i < coins.length; i += BATCH_SIZE) {
    if (quotaHit || isFirestoreQuotaCooldownActive()) break;
    const slice = coins.slice(i, i + BATCH_SIZE);
    await Promise.all(
      slice.map(async (coin) => {
        if (quotaHit) return;
        try {
          await createCoinRecord(userId, coin);
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            quotaHit = true;
          } else {
            console.warn(`Non-fatal warning syncing coin ${coin.id} during batch upload:`, err);
          }
        }
      })
    );
  }
}

export function subscribeToCoins(
  userId: string,
  onData: (coins: CoinRecord[], meta?: { fromCache: boolean }) => void,
  onError?: (err: Error, rawError?: unknown) => void
): Unsubscribe {
  const coinsRef = collection(db, 'users', userId, 'coins');
  return onSnapshot(
    coinsRef,
    (snapshot) => {
      const coins: CoinRecord[] = [];
      snapshot.forEach((docSnap) => {
        coins.push(docSnap.data() as CoinRecord);
      });
      coins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(coins, { fromCache: Boolean(snapshot.metadata?.fromCache) });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `users/${userId}/coins`);
      } catch (wrappedErr: any) {
        if (onError) onError(wrappedErr, error);
      }
    }
  );
}

export async function getUserCoins(userId: string): Promise<CoinRecord[]> {
  const path = `users/${userId}/coins`;
  if (isFirestoreQuotaCooldownActive()) {
    throw createQuotaCooldownError(OperationType.GET, path);
  }
  const coinsRef = collection(db, 'users', userId, 'coins');
  try {
    const snap = await getDocs(coinsRef);
    const coins: CoinRecord[] = [];
    snap.forEach((docSnap) => {
      coins.push(docSnap.data() as CoinRecord);
    });
    coins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return coins;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createCategory(userId: string, category: CollectionCategory): Promise<void> {
  const path = `users/${userId}/categories/${category.id}`;
  if (isFirestoreQuotaCooldownActive()) {
    throw createQuotaCooldownError(OperationType.CREATE, path);
  }
  const catRef = doc(db, 'users', userId, 'categories', category.id);
  try {
    await setDoc(catRef, category);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeToCategories(
  userId: string,
  onData: (categories: CollectionCategory[]) => void,
  onError?: (err: Error, rawError?: unknown) => void
): Unsubscribe {
  const catRef = collection(db, 'users', userId, 'categories');
  return onSnapshot(
    catRef,
    (snapshot) => {
      const categories: CollectionCategory[] = [];
      snapshot.forEach((docSnap) => {
        categories.push(docSnap.data() as CollectionCategory);
      });
      onData(categories);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `users/${userId}/categories`);
      } catch (wrappedErr: any) {
        if (onError) onError(wrappedErr, error);
      }
    }
  );
}

export async function exportUserCollection(userId: string): Promise<string> {
  const coinsRef = collection(db, 'users', userId, 'coins');
  const catRef = collection(db, 'users', userId, 'categories');
  try {
    const coinsSnap = await getDocs(coinsRef);
    const catSnap = await getDocs(catRef);

    const coins: CoinRecord[] = [];
    coinsSnap.forEach(d => coins.push(d.data() as CoinRecord));

    const categories: CollectionCategory[] = [];
    catSnap.forEach(d => categories.push(d.data() as CollectionCategory));

    const exportData = {
      exportDate: new Date().toISOString(),
      app: 'CoinScan Pro',
      userId,
      coinCount: coins.length,
      coins,
      categories,
    };
    return JSON.stringify(exportData, null, 2);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${userId}/export`);
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  deleteUser,
  updateProfile,
  onAuthStateChanged
};
