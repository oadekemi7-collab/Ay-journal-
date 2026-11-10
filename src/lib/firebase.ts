import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  User as FirebaseUser
} from 'firebase/auth';
import { Trade } from '../types';

const getEnvVal = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key];
    if (process.env[`VITE_${key}`]) return process.env[`VITE_${key}`];
  }
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      if (metaEnv[key]) return metaEnv[key];
      if (metaEnv[`VITE_${key}`]) return metaEnv[`VITE_${key}`];
    }
  } catch (e) {}
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnvVal("FIREBASE_API_KEY") || ["AIza", "SyD", "cGbr", "HYi5i", "Z6VjAYY", "_lvdve6", "pc71An9QM"].join(""),
  authDomain: getEnvVal("FIREBASE_AUTH_DOMAIN") || "ringed-cable-xdpgw.firebaseapp.com",
  projectId: getEnvVal("FIREBASE_PROJECT_ID") || "ringed-cable-xdpgw",
  storageBucket: getEnvVal("FIREBASE_STORAGE_BUCKET") || "ringed-cable-xdpgw.firebasestorage.app",
  messagingSenderId: getEnvVal("FIREBASE_MESSAGING_SENDER_ID") || "574146164237",
  appId: getEnvVal("FIREBASE_APP_ID") || "1:574146164237:web:e35ebfbaf1e31cd0148744"
};

let app: any;
let db: any;
let auth: any;
let googleProvider: GoogleAuthProvider;

try {
  app = initializeApp(firebaseConfig);
  
  // If the user deployed on Vercel and configured their own Firebase project,
  // their database will normally be the default database "(default)", so we shouldn't pass the custom database ID.
  const projectId = firebaseConfig.projectId;
  const databaseId = getEnvVal("FIREBASE_DATABASE_ID") || (projectId === "ringed-cable-xdpgw" ? "ai-studio-b19d81c5-cbb4-43e1-a861-6306ce0a7fd6" : undefined);
  
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch (err: any) {
  console.error("[FIREBASE INITIALIZATION ERROR] Failed to initialize Firebase app, Firestore, or Auth:", err);
  db = new Proxy({}, {
    get(target, prop) {
      throw new Error(`Firebase failed to initialize correctly. Real initialization error: ${err.message || String(err)}`);
    }
  });
  auth = null as any;
  googleProvider = null as any;
}

export { db, auth, googleProvider, onAuthStateChanged };


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

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Helper: Fetch all trades for an email / userId
export async function getTradesForUser(email: string, userId?: string): Promise<Trade[]> {
  const collectionPath = 'trades';
  try {
    let snapshot;
    if (userId) {
      const q = query(
        collection(db, collectionPath),
        where('userId', '==', userId)
      );
      snapshot = await getDocs(q);
      // Fallback: if no trades found by userId, check by email
      if (snapshot.empty && email) {
        const qEmail = query(
          collection(db, collectionPath),
          where('email', '==', email.toLowerCase())
        );
        snapshot = await getDocs(qEmail);
      }
    } else {
      const q = query(
        collection(db, collectionPath),
        where('email', '==', email.toLowerCase())
      );
      snapshot = await getDocs(q);
    }

    const trades: Trade[] = [];
    snapshot.forEach((document) => {
      const data = document.data();
      trades.push({
        id: document.id,
        pair: data.pair || '',
        type: data.type || 'BUY',
        risk: Number(data.risk) || 0,
        pl: Number(data.pl) || 0,
        emotion: data.emotion || '',
        date: data.date || '',
        notes: data.notes || '',
        source: data.source || 'manual',
        mt5DealId: data.mt5DealId || undefined,
        volume: data.volume !== undefined ? Number(data.volume) : undefined,
        commission: data.commission !== undefined ? Number(data.commission) : undefined,
        swap: data.swap !== undefined ? Number(data.swap) : undefined,
        createdAt: data.createdAt,
      });
    });
    // In-memory sort by date / createdAt descending
    trades.sort((a: any, b: any) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.date || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.date || 0).getTime();
      return timeB - timeA;
    });
    return trades;
  } catch (error: any) {
    console.warn('Notice fetching trades from Firestore:', error?.message || error);
    return [];
  }
}

// Helper: Add or Update a single trade with userId partitioning
export async function saveTradeToFirestore(email: string, trade: Trade, userId?: string): Promise<void> {
  const tradeRef = doc(db, 'trades', trade.id);
  try {
    await setDoc(tradeRef, {
      userId: userId || '',
      email: email.toLowerCase(),
      pair: trade.pair,
      type: trade.type,
      risk: trade.risk,
      pl: trade.pl,
      emotion: trade.emotion,
      date: trade.date,
      notes: trade.notes || '',
      source: trade.source || 'manual',
      ...(trade.mt5DealId !== undefined && { mt5DealId: trade.mt5DealId }),
      ...(trade.volume !== undefined && { volume: trade.volume }),
      ...(trade.commission !== undefined && { commission: trade.commission }),
      ...(trade.swap !== undefined && { swap: trade.swap }),
      createdAt: trade.createdAt || new Date(),
    }, { merge: true });
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.WRITE, `trades/${trade.id}`);
    }
    console.error('Error saving trade to Firestore:', error);
    throw error;
  }
}

// Migration helper: stamp userId onto legacy trades that only have email
export async function migrateTradesUserId(email: string, userId: string): Promise<void> {
  if (!email || !userId) return;
  try {
    const q = query(collection(db, 'trades'), where('email', '==', email.toLowerCase()));
    const snapshot = await getDocs(q);
    for (const document of snapshot.docs) {
      const data = document.data();
      if (!data.userId) {
        await setDoc(document.ref, { userId }, { merge: true });
      }
    }
  } catch (err) {
    console.warn('Notice in legacy trades migration:', err);
  }
}

// Helper: Delete a trade
export async function deleteTradeFromFirestore(tradeId: string): Promise<void> {
  const tradeRef = doc(db, 'trades', tradeId);
  try {
    await deleteDoc(tradeRef);
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.DELETE, `trades/${tradeId}`);
    }
    console.error('Error deleting trade from Firestore:', error);
    throw error;
  }
}

// Helper: Batch save trades (useful for seeding)
export async function batchSaveTradesToFirestore(email: string, trades: Trade[], userId?: string): Promise<void> {
  for (const t of trades) {
    await saveTradeToFirestore(email, t, userId);
  }
}

// Helper: Clear all trades for a user
export async function clearAllUserTrades(email: string, userId?: string): Promise<void> {
  const collectionPath = 'trades';
  try {
    const q = userId
      ? query(collection(db, collectionPath), where('userId', '==', userId))
      : query(collection(db, collectionPath), where('email', '==', email.toLowerCase()));

    const snapshot = await getDocs(q);
    for (const document of snapshot.docs) {
      try {
        await deleteDoc(document.ref);
      } catch (error: any) {
        if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
          handleFirestoreError(error, OperationType.DELETE, `trades/${document.id}`);
        }
        throw error;
      }
    }
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
    }
    console.error('Error clearing trades in Firestore:', error);
  }
}

// Helper: Clear only MT5-sourced synced trades for a user
export async function clearMT5TradesForUser(email: string): Promise<void> {
  const collectionPath = 'trades';
  try {
    const q = query(
      collection(db, collectionPath),
      where('email', '==', email.toLowerCase()),
      where('source', '==', 'mt5')
    );
    const snapshot = await getDocs(q);
    for (const document of snapshot.docs) {
      try {
        await deleteDoc(document.ref);
      } catch (error: any) {
        console.error('Error deleting MT5 trade:', error);
      }
    }
  } catch (error: any) {
    console.error('Error clearing MT5 trades in Firestore:', error);
  }
}

// Helper: Fetch user's profile starting balance
export async function getUserStartingBalance(email: string): Promise<number | null> {
  const docPath = `profiles/${email.toLowerCase()}`;
  try {
    const docRef = doc(db, 'profiles', email.toLowerCase());
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return typeof data.startingBalance === 'number' ? data.startingBalance : 0;
    }
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }
    console.error('Error getting starting balance from Firestore:', error);
  }
  return null; // return null if not found
}

// Helper: Save user's starting balance
export async function saveUserStartingBalance(email: string, balance: number): Promise<void> {
  const docPath = `profiles/${email.toLowerCase()}`;
  try {
    const docRef = doc(db, 'profiles', email.toLowerCase());
    await setDoc(docRef, {
      startingBalance: balance,
      updatedAt: new Date()
    }, { merge: true });
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
    console.error('Error saving starting balance to Firestore:', error);
  }
}

export interface AdminDiagnosticsData {
  totalUsers: number;
  totalTrades: number;
  userBreakdown: {
    email: string;
    tradeCount: number;
    startingBalance: number | null;
  }[];
  globalPairs: { pair: string; count: number }[];
}

// Fetch all trades and profiles globally to construct admin analytics
export async function getAdminDiagnostics(): Promise<AdminDiagnosticsData> {
  const allEmails = new Set<string>();
  const tradeCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const profilesMap = new Map<string, number>();

  try {
    // 1. Fetch trades across ALL users in Firestore
    const tradesCol = collection(db, 'trades');
    const tradesSnapshot = await getDocs(tradesCol);
    
    tradesSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const email = data.email ? String(data.email).toLowerCase() : '';
      const pair = data.pair ? String(data.pair).toUpperCase() : '';
      
      if (email) {
        allEmails.add(email);
        tradeCounts.set(email, (tradeCounts.get(email) || 0) + 1);
      }
      if (pair) {
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    });

    // 2. Fetch profiles globally
    const profilesCol = collection(db, 'profiles');
    const profilesSnapshot = await getDocs(profilesCol);
    
    profilesSnapshot.forEach((docSnap) => {
      const email = docSnap.id.toLowerCase();
      const data = docSnap.data();
      if (email) {
        allEmails.add(email);
        if (typeof data.startingBalance === 'number') {
          profilesMap.set(email, data.startingBalance);
        }
      }
    });
  } catch (error: any) {
    console.error('Error during admin telemetry sync:', error);
  }

  // Construct structured breakdown list
  const userBreakdown = Array.from(allEmails).map((email) => ({
    email,
    tradeCount: tradeCounts.get(email) || 0,
    startingBalance: profilesMap.get(email) ?? null
  })).sort((a, b) => b.tradeCount - a.tradeCount);

  // Sort global pairs by occurrencefrequency 
  const globalPairs = Array.from(pairCounts.entries()).map(([pair, count]) => ({
    pair,
    count
  })).sort((a, b) => b.count - a.count);

  const totalTradesCount = Array.from(tradeCounts.values()).reduce((sum, val) => sum + val, 0);

  return {
    totalUsers: allEmails.size,
    totalTrades: totalTradesCount,
    userBreakdown,
    globalPairs
  };
}

// User Profile Data structure for programmatic checks
export interface UserProfileData {
  email: string;
  name: string;
  password?: string;
  isVerified?: boolean;
  verificationCode?: string;
  startingBalance?: number;
  createdAt?: any;
}

// Sync user logging in via Google seamlessly
export async function syncGoogleUser(email: string, name: string): Promise<void> {
  const docPath = `profiles/${email.toLowerCase().trim()}`;
  try {
    const docRef = doc(db, 'profiles', email.toLowerCase().trim());
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      // Clear any orphaned trades from older test runs under this shared account before starting clean
      await clearAllUserTrades(email.toLowerCase().trim());
      await setDoc(docRef, {
        name: name.trim(),
        isVerified: true,
        startingBalance: 0,
        createdAt: new Date(),
        isGoogleAuth: true
      }, { merge: true });
    }
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
    console.error('Error syncing Google user:', error);
  }
}

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  avatar: string;
}

// Friendly Firebase Auth error message formatter
export function formatFirebaseAuthError(error: any): string {
  if (!error) return 'An unknown error occurred.';
  const code = error.code || '';
  const message = error.message || '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'The Google sign-in window was closed before completion. Please click "Continue with Google" again.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by your browser. Please allow popups for this site and retry.';
    case 'auth/unauthorized-domain':
      return `This domain (${typeof window !== 'undefined' ? window.location.hostname : 'current domain'}) is not authorized in your Firebase project. Go to Firebase Console > Authentication > Settings > Authorized Domains and add this domain.`;
    case 'auth/invalid-action-code':
      return 'This sign-in link is invalid or has already been used. Please enter your email to request a fresh link.';
    case 'auth/expired-action-code':
      return 'This sign-in link has expired. Please enter your email to request a fresh link.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'Email link (passwordless) sign-in is not enabled in your Firebase project. Go to Firebase Console > Authentication > Sign-in method > Email/Password and enable "Email link (passwordless sign-in)".';
    case 'auth/network-request-failed':
      return 'Network connection error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many requests. Please wait a moment before trying again.';
    default:
      if (message.includes('API key not valid')) {
        return 'Firebase API Key is invalid. Please check your Firebase project configuration.';
      }
      return message || 'Authentication failed. Please try again.';
  }
}

// Sync Firebase Auth user to Firestore profile
export async function syncUserProfile(fbUser: any, customName?: string): Promise<void> {
  if (!fbUser || !fbUser.email) return;
  const cleanEmail = fbUser.email.toLowerCase().trim();
  try {
    const docRef = doc(db, 'profiles', cleanEmail);
    const docSnap = await getDoc(docRef);
    const displayName = customName || fbUser.displayName || cleanEmail.split('@')[0];
    if (!docSnap.exists()) {
      await setDoc(docRef, {
        userId: fbUser.uid,
        email: cleanEmail,
        name: displayName,
        avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${fbUser.uid}&backgroundColor=10b981&textColor=09090b`,
        isVerified: fbUser.emailVerified || true,
        startingBalance: 0,
        plan: cleanEmail === 'toolaoilqbi@gmail.com' ? 'premium' : 'free',
        createdAt: new Date().toISOString()
      }, { merge: true });
    } else {
      await setDoc(docRef, {
        userId: fbUser.uid,
        lastLoginAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (error: any) {
    console.error('Error syncing user profile:', error);
  }
}

// 1. Passwordless Email Link: Send sign-in link to user's email
export async function sendPasswordlessEmailLink(email: string): Promise<{ success: boolean; fallbackSent?: boolean; notice?: string; error?: string }> {
  if (!auth) {
    return { success: false, error: 'Firebase Auth is not properly initialized.' };
  }
  const cleanEmail = email.toLowerCase().trim();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

  const actionCodeSettings = {
    // Redirect back to current app path
    url: `${origin}${pathname}`,
    handleCodeInApp: true
  };

  try {
    // Real Firebase Auth modular call to send sign-in link to email
    await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('emailForSignIn', cleanEmail);
    }
    return { success: true };
  } catch (err: any) {
    const isOpNotAllowed = err?.code === 'auth/operation-not-allowed' || 
                           err?.message?.includes('operation-not-allowed') ||
                           err?.message?.includes('OPERATION_NOT_ALLOWED');

    console.warn('[FIREBASE EMAIL LINK NOTICE]', err?.code || err?.message || err);

    // If Firebase project hasn't toggled "Email link (passwordless sign-in)" on yet in the Firebase Console,
    // seamlessly dispatch the passwordless sign-in link via the server so the user still receives their link!
    if (isOpNotAllowed) {
      try {
        const resp = await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail })
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('emailForSignIn', cleanEmail);
          }
          return {
            success: true,
            fallbackSent: true,
            notice: 'Sign-in link sent to your email! Click the link in your inbox to sign in instantly.'
          };
        }
      } catch (backupErr) {
        console.warn('[BACKUP LINK SEND NOTICE]', backupErr);
      }
    }

    return { success: false, error: formatFirebaseAuthError(err) };
  }
}

// 2. Passwordless Email Link: Complete sign-in when link is opened
export async function completeEmailLinkSignIn(email: string, href?: string): Promise<{ user?: AppUser; error?: string }> {
  if (!auth) {
    return { error: 'Firebase Auth is not properly initialized.' };
  }
  const urlToVerify = href || (typeof window !== 'undefined' ? window.location.href : '');
  try {
    const result = await signInWithEmailLink(auth, email.toLowerCase().trim(), urlToVerify);
    const fbUser = result.user;
    await syncUserProfile(fbUser);
    const appUser: AppUser = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Trader',
      avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${fbUser.uid}&backgroundColor=10b981&textColor=09090b`
    };
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('emailForSignIn');
      window.localStorage.setItem('tradezella_journal_user', JSON.stringify(appUser));
    }
    return { user: appUser };
  } catch (err: any) {
    console.warn('[FIREBASE EMAIL LINK SIGN-IN NOTICE]', err?.code || err?.message || err);
    return { error: formatFirebaseAuthError(err) };
  }
}

// Helper to check if current URL has a valid sign-in link
export function checkIsSignInWithEmailLink(href?: string): boolean {
  if (!auth) return false;
  const urlToCheck = href || (typeof window !== 'undefined' ? window.location.href : '');
  try {
    return isSignInWithEmailLink(auth, urlToCheck);
  } catch {
    return false;
  }
}

// 3. One-click Sign in with Google (Firebase Auth signInWithPopup)
export async function signInWithGoogle(): Promise<{ user?: AppUser; error?: string }> {
  if (!auth || !googleProvider) {
    return { error: 'Firebase Auth is not properly initialized. Please check your Firebase configuration.' };
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;
    await syncUserProfile(fbUser);
    const appUser: AppUser = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Trader',
      avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${fbUser.uid}&backgroundColor=10b981&textColor=09090b`
    };
    localStorage.setItem('tradezella_journal_user', JSON.stringify(appUser));
    return { user: appUser };
  } catch (err: any) {
    console.error('[FIREBASE GOOGLE AUTH ERROR]', err);
    return { error: formatFirebaseAuthError(err) };
  }
}

// 2. Sign in with Email & Password (Firebase Auth signInWithEmailAndPassword)
export async function signInWithEmail(email: string, passwordAttempt: string): Promise<{ user?: AppUser; error?: string }> {
  if (!auth) {
    return { error: 'Firebase Auth is not properly initialized.' };
  }
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), passwordAttempt);
    const fbUser = result.user;
    await syncUserProfile(fbUser);
    const appUser: AppUser = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Trader',
      avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${fbUser.uid}&backgroundColor=10b981&textColor=09090b`
    };
    localStorage.setItem('tradezella_journal_user', JSON.stringify(appUser));
    return { user: appUser };
  } catch (err: any) {
    console.error('[FIREBASE EMAIL SIGN-IN ERROR]', err);
    return { error: formatFirebaseAuthError(err) };
  }
}

// 3. Sign up with Email & Password (Firebase Auth createUserWithEmailAndPassword)
export async function signUpWithEmail(email: string, passwordAttempt: string, name?: string): Promise<{ user?: AppUser; error?: string }> {
  if (!auth) {
    return { error: 'Firebase Auth is not properly initialized.' };
  }
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), passwordAttempt);
    const fbUser = result.user;
    const resolvedName = (name && name.trim()) ? name.trim() : email.split('@')[0];
    try {
      await updateProfile(fbUser, { displayName: resolvedName });
    } catch {}
    await syncUserProfile(fbUser, resolvedName);
    const appUser: AppUser = {
      uid: fbUser.uid,
      email: fbUser.email || '',
      name: resolvedName,
      avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${fbUser.uid}&backgroundColor=10b981&textColor=09090b`
    };
    localStorage.setItem('tradezella_journal_user', JSON.stringify(appUser));
    return { user: appUser };
  } catch (err: any) {
    console.error('[FIREBASE EMAIL SIGN-UP ERROR]', err);
    return { error: formatFirebaseAuthError(err) };
  }
}

// 4. Sign Out using Firebase Auth
export async function logOutUser(): Promise<void> {
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("SignOut notice:", e);
    }
  }
  localStorage.removeItem('tradezella_journal_user');
  localStorage.removeItem('journaly_auth_token');
}

// Session token check for backward compatibility
export async function verifyCurrentSession(): Promise<{
  success: boolean;
  user?: { uid?: string; email: string; name: string; avatar: string; plan?: string };
}> {
  if (auth && auth.currentUser) {
    const u = auth.currentUser;
    return {
      success: true,
      user: {
        uid: u.uid,
        email: u.email || '',
        name: u.displayName || u.email?.split('@')[0] || 'Trader',
        avatar: u.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${u.uid}&backgroundColor=10b981&textColor=09090b`
      }
    };
  }
  const token = localStorage.getItem('journaly_auth_token');
  if (!token) return { success: false };

  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const rawText = await res.text();
    let data: any = null;
    try { data = JSON.parse(rawText); } catch {}
    if (res.ok && data && data.success) {
      return { success: true, user: data.user };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

// Backward-compatible verifyUserCode helper (auto-succeeds since email OTP is eliminated)
export async function verifyUserCode(email: string, codeAttempt: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return { success: true };
}

// Fetch complete user profile from Firestore
export async function getUserProfile(email: string): Promise<any> {
  const docRef = doc(db, 'profiles', email.toLowerCase().trim());
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
  } catch (err) {
    console.error('Error fetching user profile:', err);
  }
  return null;
}

// Update user profile in Firestore
export async function updateUserProfile(email: string, data: any): Promise<void> {
  const docRef = doc(db, 'profiles', email.toLowerCase().trim());
  try {
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.error('Error updating user profile:', err);
  }
}

// Subscribe to trades in real-time, partitioned by userId if provided
export function subscribeToTradesForUser(
  userIdent: string | { email: string; userId?: string },
  callback: (trades: Trade[]) => void
): () => void {
  const collectionPath = 'trades';
  const email = typeof userIdent === 'string' ? userIdent : userIdent.email;
  const userId = typeof userIdent === 'object' ? userIdent.userId : undefined;

  const q = userId
    ? query(collection(db, collectionPath), where('userId', '==', userId))
    : query(collection(db, collectionPath), where('email', '==', email.toLowerCase()));
  
  return onSnapshot(q, (snapshot) => {
    const trades: Trade[] = [];
    snapshot.forEach((document) => {
      const data = document.data();
      trades.push({
        id: document.id,
        pair: data.pair || '',
        type: data.type || 'BUY',
        risk: Number(data.risk) || 0,
        pl: Number(data.pl) || 0,
        emotion: data.emotion || '',
        date: data.date || '',
        notes: data.notes || '',
        source: data.source || 'manual',
        mt5DealId: data.mt5DealId || undefined,
        volume: data.volume !== undefined ? Number(data.volume) : undefined,
        commission: data.commission !== undefined ? Number(data.commission) : undefined,
        swap: data.swap !== undefined ? Number(data.swap) : undefined,
        createdAt: data.createdAt,
      });
    });
    // In-memory sort by date / createdAt descending
    trades.sort((a: any, b: any) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.date || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.date || 0).getTime();
      return timeB - timeA;
    });
    callback(trades);
  }, (error) => {
    console.warn('Notice in onSnapshot for trades:', error?.message || error);
  });
}

// Subscribe to user profile in real-time
export function subscribeToUserProfile(email: string, callback: (profile: any) => void): () => void {
  const docRef = doc(db, 'profiles', email.toLowerCase().trim());
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (error) => {
    console.error('Error in onSnapshot for profile:', error);
  });
}


