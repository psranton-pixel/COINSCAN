import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  onAuthStateChanged,
  signInWithPopup,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  deleteUser,
  syncUserProfile,
  updateUserCurrency,
  isFirestoreQuotaError,
} from '../services/firebase';
import type { UserProfile, CurrencyCode } from '../types/coin';
import { VALID_CURRENCIES } from '../types/coin';

export const PREFERRED_CURRENCY_STORAGE_KEY = 'coinscan_preferred_currency';
export const CURRENCY_CONFIRMED_STORAGE_KEY = 'coinscan_currency_confirmed';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  currency: CurrencyCode;
  needsCurrencySetup: boolean;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
  confirmFirstRunCurrency: (currency: CurrencyCode) => Promise<void>;
  dismissCurrencySetup: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readSavedLocalCurrency(): CurrencyCode | null {
  try {
    const raw = localStorage.getItem(PREFERRED_CURRENCY_STORAGE_KEY);
    if (raw && VALID_CURRENCIES.includes(raw as CurrencyCode)) {
      return raw as CurrencyCode;
    }
  } catch {
    // Ignore storage read failure
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [currency, setCurrencyState] = useState<CurrencyCode>(() => readSavedLocalCurrency() || 'USD');
  const [needsCurrencySetup, setNeedsCurrencySetup] = useState<boolean>(() => {
    try {
      const confirmed = localStorage.getItem(CURRENCY_CONFIRMED_STORAGE_KEY);
      const saved = readSavedLocalCurrency();
      return !confirmed && !saved;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const localSaved = readSavedLocalCurrency();
          const hasConfirmedLocal = localStorage.getItem(CURRENCY_CONFIRMED_STORAGE_KEY) === '1';
          const userProf = await syncUserProfile(currentUser, localSaved || currency);
          setProfile(userProf);

          // Never silently overwrite an existing explicit user preference on this device
          if (!hasConfirmedLocal && !localSaved && userProf?.preferredCurrency) {
            setCurrencyState(userProf.preferredCurrency);
            try {
              localStorage.setItem(PREFERRED_CURRENCY_STORAGE_KEY, userProf.preferredCurrency);
              localStorage.setItem(CURRENCY_CONFIRMED_STORAGE_KEY, '1');
              setNeedsCurrencySetup(false);
            } catch {
              // Ignore
            }
          }
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            console.warn('Profile cloud sync paused due to daily Firestore quota; using local session profile.');
          } else {
            console.warn('Profile sync warning:', err);
          }
          const now = new Date().toISOString();
          setProfile({
            id: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'Coin Collector',
            preferredCurrency: readSavedLocalCurrency() || currency,
            createdAt: now,
            updatedAt: now,
          });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const persistLocalCurrency = (newCurrency: CurrencyCode) => {
    try {
      localStorage.setItem(PREFERRED_CURRENCY_STORAGE_KEY, newCurrency);
      localStorage.setItem(CURRENCY_CONFIRMED_STORAGE_KEY, '1');
    } catch {
      // Ignore storage error
    }
  };

  const setCurrency = async (newCurrency: CurrencyCode) => {
    setCurrencyState(newCurrency);
    persistLocalCurrency(newCurrency);
    setNeedsCurrencySetup(false);
    if (user) {
      await updateUserCurrency(user.uid, newCurrency);
      setProfile((prev) => (prev ? { ...prev, preferredCurrency: newCurrency } : null));
    }
  };

  const confirmFirstRunCurrency = async (chosenCurrency: CurrencyCode) => {
    await setCurrency(chosenCurrency);
  };

  const dismissCurrencySetup = () => {
    persistLocalCurrency(currency);
    setNeedsCurrencySetup(false);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const deleteAccount = async () => {
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        currency,
        needsCurrencySetup,
        setCurrency,
        confirmFirstRunCurrency,
        dismissCurrencySetup,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        logout,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
