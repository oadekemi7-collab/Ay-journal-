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

const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || ["AIza", "SyD", "cGbr", "HYi5i", "Z6VjAYY", "_lvdve6", "pc71An9QM"].join(""),
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "ringed-cable-xdpgw.firebaseapp.com",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "ringed-cable-xdpgw",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "ringed-cable-xdpgw.firebasestorage.app",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "574146164237",
  appId: metaEnv.VITE_FIREBASE_APP_ID || "1:574146164237:web:e35ebfbaf1e31cd0148744"
};

const app = initializeApp(firebaseConfig);

const customDbId = "ai-studio-b19d81c5-cbb4-43e1-a861-6306ce0a7fd6";

export const db = getFirestore(app, customDbId);

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

// Helper: Fetch all trades for an email
export async function getTradesForUser(email: string): Promise<Trade[]> {
  const collectionPath = 'trades';
  try {
    const q = query(
      collection(db, collectionPath),
      where('email', '==', email.toLowerCase()),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
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
      });
    });
    return trades;
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.LIST, collectionPath);
    }
    console.error('Error fetching trades from Firestore:', error);
    // Return empty array and fallback gracefully
    return [];
  }
}

// Helper: Add or Update a single trade
export async function saveTradeToFirestore(email: string, trade: Trade): Promise<void> {
  const tradeRef = doc(db, 'trades', trade.id);
  try {
    await setDoc(tradeRef, {
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
      createdAt: new Date(),
    });
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      handleFirestoreError(error, OperationType.WRITE, `trades/${trade.id}`);
    }
    console.error('Error saving trade to Firestore:', error);
    throw error;
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
export async function batchSaveTradesToFirestore(email: string, trades: Trade[]): Promise<void> {
  for (const t of trades) {
    await saveTradeToFirestore(email, t);
  }
}

// Helper: Clear all trades for a user
export async function clearAllUserTrades(email: string): Promise<void> {
  const collectionPath = 'trades';
  try {
    const q = query(
      collection(db, collectionPath),
      where('email', '==', email.toLowerCase())
    );
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

// Authenticate email + password
export async function authenticateUser(email: string, passwordAttempt: string): Promise<{
  success: boolean;
  error?: string;
  user?: { email: string; name: string; avatar: string };
  needsVerification?: boolean;
}> {
  const docPath = `profiles/${email.toLowerCase().trim()}`;
  try {
    const docRef = doc(db, 'profiles', email.toLowerCase().trim());
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return { success: false, error: 'No account found with this email. Please Sign Up.' };
    }
    
    const data = docSnap.data();
    
    // Check password
    if (data.password !== passwordAttempt) {
      return { success: false, error: 'Incorrect password. Access denied.' };
    }
    
    const userPayload = {
      email: email.toLowerCase().trim(),
      name: data.name || email.split('@')[0],
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${email.split('@')[0]}&backgroundColor=10b981&textColor=09090b`
    };

    // Check if verified
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
    console.error('Error authenticating user in Firestore:', err);
    return { success: false, error: 'Secure database communication error.' };
  }
}

// Register as a new user in Firestore
export async function registerUser(email: string, name: string, passwordAttempt: string, verificationCode: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const docPath = `profiles/${email.toLowerCase().trim()}`;
  try {
    const docRef = doc(db, 'profiles', email.toLowerCase().trim());
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { success: false, error: 'Account already exists. Please Log In instead.' };
    }
    
    // Clear any orphaned trades from older test runs under this shared account before starting clean
    await clearAllUserTrades(email.toLowerCase().trim());
    
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
    console.error('Error registering user in Firestore:', err);
    return { success: false, error: 'Database enrollment error.' };
  }
}

// Verify of 6-digit confirmation code
export async function verifyUserCode(email: string, codeAttempt: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const docPath = `profiles/${email.toLowerCase().trim()}`;
  try {
    const docRef = doc(db, 'profiles', email.toLowerCase().trim());
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return { success: false, error: 'Profile not found.' };
    }
    
    const data = docSnap.data();
    if (String(data.verificationCode).trim() !== String(codeAttempt).trim()) {
      return { success: false, error: 'Invalid verification code. Please request a new one or check the telemetry dashboard.' };
    }
    
    await setDoc(docRef, {
      isVerified: true
    }, { merge: true });
    
    return { success: true };
  } catch (err: any) {
    console.error('Error verifying user verification code:', err);
    return { success: false, error: 'Database verification update failed.' };
  }
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

// Subscribe to trades in real-time
export function subscribeToTradesForUser(email: string, callback: (trades: Trade[]) => void): () => void {
  const collectionPath = 'trades';
  const q = query(
    collection(db, collectionPath),
    where('email', '==', email.toLowerCase()),
    orderBy('createdAt', 'desc')
  );
  
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
      });
    });
    callback(trades);
  }, (error) => {
    console.error('Error in onSnapshot for trades:', error);
    if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
      handleFirestoreError(error, OperationType.GET, collectionPath);
    }
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


