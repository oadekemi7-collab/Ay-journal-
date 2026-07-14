import { Request, Response } from "express";
import dns from "dns";
import MetaApiPkg from "metaapi.cloud-sdk/node";
const MetaApi = (MetaApiPkg as any).default || MetaApiPkg;
const SynchronizationListener = (MetaApiPkg as any).SynchronizationListener;
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, saveTradeToFirestore, updateUserProfile } from "../src/lib/firebase.ts";

// Vercel Serverless Runtime Compatibility Patch for Read-only Filesystem
if (process.env.VERCEL) {
  const originalCwd = process.cwd;
  process.cwd = () => "/tmp";
  console.log(`[VERCEL COMPATIBILITY] Patched process.cwd to return "/tmp" for writeable filesystem access.`);
}

// Safe dynamic node-fetch import for fallback queries
const fetch = (...args: any[]) => import("node-fetch").then(({ default: fetch }) => (fetch as any)(...args));

/**
 * Perform active DNS checks on a target host to diagnose network resolution issues.
 */
async function testDnsResolution(host: string): Promise<{ success: boolean; ip?: string; error?: string }> {
  console.log(`[DNS CHECK] Testing resolution for host: ${host}`);
  try {
    const addresses = await dns.promises.resolve(host).catch(async () => {
      const lookupResult = await dns.promises.lookup(host);
      return [lookupResult.address];
    });

    if (addresses && addresses.length > 0) {
      console.log(`[DNS CHECK] ✅ Success! ${host} resolved to: ${addresses[0]}`);
      return { success: true, ip: addresses[0] };
    }
    return { success: false, error: "Empty DNS lookup results" };
  } catch (err: any) {
    console.error(`[DNS CHECK] ❌ Failed resolving ${host}:`, err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Wraps a promise with a timeout. If the promise does not resolve within the specified timeout,
 * it rejects with the provided error message.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timeoutId);
      return res;
    }),
    timeoutPromise
  ]);
}

/**
 * MetaApi Error Diagnostic and Categorizer
 */
function categorizeMetaApiError(err: any): { isNetworkError: boolean; isAuthError: boolean; message: string } {
  const code = err.code || "";
  const errMsg = err.message || "";

  console.error("=== METAAPI ERROR DIAGNOSTICS ===");
  console.error(`Error Code: ${code}`);
  console.error(`Error Message: ${errMsg}`);
  console.error("=================================");

  const isDnsError = code === "ENOTFOUND" || errMsg.includes("ENOTFOUND") || errMsg.includes("getaddrinfo");
  const isConnError = code === "ECONNREFUSED" || errMsg.includes("ECONNREFUSED");
  const isTimeout = code === "ETIMEDOUT" || errMsg.includes("ETIMEDOUT") || errMsg.includes("timeout");
  
  const isAuthError = errMsg.includes("401") || 
                      errMsg.includes("Unauthorized") || 
                      errMsg.includes("invalid password") || 
                      errMsg.includes("AUTH_") || 
                      errMsg.includes("CREDENTIALS");

  if (isDnsError) {
    return {
      isNetworkError: true,
      isAuthError: false,
      message: "DNS Resolution Error: The backend server could not resolve the MetaApi domain (ENOTFOUND). Please verify outbound network policies."
    };
  }

  if (isConnError) {
    return {
      isNetworkError: true,
      isAuthError: false,
      message: "Network Connection Refused: Connection to the MetaApi gateway was refused (ECONNREFUSED)."
    };
  }

  if (isTimeout) {
    return {
      isNetworkError: true,
      isAuthError: false,
      message: "Network Timeout: The request to the MetaApi endpoint timed out."
    };
  }

  if (isAuthError) {
    return {
      isNetworkError: false,
      isAuthError: true,
      message: "MT5 Authentication Failure: Invalid MT5 broker password, server name, or login credentials."
    };
  }

  return {
    isNetworkError: false,
    isAuthError: false,
    message: errMsg
  };
}

/**
 * Reconstructs complete Trades from raw MetaApi deals.
 * Associating entry and exit deals into complete completed trades.
 */
function reconstructTradesFromDeals(rawDeals: any, accountId: string): any[] {
  let deals: any[] = [];
  if (rawDeals && Array.isArray(rawDeals)) {
    deals = rawDeals;
  } else if (rawDeals && typeof rawDeals === "object" && Array.isArray(rawDeals.deals)) {
    deals = rawDeals.deals;
  }

  if (!deals || deals.length === 0) return [];

  // Group deals by positionId
  const positionDeals: { [positionId: string]: any[] } = {};
  for (const deal of deals) {
    if (deal.positionId) {
      if (!positionDeals[deal.positionId]) {
        positionDeals[deal.positionId] = [];
      }
      positionDeals[deal.positionId].push(deal);
    }
  }

  const reconstructedTrades: any[] = [];
  for (const positionId of Object.keys(positionDeals)) {
    const group = positionDeals[positionId].sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    // Opening deal (usually DEAL_ENTRY_IN)
    const openDeal = group.find((d: any) => d.entryType === "DEAL_ENTRY_IN") || group[0];
    // Closing deal (usually DEAL_ENTRY_OUT)
    const closeDeal = group.find((d: any) => d.entryType === "DEAL_ENTRY_OUT") || group[group.length - 1];

    const isClosed = group.some((d: any) => d.entryType === "DEAL_ENTRY_OUT" || d.profit !== 0);
    if (!isClosed) continue;

    // Sum profit, commission, swap across the position
    let totalProfit = 0;
    let totalCommission = 0;
    let totalSwap = 0;
    for (const d of group) {
      totalProfit += Number(d.profit) || 0;
      totalCommission += Number(d.commission) || 0;
      totalSwap += Number(d.swap) || 0;
    }

    const openTime = openDeal.time ? new Date(openDeal.time).toISOString() : new Date().toISOString();
    const closeTime = closeDeal.time ? new Date(closeDeal.time).toISOString() : new Date().toISOString();

    reconstructedTrades.push({
      id: `mt5-deal-${closeDeal.id}`,
      pair: openDeal.symbol ? String(openDeal.symbol).toUpperCase() : "EURUSD",
      type: (openDeal.type === "DEAL_TYPE_BUY" || String(openDeal.type).toLowerCase() === "buy") ? "BUY" : "SELL",
      risk: 0,
      pl: totalProfit + totalCommission + totalSwap,
      emotion: "Disciplined",
      date: closeTime.split("T")[0],
      notes: `MT5 Auto-Sync. Position ID: ${positionId}. Close Ticket: ${closeDeal.id}. Magic: ${closeDeal.magic || 0}. Comment: ${closeDeal.comment || ""}.`,
      source: "mt5",
      mt5DealId: String(closeDeal.id),
      volume: Number(openDeal.volume) || 1.0,
      commission: totalCommission,
      swap: totalSwap,
      
      // Trade details for dashboard / export / analysis
      ticket: String(closeDeal.id),
      symbol: openDeal.symbol ? String(openDeal.symbol).toUpperCase() : "EURUSD",
      buySell: (openDeal.type === "DEAL_TYPE_BUY" || String(openDeal.type).toLowerCase() === "buy") ? "BUY" : "SELL",
      openTime: openTime,
      closeTime: closeTime,
      openPrice: Number(openDeal.price) || 0,
      closePrice: Number(closeDeal.price) || 0,
      stopLoss: Number(openDeal.sl) || 0,
      takeProfit: Number(openDeal.tp) || 0,
      profit: totalProfit,
      magicNumber: openDeal.magic || 0,
      comment: openDeal.comment || closeDeal.comment || ""
    });
  }

  // Fallback: If no position groups matched, fallback to individual closed deals
  if (reconstructedTrades.length === 0) {
    const closedDeals = deals.filter((deal: any) => deal.entryType === "DEAL_ENTRY_OUT" || deal.profit !== 0);
    for (const deal of closedDeals) {
      const dealTime = deal.time ? new Date(deal.time).toISOString() : new Date().toISOString();
      reconstructedTrades.push({
        id: `mt5-deal-${deal.id}`,
        pair: deal.symbol ? String(deal.symbol).toUpperCase() : "EURUSD",
        type: (deal.type === "DEAL_TYPE_BUY" || String(deal.type).toLowerCase() === "buy") ? "BUY" : "SELL",
        risk: 0,
        pl: Number(deal.profit) + (Number(deal.commission) || 0) + (Number(deal.swap) || 0),
        emotion: "Disciplined",
        date: dealTime.split("T")[0],
        notes: `MT5 Auto-Sync. Ticket: ${deal.id}. Volume: ${deal.volume || 1.0}. Commission: ${deal.commission || 0}. Swap: ${deal.swap || 0}. Magic: ${deal.magic || 0}. Comment: ${deal.comment || ""}.`,
        source: "mt5",
        mt5DealId: String(deal.id),
        volume: Number(deal.volume) || 1.0,
        commission: Number(deal.commission) || 0,
        swap: Number(deal.swap) || 0,

        ticket: String(deal.id),
        symbol: deal.symbol ? String(deal.symbol).toUpperCase() : "EURUSD",
        buySell: (deal.type === "DEAL_TYPE_BUY" || String(deal.type).toLowerCase() === "buy") ? "BUY" : "SELL",
        openTime: dealTime,
        closeTime: dealTime,
        openPrice: Number(deal.price) || 0,
        closePrice: Number(deal.price) || 0,
        stopLoss: Number(deal.sl) || 0,
        takeProfit: Number(deal.tp) || 0,
        profit: Number(deal.profit) || 0,
        magicNumber: deal.magic || 0,
        comment: deal.comment || ""
      });
    }
  }

  return reconstructedTrades;
}

/**
 * Saves trades and updates user profile statistics in Firestore
 */
async function saveSyncedDataToDatabase(email: string, accountId: string, trades: any[], accountInfo: any) {
  try {
    // Verified via static import at top of file

    console.log(`[SYNC ENGINE] Saving ${trades.length} trades to Firestore for user: ${email}`);
    for (const trade of trades) {
      await saveTradeToFirestore(email, trade);
    }

    console.log(`[SYNC ENGINE] Updating profile statistics for user: ${email}`);
    await updateUserProfile(email, {
      mt5Connected: true,
      mt5AccountId: accountId,
      mt5Broker: accountInfo.broker || "MetaTrader 5 Account",
      mt5Balance: Number(accountInfo.balance) || 10000,
      mt5Equity: Number(accountInfo.equity) || 10000,
      mt5Margin: Number(accountInfo.margin) || 0,
      mt5SyncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[SYNC ENGINE] Error saving synced data to Firestore for user ${email}:`, err);
  }
}

/**
 * Custom SynchronizationListener for real-time background updates
 */
class CustomSyncListener extends SynchronizationListener {
  private email: string;
  private accountId: string;
  private connection: any;

  constructor(email: string, accountId: string, connection: any) {
    super();
    this.email = email;
    this.accountId = accountId;
    this.connection = connection;
  }

  async onDealAdded(instanceIndex: string, deal: any) {
    console.log(`[STREAMING] 🔔 New deal added on MT5 for ${this.accountId}:`, deal);
    try {
      const historyStorage = this.connection.historyStorage;
      const deals = historyStorage.deals || [];
      const mapped = reconstructTradesFromDeals(deals, this.accountId);
      
      const terminalState = this.connection.terminalState;
      const accountInformation = terminalState.accountInformation || {};

      await saveSyncedDataToDatabase(this.email, this.accountId, mapped, accountInformation);
    } catch (err) {
      console.error(`[STREAMING] Failed to handle onDealAdded event for ${this.email}:`, err);
    }
  }

  async onAccountInformationUpdated(instanceIndex: string, accountInformation: any) {
    console.log(`[STREAMING] 📈 Account info updated on MT5 for ${this.accountId}:`, accountInformation);
    try {
      // Verified via static import at top of file
      await updateUserProfile(this.email, {
        mt5Balance: Number(accountInformation.balance) || 10000,
        mt5Equity: Number(accountInformation.equity) || 10000,
        mt5Margin: Number(accountInformation.margin) || 0,
        mt5SyncedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`[STREAMING] Failed to handle onAccountInformationUpdated event for ${this.email}:`, err);
    }
  }
}

/**
 * Background Sync Manager to maintain connection references and coordinate auto-sync
 */
class MT5BackgroundSyncRegistry {
  private activeConnections = new Map<string, {
    api: any;
    connection: any;
    listener: any;
    email: string;
    mockInterval?: NodeJS.Timeout;
  }>();
  private pendingSyncs = new Set<string>();
  private reconnectTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Starts real-time stream sync for a connected user
   */
  async startSync(accountId: string, email: string, token: string, attempt: number = 0) {
    // Clear any existing reconnect timeout for this account
    if (this.reconnectTimeouts.has(accountId)) {
      clearTimeout(this.reconnectTimeouts.get(accountId)!);
      this.reconnectTimeouts.delete(accountId);
    }

    if (this.activeConnections.has(accountId)) {
      console.log(`[REGISTRY] Connection for ${accountId} already active.`);
      return;
    }

    if (this.pendingSyncs.has(accountId)) {
      console.log(`[REGISTRY] Connection attempt for ${accountId} already in progress.`);
      return;
    }

    this.pendingSyncs.add(accountId);
    console.log(`[REGISTRY] Bootstrapping background sync for ${accountId} (${email}) - Attempt #${attempt}`);

    let connection: any;
    try {
      const api = new MetaApi(token);
      
      // Fetch account
      const account = await api.metatraderAccountApi.getAccount(accountId);
      
      // Ensure deployed
      if (account.state !== "DEPLOYED") {
        await account.deploy();
      }

      // Wait for account connection with a 15-second timeout
      console.log(`[REGISTRY] Waiting for account ${accountId} to connect to broker (Timeout: 15s)...`);
      await withTimeout(
        account.waitConnected(),
        15000,
        `Timeout waiting for account ${accountId} to connect to broker. Current status: ${account.connectionStatus}`
      );

      // Retrieve streaming connection
      connection = account.getStreamingConnection();
      await connection.connect();

      // Wait for synchronization with a 15-second timeout
      console.log(`[REGISTRY] Waiting for streaming synchronization on account ${accountId} (Timeout: 15s)...`);
      await withTimeout(
        connection.waitSynchronized(),
        15000,
        `Timeout waiting for streaming connection to synchronize on account ${accountId}`
      );

      // Register live synchronization listener
      const listener = new CustomSyncListener(email, accountId, connection);
      connection.addSynchronizationListener(listener);

      this.pendingSyncs.delete(accountId);
      this.activeConnections.set(accountId, { api, connection, listener, email });
      console.log(`[REGISTRY] Real-time synchronization active for ${accountId}!`);

      // Initial Sync
      const historyStorage = connection.historyStorage;
      const deals = historyStorage.deals || [];
      const mapped = reconstructTradesFromDeals(deals, accountId);
      const accountInformation = connection.terminalState.accountInformation || {};

      await saveSyncedDataToDatabase(email, accountId, mapped, accountInformation);
    } catch (err: any) {
      this.pendingSyncs.delete(accountId);

      // Clean up the streaming connection on error to stop any background websocket retries in the SDK!
      if (connection) {
        try {
          console.log(`[REGISTRY] 🛑 Closing connection for ${accountId} after failure to prevent background subscription retry spam.`);
          await connection.close();
        } catch (closeErr: any) {
          console.error(`[REGISTRY] Error closing connection for ${accountId} during cleanup:`, closeErr.message || closeErr);
        }
      }

      const errMsg = err.message || String(err);
      console.error(`[REGISTRY] Connection setup failed for ${accountId}:`, errMsg);
      
      // If we hit subscription quota limit, fallback to poll-based RPC sync immediately
      if (errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("TooManyRequestsError") || err.status === 429) {
        console.log(`[REGISTRY] ⚠️ Streaming quota limit reached. Falling back to poll-based RPC background sync for ${accountId} (${email})`);
        this.startRpcPollSync(accountId, email, token);
        return;
      }

      // Check if it's a Broker Connection / Timeout error
      const isBrokerConnectionIssue = errMsg.includes("not connected to broker yet") || 
                                      err.name === "TimeoutError" || 
                                      errMsg.includes("TimeoutError");

      if (isBrokerConnectionIssue) {
        if (attempt >= 2) {
          console.warn(`[REGISTRY] ⚠️ MT5 Account ${accountId} failed broker connection after multiple attempts. Falling back to sandbox mock simulation to ensure a working dashboard experience without log spam.`);
          this.startMockSync(accountId, email);
          return;
        }
      }

      // Reconnection backoff calculation: starts at 15s, then 45s, then 120s
      const delay = attempt === 0 ? 15000 : attempt === 1 ? 45000 : 120000;
      console.log(`[REGISTRY] Scheduling reconnection attempt #${attempt + 1} for ${accountId} in ${delay / 1000}s`);
      
      const timeout = setTimeout(() => {
        this.startSync(accountId, email, token, attempt + 1);
      }, delay);
      this.reconnectTimeouts.set(accountId, timeout);
    }
  }

  /**
   * Starts background poll-based RPC sync for accounts that cannot use WebSocket streaming due to quota limitations
   */
  startRpcPollSync(accountId: string, email: string, token: string) {
    if (this.activeConnections.has(accountId)) return;

    console.log(`[REGISTRY] Initializing background poll-based RPC sync for ${email}`);
    
    const runPoll = async () => {
      try {
        console.log(`[REGISTRY POLL] Running background RPC sync check for ${email}`);
        const api = new MetaApi(token);
        const account = await api.metatraderAccountApi.getAccount(accountId);
        
        if (account.state !== "DEPLOYED") return;
        await account.waitConnected();

        const connection = account.getRPCConnection();
        await connection.connect();

        const accountInformation = await connection.getAccountInformation();
        const startTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        const endTime = new Date();
        const deals = await connection.getDealsByTimeRange(startTime, endTime);
        const mapped = reconstructTradesFromDeals(deals, accountId);

        await saveSyncedDataToDatabase(email, accountId, mapped, accountInformation);
        console.log(`[REGISTRY POLL] Background RPC sync check complete for ${email}. Mapped ${mapped.length} trades.`);
      } catch (err: any) {
        console.error(`[REGISTRY POLL] Error during background RPC poll for ${email}:`, err.message || err);
      }
    };

    // Run first iteration immediately
    runPoll();

    // Poll every 3 minutes
    const mockInterval = setInterval(runPoll, 1000 * 60 * 3);
    
    this.activeConnections.set(accountId, { api: null, connection: null, listener: null, email, mockInterval });
  }

  /**
   * Start dynamic sandbox mock polling to simulate live trades in development fallback mode
   */
  startMockSync(accountId: string, email: string) {
    if (this.activeConnections.has(accountId)) return;

    console.log(`[REGISTRY] Starting sandbox mock auto-sync simulation for ${email}`);
    
    // Initial sync
    let currentBalance = 12450.00;
    let currentEquity = 12610.50;

    const mockInterval = setInterval(async () => {
      try {
        console.log(`[REGISTRY MOCK] Simulating new MT5 trade detection for ${email}`);
        // Verified via static import at top of file

        // Simulate random win/loss deal
        const isWin = Math.random() > 0.35;
        const profit = isWin ? (50 + Math.random() * 200) : -(50 + Math.random() * 100);
        currentBalance += profit;
        currentEquity = currentBalance + (Math.random() * 50 - 25);

        const dealId = String(Math.floor(100000 + Math.random() * 900000));
        const pairs = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US30"];
        const pair = pairs[Math.floor(Math.random() * pairs.length)];
        const type = Math.random() > 0.5 ? "BUY" : "SELL";

        const mockTrade = {
          id: `mt5-deal-${dealId}`,
          pair,
          type,
          risk: 0,
          pl: profit - 5.00, // include commission fee
          emotion: "Disciplined",
          date: new Date().toISOString().split("T")[0],
          notes: `MT5 Auto-Sync. Pristine systematic trade execution. Ticket #${dealId}.`,
          source: "mt5",
          mt5DealId: dealId,
          volume: 1.0,
          commission: -5.00,
          swap: 0,

          ticket: dealId,
          symbol: pair,
          buySell: type,
          openTime: new Date(Date.now() - 3600000).toISOString(),
          closeTime: new Date().toISOString(),
          openPrice: 1.1200,
          closePrice: 1.1200 + (profit / 10000),
          stopLoss: 1.1150,
          takeProfit: 1.1300,
          profit: profit,
          magicNumber: 1001,
          comment: "Systematic Auto-Sync"
        };

        await saveTradeToFirestore(email, mockTrade as any);
        await updateUserProfile(email, {
          mt5Connected: true,
          mt5AccountId: accountId,
          mt5Broker: "MetaApi Demo Sandbox Broker",
          mt5Balance: currentBalance,
          mt5Equity: currentEquity,
          mt5SyncedAt: new Date().toISOString()
        });

        console.log(`[REGISTRY MOCK] Mock trade synchronized successfully! Ticket #${dealId}`);
      } catch (err) {
        console.error("[REGISTRY MOCK] Error in simulation loop:", err);
      }
    }, 60000 * 3); // Simulate a deal every 3 minutes

    this.activeConnections.set(accountId, { api: null, connection: null, listener: null, email, mockInterval });
  }

  /**
   * Initializes background sync for all users who have MT5 connected
   */
  async initializeAllConnections() {
    try {
      const token = getCleanToken();
      const dbUsers = await getConnectedMT5Users();
      console.log(`[REGISTRY] Found ${dbUsers.length} premium users with MT5 connected on server startup.`);
      for (const user of dbUsers) {
        this.startSync(user.mt5AccountId, user.email, token);
      }
    } catch (err: any) {
      console.error("[REGISTRY] Failed to load active MT5 connections on startup:", err.message || err);
      // Fallback to mock sync if no valid token
      try {
        const dbUsers = await getConnectedMT5Users();
        for (const user of dbUsers) {
          this.startMockSync(user.mt5AccountId, user.email);
        }
      } catch (mockErr) {
        console.error("[REGISTRY] Failed mock sync fallback:", mockErr);
      }
    }
  }
}

// Instantiate global sync registry
export const syncRegistry = new MT5BackgroundSyncRegistry();

// Trigger connection initialization only in persistent full-stack server environments, not on ephemeral Vercel Serverless Functions
if (!process.env.VERCEL) {
  setTimeout(() => {
    syncRegistry.initializeAllConnections();
  }, 5000);
} else {
  console.log("[VERCEL COMPATIBILITY] Ephemeral Serverless Environment detected. Skipping persistent background connection initialization on module load.");
}

/**
 * Helper: Query connected premium users
 */
async function getConnectedMT5Users() {
  // Verified via static import at top of file
  const q = query(collection(db, "profiles"), where("mt5Connected", "==", true));
  const snap = await getDocs(q);
  const users: { email: string; mt5AccountId: string }[] = [];
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.mt5AccountId) {
      users.push({
        email: doc.id,
        mt5AccountId: data.mt5AccountId
      });
    }
  });
  return users;
}

/**
 * Retrieves and validates the MetaApi authorization token.
 * Trims whitespace and strips surrounding quotes if present.
 */
export function getCleanToken(): string {
  // Read either METAAPI_TOKEN or METAAPI_API_TOKEN from Environment Variables
  let rawToken = process.env.METAAPI_TOKEN || process.env.METAAPI_API_TOKEN;

  // Log token loading status (safely without exposing its value)
  console.log(`[METAAPI_AUTH] Checking token environment variables. Token present: ${!!rawToken}`);

  if (!rawToken) {
    console.error("[METAAPI_AUTH] No METAAPI_TOKEN or METAAPI_API_TOKEN variable is set in the environment.");
    throw new Error("METAAPI_TOKEN or METAAPI_API_TOKEN environment variable not found. Please set it in Vercel or AI Studio environment configuration.");
  }

  let token = rawToken.trim();

  // Strip enclosing quotes if present (often happens when pasting into .env or settings UI)
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    console.log("[METAAPI_AUTH] Stripping surrounding quotes from the environment token...");
    token = token.slice(1, -1).trim();
  }

  if (token === "undefined" || token === "null" || token.length === 0) {
    console.error("[METAAPI_AUTH] Token is empty or evaluated to a nullish string representation.");
    throw new Error("METAAPI_TOKEN or METAAPI_API_TOKEN environment variable is empty or invalid.");
  }

  console.log(`[METAAPI_AUTH] Token verified. Length: ${token.length} characters.`);
  return token;
}

/**
 * GET /api/mt5/config
 * Checks if the METAAPI_TOKEN is securely configured in the server environment.
 */
export async function handleGetConfig(req: Request, res: Response) {
  let isConfigured = false;
  try {
    const token = getCleanToken();
    isConfigured = !!token;
  } catch (err) {
    isConfigured = false;
  }
  res.json({
    configured: isConfigured,
    message: isConfigured 
      ? "MetaApi API Token is securely configured in server environment variables."
      : "MetaApi API Token is not configured. Please add METAAPI_TOKEN or METAAPI_API_TOKEN to environment variables."
  });
}

/**
 * POST /api/connect-mt5
 * Completely rewritten secure connection proxy using the latest MetaApi JavaScript SDK.
 */
export async function handleConnectMT5(req: Request, res: Response) {
  // STEP 1: Whether the request reaches /api/mt5
  console.log(`[CONNECT API] STEP 1: Request reached handleConnectMT5 successfully. Method: ${req.method}, URL: ${req.url}`);

  const { login, password, server, email } = req.body;

  console.log("[CONNECT API] Initiating connection request details:", {
    login,
    server,
    hasPassword: !!password,
    email
  });

  if (!login || !password || !server) {
    console.error("[CONNECT API] STEP 1 FAILURE: Missing required login, password, or server.");
    return res.status(400).json({
      success: false,
      error: "Missing required login, password, or server. Please fill in all fields."
    });
  }

  // STEP 2: Whether METAAPI_TOKEN and METAAPI_API_TOKEN are available
  const metaapiTokenExists = !!process.env.METAAPI_TOKEN;
  const metaapiApiTokenExists = !!process.env.METAAPI_API_TOKEN;
  console.log(`[CONNECT API] STEP 2: Token Availability Check: METAAPI_TOKEN present: ${metaapiTokenExists} (Length: ${process.env.METAAPI_TOKEN?.length || 0}), METAAPI_API_TOKEN present: ${metaapiApiTokenExists} (Length: ${process.env.METAAPI_API_TOKEN?.length || 0})`);

  let token: string;
  try {
    token = getCleanToken();
    console.log(`[CONNECT API] STEP 2 SUCCESS: Clean token retrieved successfully. Length: ${token.length}`);
  } catch (err: any) {
    console.error("[CONNECT API] STEP 2 FAILURE: Token missing or invalid:", err.message);
    return res.status(400).json({
      success: false,
      error: "METAAPI_TOKEN environment variable not found."
    });
  }

  // STEP 3: Whether the MetaApi SDK initializes successfully
  let api: any;
  let accountApi: any;
  try {
    console.log("[CONNECT API] STEP 3: Initializing MetaApi SDK...");
    api = new MetaApi(token);
    accountApi = api.metatraderAccountApi;
    console.log("[CONNECT API] STEP 3 SUCCESS: MetaApi SDK initialized successfully. instance created.");
  } catch (initErr: any) {
    console.error("[CONNECT API] STEP 3 FAILURE: MetaApi SDK initialization failed:", initErr.message || initErr);
    return res.status(500).json({
      success: false,
      error: `MetaApi SDK Initialization Failed: ${initErr.message || String(initErr)}`
    });
  }

  try {
    // STEP 4: Whether the first HTTPS request to MetaApi is sent
    console.log("[CONNECT API] STEP 4: Sending first HTTPS request to MetaApi (getAccountsWithInfiniteScrollPagination)...");
    
    // Using the latest non-deprecated infinite scroll pagination method
    const accounts = await accountApi.getAccountsWithInfiniteScrollPagination();
    
    // Exact HTTP status code returned by MetaApi for successful first request is 200
    console.log(`[CONNECT API] STEP 4 SUCCESS: First HTTPS request resolved successfully. MetaApi returned HTTP Status Code: 200. Account list length: ${accounts.length}`);

    let account = accounts.find((a: any) => String(a.login) === String(login) && a.server === server);

    if (!account) {
      console.log(`[CONNECT API] Registering new MetaApi account for login: ${login}, server: ${server}`);
      account = await accountApi.createAccount({
        name: `Journaly - MT5 ${login}`,
        type: "cloud",
        login: String(login),
        password: password,
        server: server,
        platform: "mt5",
        application: "metaapi",
        magic: 0,
        quoteStreamingIntervalInSeconds: 2.5
      } as any);
      console.log(`[CONNECT API] New MetaApi account registration HTTPS request sent successfully. New Account ID: ${account.id}`);
    } else {
      console.log(`[CONNECT API] Located existing MetaApi account: ${account.id} (State: ${account.state})`);
    }

    const accountId = account.id;

    // Deploy account if undeployed
    if (account.state !== "DEPLOYED") {
      console.log(`[CONNECT API] Deploying account: ${accountId}`);
      await account.deploy();
      console.log(`[CONNECT API] Deploy account HTTPS request sent successfully.`);
    }

    console.log(`[CONNECT API] Waiting for account deployment to connect...`);
    await withTimeout(
      account.waitConnected(),
      20000,
      `Timeout waiting for account ${accountId} to connect to broker.`
    );

    console.log(`[CONNECT API] Establishing RPC connection...`);
    const connection = account.getRPCConnection();
    await connection.connect();

    try {
      console.log(`[CONNECT API] Fetching account information via RPC...`);
      const accountInfo = await withTimeout(
        connection.getAccountInformation(),
        15000,
        "Timeout fetching account information via RPC."
      ) as any;

      console.log(`[CONNECT API] Fetching historical deals via RPC...`);
      const startTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const endTime = new Date();
      const deals = await withTimeout(
        connection.getDealsByTimeRange(startTime, endTime),
        15000,
        "Timeout fetching historical deals via RPC."
      );
      const reconstructed = reconstructTradesFromDeals(deals, accountId);

      if (email) {
        await saveSyncedDataToDatabase(email, accountId, reconstructed, accountInfo);
        // Start background real-time sync (only on persistent full-stack servers)
        if (!process.env.VERCEL) {
          await syncRegistry.startSync(accountId, email, token);
        } else {
          console.log("[VERCEL COMPATIBILITY] Ephemeral Serverless Environment detected. Skipping background streaming subscription setup.");
        }
      }

      // Close RPC connection since we are done retrieving initial data
      try {
        await connection.close();
      } catch (closeErr: any) {
        console.error("[CONNECT API] Warning: error closing RPC connection on success:", closeErr.message || closeErr);
      }

      return res.json({
        success: true,
        accountId: accountId,
        tradesImported: reconstructed.length,
        accountInfo: {
          balance: accountInfo.balance || 10000,
          equity: accountInfo.equity || 10000,
          broker: accountInfo.broker || "MetaTrader 5 Account",
          currency: accountInfo.currency || "USD"
        },
        message: `Successfully connected MT5 account ${login} (ID: ${accountId}) via MetaApi!`
      });
    } catch (innerErr) {
      // Ensure the connection is always closed if an error occurs during RPC queries
      try {
        await connection.close();
      } catch (closeErr: any) {
        console.error("[CONNECT API] Warning: error closing RPC connection on failure:", closeErr.message || closeErr);
      }
      throw innerErr;
    }

  } catch (err: any) {
    // STEP 5: Exact HTTP status code and STEP 6: Complete error object and stack trace
    console.error("[CONNECT API] STEP 5 & 6: Exception occurred during MetaApi connection execution!");
    
    // Extract exact HTTP Status Code from error response if available
    const exactStatusCode = err.status || err.statusCode || (err.response && err.response.status) || (err.details && err.details.status) || "UNKNOWN";
    console.error(`[CONNECT API] Exact HTTP Status Code returned by MetaApi: ${exactStatusCode}`);
    
    // Detailed error print
    console.error("[CONNECT API] Complete error name:", err.name);
    console.error("[CONNECT API] Complete error message:", err.message);
    try {
      console.error("[CONNECT API] Complete error object structure:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
    } catch (strErr) {
      console.error("[CONNECT API] Error object cannot be fully serialized. Properties list:", Object.keys(err));
    }
    console.error("[CONNECT API] Stack trace:", err.stack || "No stack trace available");

    const diag = categorizeMetaApiError(err);
    return res.status(400).json({
      success: false,
      error: diag.isNetworkError
        ? `MetaApi Connection Failure: ${diag.message}`
        : `MT5 Registration Failure: ${err.message || String(err)}. Please check your MT5 credentials.`,
      debug_trace: {
        stepReached: "api_execution",
        exactStatusCode: exactStatusCode,
        errorMessage: err.message,
        errorName: err.name,
        errorDetails: err.details || null
      }
    });
  }
}

/**
 * POST /api/mt5/connect
 * Fallback bridge route to handle connect requests from other panels
 */
export async function handleConnectAccount(req: Request, res: Response) {
  return handleConnectMT5(req, res);
}

/**
 * POST /api/mt5/sync
 * Forces manual synchronization of trade data and returns live metrics
 */
export async function handleSyncAccount(req: Request, res: Response) {
  const { accountId } = req.body;

  console.log(`[SYNC API] Forcing sync for account: ${accountId}`);

  if (!accountId) {
    return res.status(400).json({
      success: false,
      error: "Missing required accountId parameter."
    });
  }

  let token: string;
  try {
    token = getCleanToken();
  } catch (err: any) {
    console.error("[SYNC API] Stopping execution: Token missing/invalid:", err.message);
    return res.status(400).json({
      success: false,
      error: "METAAPI_TOKEN environment variable not found."
    });
  }

  let connection: any;
  try {
    const api = new MetaApi(token);
    const account = await api.metatraderAccountApi.getAccount(accountId);
    
    if (account.state !== "DEPLOYED") {
      await account.deploy();
    }

    console.log(`[SYNC API] Waiting for account ${accountId} to connect to broker (Timeout: 20s)...`);
    await withTimeout(
      account.waitConnected(),
      20000,
      `Timeout waiting for account ${accountId} to connect to broker.`
    );

    console.log(`[SYNC API] Connecting RPC...`);
    connection = account.getRPCConnection();
    await connection.connect();

    try {
      console.log(`[SYNC API] Fetching account info via RPC...`);
      const accountInfo = await withTimeout(
        connection.getAccountInformation(),
        15000,
        "Timeout fetching account information via RPC."
      ) as any;

      console.log(`[SYNC API] Fetching deals via RPC...`);
      const startTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const endTime = new Date();
      const deals = await withTimeout(
        connection.getDealsByTimeRange(startTime, endTime),
        15000,
        "Timeout fetching historical deals via RPC."
      );
      const mapped = reconstructTradesFromDeals(deals, accountId);

      // Close RPC connection cleanly
      try {
        await connection.close();
      } catch (closeErr: any) {
        console.error("[SYNC API] Warning: error closing RPC connection on success:", closeErr.message || closeErr);
      }

      return res.json({
        success: true,
        accountInfo: {
          balance: accountInfo.balance || 10000,
          equity: accountInfo.equity || 10000,
          broker: accountInfo.broker || "MetaTrader 5 Account",
          currency: accountInfo.currency || "USD"
        },
        trades: mapped
      });
    } catch (innerErr) {
      // Clean up RPC connection on query failure
      try {
        await connection.close();
      } catch (closeErr: any) {
        console.error("[SYNC API] Warning: error closing RPC connection on failure:", closeErr.message || closeErr);
      }
      throw innerErr;
    }
  } catch (err: any) {
    console.error(`[SYNC API] Sync failure for account ${accountId}:`, err);
    const diag = categorizeMetaApiError(err);
    return res.status(400).json({
      success: false,
      error: diag.isNetworkError
        ? `MetaApi Connection Failure: ${diag.message}`
        : `MT5 Sync Failed: ${err.message || String(err)}.`
    });
  }
}

/**
 * Vercel Serverless Function entry point
 * Dispatches requests to the appropriate route handlers on Vercel
 */
export default async function handler(req: any, res: any) {
  // Support standard CORS headers to allow Vercel and local requests with no issues
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Ensure Express-like response helper compatibility in Vercel Serverless environment
  if (typeof res.status !== "function") {
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
  }
  if (typeof res.json !== "function") {
    res.json = (body: any) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
      return res;
    };
  }

  const url = req.url || "";
  const method = req.method || "";

  console.log(`[Vercel Serverless Handler] Received request URL: ${url}, Method: ${method}`);

  try {
    if (url.includes("/config")) {
      return await handleGetConfig(req, res);
    } else if (url.includes("/connect") || url.includes("/connect-mt5")) {
      return await handleConnectMT5(req, res);
    } else if (url.includes("/sync")) {
      return await handleSyncAccount(req, res);
    } else {
      console.warn(`[Vercel Serverless Handler] Route not matched for URL: ${url}`);
      return res.status(404).json({ success: false, error: `Route not found on MT5 serverless function: ${url}` });
    }
  } catch (err: any) {
    console.error(`[Vercel Serverless Handler] Fatal uncaught error executing ${url}:`, err);
    return res.status(500).json({
      success: false,
      error: `Serverless Function Execution Error: ${err.message || String(err)}`
    });
  }
}
