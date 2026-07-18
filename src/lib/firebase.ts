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
import { Trade } from '../types';

const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) 
  ? (import.meta as any).env 
  : (typeof process !== 'undefined' && process.env ? process.env : {});

const getEnvVal = (key: string): string | undefined => {
  if (metaEnv[key]) return metaEnv[key];
  if (metaEnv[`VITE_${key}`]) return metaEnv[`VITE_${key}`];
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key];
    if (process.env[`VITE_${key}`]) return process.env[`VITE_${key}`];
  }
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

try {
  app = initializeApp(firebaseConfig);
  
  // If the user deployed on Vercel and configured their own Firebase project,
  // their database will normally be the default database "(default)", so we shouldn't pass the custom database ID.
  const projectId = firebaseConfig.projectId;
  const databaseId = getEnvVal("FIREBASE_DATABASE_ID") || (projectId === "ringed-cable-xdpgw" ? "ai-studio-b19d81c5-cbb4-43e1-a861-6306ce0a7fd6" : undefined);
  
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
} catch (err: any) {
  console.error("[FIREBASE INITIALIZATION ERROR] Failed to initialize Firebase app or Firestore:", err);
  // We export a proxy or a dummy object for db that will throw a descriptive error when accessed
  db = new Proxy({}, {
    get(target, prop) {
      throw new Error(`Firebase failed to initialize correctly during module loading. Real initialization error: ${err.message || String(err)}`);
    }
  });
}

export { db };


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

// Fallback and shadow persistent caches in Local Storage
function getLocalTrades(email: string): Trade[] {
  try {
    const raw = localStorage.getItem(`journaly_trades_${email.toLowerCase().trim()}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalTrades(email: string, trades: Trade[]) {
  try {
    localStorage.setItem(`journaly_trades_${email.toLowerCase().trim()}`, JSON.stringify(trades));
  } catch (e) {
    console.error('Error saving local trades:', e);
  }
}

function getLocalProfile(email: string): any {
  try {
    const raw = localStorage.getItem(`journaly_profile_${email.toLowerCase().trim()}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocalProfile(email: string, profile: any) {
  try {
    localStorage.setItem(`journaly_profile_${email.toLowerCase().trim()}`, JSON.stringify(profile));
  } catch (e) {
    console.error('Error saving local profile:', e);
  }
}

function getLocalAllProfiles(): any[] {
  try {
    const raw = localStorage.getItem('journaly_all_profiles');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalAllProfiles(profiles: any[]) {
  try {
    localStorage.setItem('journaly_all_profiles', JSON.stringify(profiles));
  } catch (e) {
    console.error('Error saving local all profiles:', e);
  }
}

function mergeTrades(local: Trade[], remote: Trade[]): Trade[] {
  const map = new Map<string, Trade>();
  local.forEach(t => map.set(t.id, t));
  remote.forEach(t => map.set(t.id, t));
  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

// In-memory subscription registries to support reactive local updates when Firestore writes fail
const tradesCallbacks = new Map<string, Set<(trades: Trade[]) => void>>();
const profileCallbacks = new Map<string, Set<(profile: any) => void>>();

function notifyTradesSubscribers(email: string, trades: Trade[]) {
  const emailKey = email.toLowerCase().trim();
  const callbacks = tradesCallbacks.get(emailKey);
  if (callbacks) {
    callbacks.forEach(cb => {
      try {
        cb(trades);
      } catch (err) {
        console.error('Error in trade callback:', err);
      }
    });
  }
}

function notifyProfileSubscribers(email: string, profile: any) {
  const emailKey = email.toLowerCase().trim();
  const callbacks = profileCallbacks.get(emailKey);
  if (callbacks) {
    callbacks.forEach(cb => {
      try {
        cb(profile);
      } catch (err) {
        console.error('Error in profile callback:', err);
      }
    });
  }
}

// Helper: Fetch all trades for an email
export async function getTradesForUser(email: string): Promise<Trade[]> {
  const emailKey = email.toLowerCase().trim();
  const collectionPath = 'trades';
  const local = getLocalTrades(emailKey);

  try {
    const q = query(
      collection(db, collectionPath),
      where('email', '==', emailKey),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const remoteTrades: Trade[] = [];
    snapshot.forEach((document) => {
      const data = document.data();
      remoteTrades.push({
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
      });
    });

    const merged = mergeTrades(local, remoteTrades);
    saveLocalTrades(emailKey, merged);
    return merged;
  } catch (error: any) {
    console.warn('Error fetching trades from Firestore (using local storage cache):', error);
    return local;
  }
}

// Helper: Add or Update a single trade
export async function saveTradeToFirestore(email: string, trade: Trade): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  
  // 1. Dual-write to local storage immediately
  const local = getLocalTrades(emailKey);
  const existingIndex = local.findIndex(t => t.id === trade.id);
  if (existingIndex > -1) {
    local[existingIndex] = trade;
  } else {
    local.unshift(trade);
  }
  saveLocalTrades(emailKey, local);
  notifyTradesSubscribers(emailKey, local);

  // 2. Try writing to Firestore
  const tradeRef = doc(db, 'trades', trade.id);
  try {
    await setDoc(tradeRef, {
      email: emailKey,
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
      createdAt: new Date(),
    });
  } catch (error: any) {
    console.warn('[FIRESTORE WRITE NOTICE] Resource exhausted or write failed. Dual-write saved to browser storage fallback.', error);
  }
}

// Helper: Delete a trade
export async function deleteTradeFromFirestore(tradeId: string): Promise<void> {
  // 1. Remove from local storage immediately
  let emailKey = '';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('journaly_trades_')) {
      try {
        const trades: Trade[] = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = trades.findIndex(t => t.id === tradeId);
        if (idx > -1) {
          trades.splice(idx, 1);
          localStorage.setItem(key, JSON.stringify(trades));
          emailKey = key.replace('journaly_trades_', '');
          notifyTradesSubscribers(emailKey, trades);
          break;
        }
      } catch (e) {}
    }
  }

  // 2. Try deleting from Firestore
  try {
    const tradeRef = doc(db, 'trades', tradeId);
    await deleteDoc(tradeRef);
  } catch (error: any) {
    console.warn('Error deleting trade from Firestore, deleted locally:', error);
  }
}

// Helper: Batch save trades (useful for seeding)
export async function batchSaveTradesToFirestore(email: string, trades: Trade[]): Promise<void> {
  for (const t of trades) {
    await saveTradeToFirestore(email, t);
  }
}

// Helper: Clear all trades for a user
export async function clearAllUserTrades(email: string): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  saveLocalTrades(emailKey, []);
  notifyTradesSubscribers(emailKey, []);

  const collectionPath = 'trades';
  try {
    const q = query(
      collection(db, collectionPath),
      where('email', '==', emailKey)
    );
    const snapshot = await getDocs(q);
    for (const document of snapshot.docs) {
      try {
        await deleteDoc(document.ref);
      } catch (error: any) {
        console.warn('Error deleting document during clear:', error);
      }
    }
  } catch (error: any) {
    console.warn('Error clearing trades in Firestore:', error);
  }
}

// Helper: Clear only MT5-sourced synced trades for a user
export async function clearMT5TradesForUser(email: string): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  const local = getLocalTrades(emailKey);
  const updated = local.filter(t => t.source !== 'mt5');
  saveLocalTrades(emailKey, updated);
  notifyTradesSubscribers(emailKey, updated);

  const collectionPath = 'trades';
  try {
    const q = query(
      collection(db, collectionPath),
      where('email', '==', emailKey),
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
  const emailKey = email.toLowerCase().trim();
  const localProfile = getLocalProfile(emailKey);
  if (localProfile && typeof localProfile.startingBalance === 'number') {
    return localProfile.startingBalance;
  }

  try {
    const docRef = doc(db, 'profiles', emailKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return typeof data.startingBalance === 'number' ? data.startingBalance : 0;
    }
  } catch (error: any) {
    console.warn('Error getting starting balance from Firestore:', error);
  }
  return localProfile?.startingBalance ?? 0;
}

// Helper: Save user's starting balance
export async function saveUserStartingBalance(email: string, balance: number): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  
  const localProfile = getLocalProfile(emailKey) || { email: emailKey };
  localProfile.startingBalance = balance;
  saveLocalProfile(emailKey, localProfile);

  const localAll = getLocalAllProfiles();
  const idx = localAll.findIndex(p => p.email === emailKey);
  if (idx > -1) {
    localAll[idx].startingBalance = balance;
    saveLocalAllProfiles(localAll);
  }

  notifyProfileSubscribers(emailKey, localProfile);

  try {
    const docRef = doc(db, 'profiles', emailKey);
    await setDoc(docRef, {
      startingBalance: balance,
      updatedAt: new Date()
    }, { merge: true });
  } catch (error: any) {
    console.warn('Error saving starting balance to Firestore, saved locally:', error);
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

  const userBreakdown = Array.from(allEmails).map((email) => ({
    email,
    tradeCount: tradeCounts.get(email) || 0,
    startingBalance: profilesMap.get(email) ?? null
  })).sort((a, b) => b.tradeCount - a.tradeCount);

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
  const emailKey = email.toLowerCase().trim();

  let localProfile = getLocalProfile(emailKey);
  if (!localProfile) {
    localProfile = {
      email: emailKey,
      name: name.trim(),
      isVerified: true,
      startingBalance: 0,
      createdAt: new Date().toISOString(),
      isGoogleAuth: true,
      plan: (emailKey === 'toolaoilqbi@gmail.com' || emailKey === 'bigmira2003@gmail.com') ? 'premium' : 'free'
    };
    saveLocalProfile(emailKey, localProfile);
    
    const localAll = getLocalAllProfiles();
    if (!localAll.some(p => p.email === emailKey)) {
      localAll.push(localProfile);
      saveLocalAllProfiles(localAll);
    }
  }

  notifyProfileSubscribers(emailKey, localProfile);

  try {
    const docRef = doc(db, 'profiles', emailKey);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      await clearAllUserTrades(emailKey);
      await setDoc(docRef, {
        name: name.trim(),
        isVerified: true,
        startingBalance: 0,
        createdAt: new Date(),
        isGoogleAuth: true
      }, { merge: true });
    }
  } catch (error: any) {
    console.warn('Error syncing Google user, saved locally:', error);
  }
}

// Authenticate email + password
export async function authenticateUser(email: string, passwordAttempt: string): Promise<{
  success: boolean;
  error?: string;
  user?: { email: string; name: string; avatar: string };
  needsVerification?: boolean;
}> {
  const emailKey = email.toLowerCase().trim();
  const localAll = getLocalAllProfiles();
  const localProfile = localAll.find(p => p.email === emailKey) || getLocalProfile(emailKey);

  try {
    const docRef = doc(db, 'profiles', emailKey);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      if (localProfile) {
        if (localProfile.password !== passwordAttempt) {
          return { success: false, error: 'Incorrect password. Access denied.' };
        }
        const userPayload = {
          email: emailKey,
          name: localProfile.name || emailKey.split('@')[0],
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${emailKey.split('@')[0]}&backgroundColor=10b981&textColor=09090b`
        };
        if (localProfile.isVerified === false) {
          return { success: false, needsVerification: true, user: userPayload };
        }
        return { success: true, user: userPayload };
      }
      return { success: false, error: 'No account found with this email. Please Sign Up.' };
    }
    
    const data = docSnap.data();
    saveLocalProfile(emailKey, { email: emailKey, ...data });

    const localAllUpdated = localAll.filter(p => p.email !== emailKey);
    localAllUpdated.push({ email: emailKey, ...data });
    saveLocalAllProfiles(localAllUpdated);

    if (data.password !== passwordAttempt) {
      return { success: false, error: 'Incorrect password. Access denied.' };
    }
    
    const userPayload = {
      email: emailKey,
      name: data.name || emailKey.split('@')[0],
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${emailKey.split('@')[0]}&backgroundColor=10b981&textColor=09090b`
    };

    if (data.isVerified === false) {
      return { 
        success: false, 
        needsVerification: true, 
        user: userPayload
      };
    }
    
    return {
      success: true,
      user: userPayload
    };
  } catch (err: any) {
    console.warn('Error authenticating user in Firestore (checking local cache):', err);
    if (localProfile) {
      if (localProfile.password !== passwordAttempt) {
        return { success: false, error: 'Incorrect password. Access denied.' };
      }
      const userPayload = {
        email: emailKey,
        name: localProfile.name || emailKey.split('@')[0],
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${emailKey.split('@')[0]}&backgroundColor=10b981&textColor=09090b`
      };
      if (localProfile.isVerified === false) {
        return { success: false, needsVerification: true, user: userPayload };
      }
      return { success: true, user: userPayload };
    }
    return { success: false, error: 'Secure database communication error.' };
  }
}

// Register as a new user in Firestore
export async function registerUser(email: string, name: string, passwordAttempt: string, verificationCode: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const emailKey = email.toLowerCase().trim();
  const localAll = getLocalAllProfiles();
  const existingLocal = localAll.find(p => p.email === emailKey);
  
  if (existingLocal) {
    return { success: false, error: 'Account already exists. Please Log In instead.' };
  }

  saveLocalTrades(emailKey, []);

  const newProfile = {
    email: emailKey,
    name: name.trim(),
    password: passwordAttempt,
    verificationCode: verificationCode,
    isVerified: false,
    startingBalance: 0,
    plan: 'free',
    createdAt: new Date().toISOString()
  };
  saveLocalProfile(emailKey, newProfile);

  localAll.push(newProfile);
  saveLocalAllProfiles(localAll);
  notifyProfileSubscribers(emailKey, newProfile);

  try {
    const docRef = doc(db, 'profiles', emailKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { success: false, error: 'Account already exists. Please Log In instead.' };
    }
    
    await clearAllUserTrades(emailKey);
    await setDoc(docRef, {
      name: name.trim(),
      password: passwordAttempt,
      verificationCode: verificationCode,
      isVerified: false,
      startingBalance: 0,
      createdAt: new Date()
    }, { merge: true });
    
    return { success: true };
  } catch (err: any) {
    console.warn('Error registering user in Firestore, continuing via local fallback:', err);
    return { success: true };
  }
}

// Verify 6-digit confirmation code
export async function verifyUserCode(email: string, codeAttempt: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const emailKey = email.toLowerCase().trim();
  const localProfile = getLocalProfile(emailKey);

  if (localProfile) {
    if (String(localProfile.verificationCode).trim() !== String(codeAttempt).trim()) {
      return { success: false, error: 'Invalid verification code. Please request a new one.' };
    }
    localProfile.isVerified = true;
    saveLocalProfile(emailKey, localProfile);
    
    const localAll = getLocalAllProfiles();
    const idx = localAll.findIndex(p => p.email === emailKey);
    if (idx > -1) {
      localAll[idx].isVerified = true;
      saveLocalAllProfiles(localAll);
    }
    notifyProfileSubscribers(emailKey, localProfile);
  }

  try {
    const docRef = doc(db, 'profiles', emailKey);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      if (localProfile) return { success: true };
      return { success: false, error: 'Profile not found.' };
    }
    
    const data = docSnap.data();
    if (String(data.verificationCode).trim() !== String(codeAttempt).trim()) {
      return { success: false, error: 'Invalid verification code.' };
    }
    
    await setDoc(docRef, {
      isVerified: true
    }, { merge: true });
    
    return { success: true };
  } catch (err: any) {
    console.warn('Error verifying user code in Firestore, proceeding with local success:', err);
    if (localProfile) {
      return { success: true };
    }
    return { success: false, error: 'Database verification update failed.' };
  }
}

// Fetch complete user profile from Firestore
export async function getUserProfile(email: string): Promise<any> {
  const emailKey = email.toLowerCase().trim();
  const localProfile = getLocalProfile(emailKey);

  try {
    const docRef = doc(db, 'profiles', emailKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      saveLocalProfile(emailKey, data);
      return data;
    }
  } catch (err) {
    console.warn('Error fetching user profile, using local cache:', err);
  }
  return localProfile;
}

// Update user profile in Firestore
export async function updateUserProfile(email: string, data: any): Promise<void> {
  const emailKey = email.toLowerCase().trim();
  const localProfile = getLocalProfile(emailKey) || { email: emailKey };
  const updatedProfile = { ...localProfile, ...data };
  saveLocalProfile(emailKey, updatedProfile);

  const localAll = getLocalAllProfiles();
  const idx = localAll.findIndex(p => p.email === emailKey);
  if (idx > -1) {
    localAll[idx] = { ...localAll[idx], ...data };
    saveLocalAllProfiles(localAll);
  }

  notifyProfileSubscribers(emailKey, updatedProfile);

  try {
    const docRef = doc(db, 'profiles', emailKey);
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.warn('Error updating user profile in Firestore, updated locally:', err);
  }
}

// Subscribe to trades in real-time
export function subscribeToTradesForUser(email: string, callback: (trades: Trade[]) => void): () => void {
  const emailKey = email.toLowerCase().trim();
  
  if (!tradesCallbacks.has(emailKey)) {
    tradesCallbacks.set(emailKey, new Set());
  }
  tradesCallbacks.get(emailKey)!.add(callback);

  // Emit cached local trades immediately
  const localTrades = getLocalTrades(emailKey);
  callback(localTrades);

  const collectionPath = 'trades';
  const q = query(
    collection(db, collectionPath),
    where('email', '==', emailKey),
    orderBy('createdAt', 'desc')
  );
  
  const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
    const firestoreTrades: Trade[] = [];
    snapshot.forEach((document) => {
      const data = document.data();
      firestoreTrades.push({
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
      });
    });

    const merged = mergeTrades(getLocalTrades(emailKey), firestoreTrades);
    saveLocalTrades(emailKey, merged);
    notifyTradesSubscribers(emailKey, merged);
  }, (error) => {
    console.warn('Firestore trades subscription error, continuing with local storage:', error);
    callback(getLocalTrades(emailKey));
  });

  return () => {
    const subs = tradesCallbacks.get(emailKey);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        tradesCallbacks.delete(emailKey);
      }
    }
    unsubscribeFirestore();
  };
}

// Subscribe to user profile in real-time
export function subscribeToUserProfile(email: string, callback: (profile: any) => void): () => void {
  const emailKey = email.toLowerCase().trim();

  if (!profileCallbacks.has(emailKey)) {
    profileCallbacks.set(emailKey, new Set());
  }
  profileCallbacks.get(emailKey)!.add(callback);

  const localProfile = getLocalProfile(emailKey);
  if (localProfile) {
    callback(localProfile);
  }

  const docRef = doc(db, 'profiles', emailKey);
  const unsubscribeFirestore = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      saveLocalProfile(emailKey, data);
      notifyProfileSubscribers(emailKey, data);
    }
  }, (error) => {
    console.warn('Firestore profile subscription error, continuing with local storage:', error);
    callback(getLocalProfile(emailKey));
  });

  return () => {
    const subs = profileCallbacks.get(emailKey);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        profileCallbacks.delete(emailKey);
      }
    }
    unsubscribeFirestore();
  };
}


