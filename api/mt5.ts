import "./patch";
import { Request, Response } from "express";
import dns from "dns";

let MetaApi: any;
let SynchronizationListener: any;
let MetaStats: any;
let MemoryHistoryStorage: any;
let isMetaApiLoaded = false;
let metaApiLoadError: any = null;

async function ensureMetaApiLoaded() {
  if (isMetaApiLoaded) return;
  try {
    console.log("[METAAPI] Dynamically importing metaapi.cloud-sdk/node...");
    const pkgName = "metaapi.cloud-sdk" + "/node";
    const MetaApiPkg = await import(pkgName) as any;
    if (MetaApiPkg) {
      // 1. Resolve MetaApi constructor supporting all possible module export formats and bundler wrappers
      const candidates = [
        MetaApiPkg.MetaApi,
        MetaApiPkg.default && MetaApiPkg.default.MetaApi,
        MetaApiPkg.default && MetaApiPkg.default.default && MetaApiPkg.default.default.MetaApi,
        MetaApiPkg.default && MetaApiPkg.default.default,
        MetaApiPkg.default,
        MetaApiPkg
      ];

      for (const candidate of candidates) {
        if (typeof candidate === "function" && (candidate.name === "MetaApi" || (candidate.prototype && candidate.prototype.metatraderAccountApi))) {
          MetaApi = candidate;
          break;
        }
      }

      // If no perfect match is found by class name or prototype property, fallback to any function in the candidates
      if (!MetaApi) {
        for (const candidate of candidates) {
          if (typeof candidate === "function") {
            MetaApi = candidate;
            break;
          }
        }
      }

      if (typeof MetaApi !== "function") {
        console.warn("[METAAPI WARNING] Auto-resolver failed to find a function. Attempting raw assignments...");
        MetaApi = MetaApiPkg.default || MetaApiPkg;
      }

      // 2. Resolve other package components supportively
      const syncCandidates = [
        MetaApiPkg.SynchronizationListener,
        MetaApiPkg.default && MetaApiPkg.default.SynchronizationListener,
        MetaApiPkg.default && MetaApiPkg.default.default && MetaApiPkg.default.default.SynchronizationListener,
        MetaApi && (MetaApi as any).SynchronizationListener,
        MetaApiPkg.default && (MetaApiPkg.default as any).SynchronizationListener
      ];
      for (const candidate of syncCandidates) {
        if (candidate) {
          SynchronizationListener = candidate;
          break;
        }
      }

      const statsCandidates = [
        MetaApiPkg.MetaStats,
        MetaApiPkg.default && MetaApiPkg.default.MetaStats,
        MetaApiPkg.default && MetaApiPkg.default.default && MetaApiPkg.default.default.MetaStats,
        MetaApi && (MetaApi as any).MetaStats,
        MetaApiPkg.default && (MetaApiPkg.default as any).MetaStats
      ];
      for (const candidate of statsCandidates) {
        if (candidate) {
          MetaStats = candidate;
          break;
        }
      }

      const storageCandidates = [
        MetaApiPkg.MemoryHistoryStorage,
        MetaApiPkg.default && MetaApiPkg.default.MemoryHistoryStorage,
        MetaApiPkg.default && MetaApiPkg.default.default && MetaApiPkg.default.default.MemoryHistoryStorage,
        MetaApi && (MetaApi as any).MemoryHistoryStorage,
        MetaApiPkg.default && (MetaApiPkg.default as any).MemoryHistoryStorage
      ];
      for (const candidate of storageCandidates) {
        if (candidate) {
          MemoryHistoryStorage = candidate;
          break;
        }
      }
      
      console.log("[METAAPI] Dynamically loaded MetaApi package components successfully. Type of MetaApi:", typeof MetaApi);
      if (typeof MetaApi !== "function") {
        throw new Error("Resolved MetaApi is not a constructor/function. Please check your module resolution.");
      }
    }
    isMetaApiLoaded = true;
  } catch (err: any) {
    metaApiLoadError = err;
    console.error("[METAAPI DYNAMIC LOAD ERROR] Failed to import metaapi.cloud-sdk/node:", err);
    throw new Error(`MetaApi SDK is not available in this environment. Error: ${err.message || String(err)}`);
  }
}

// ============================================================================
// METAAPI DIRECT REST CLIENT FOR Ephemeral Serverless/Vercel Environments
// ============================================================================
export interface MetaApiAccount {
  id: string;
  _id?: string;
  name: string;
  type: string;
  login: string;
  password?: string;
  server: string;
  platform: string;
  state: "DRAFT" | "DEPLOYING" | "DEPLOYED" | "UNDEPLOYED" | "DELETING";
  connectionStatus: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "DISCONNECTING";
  metastatsApiEnabled: boolean;
  region: string;
  accountReplicas?: Array<{
    _id: string;
    region: string;
    state: string;
  }>;
}

export class MetaApiRestClient {
  private token: string;
  // Requirement 1: Confirm request goes to real MetaApi endpoint (https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai)
  private clientEndpoint: string = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai";
  private provisioningEndpoint: string = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
  private resolvedDomain: string | null = null;

  constructor(token: string) {
    this.token = token;
  }

  // Requirement 2: Send token in auth-token header + User-Agent to avoid WAF 403 HTML blocks
  private getAuthHeaders(): Record<string, string> {
    return {
      "auth-token": this.token,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
  }

  // Requirement 4: Read response.text() first and only JSON.parse when content-type is JSON
  private async safeRequest(path: string, options: any = {}): Promise<any> {
    const headers = {
      ...this.getAuthHeaders(),
      ...(options.headers || {})
    };

    // Try primary client endpoint first (Requirement 1)
    const primaryUrl = `${this.clientEndpoint}${path}`;
    const fallbackUrl = `${this.provisioningEndpoint}${path}`;

    let lastError: any = null;
    let attemptedUrls = [primaryUrl, fallbackUrl];

    for (const targetUrl of attemptedUrls) {
      try {
        console.log(`[METAAPI REST] Calling MetaApi endpoint: ${targetUrl}`);
        const res = await fetch(targetUrl, {
          ...options,
          headers
        });

        const status = res.status;
        const contentType = res.headers.get("content-type") || "";
        const rawText = await res.text();

        let parsedJson: any = null;
        let isJson = contentType.includes("application/json");

        if (isJson) {
          try {
            parsedJson = JSON.parse(rawText);
          } catch (jsonErr: any) {
            console.warn(`[METAAPI REST] Content-Type indicated JSON but parsing failed:`, jsonErr.message);
          }
        }

        // If client endpoint returned 404 HTML (e.g. Nginx 404 Not Found), try fallback provisioning endpoint
        if (!res.ok && (status === 404 || status === 405) && targetUrl === primaryUrl) {
          console.log(`[METAAPI REST] ${primaryUrl} returned HTTP ${status}. Routing to provisioning endpoint ${fallbackUrl}...`);
          continue;
        }

        if (!res.ok) {
          // Detect HTML 403 or HTML errors
          if (status === 403) {
            if (parsedJson && (parsedJson.message || parsedJson.error)) {
              const msg = parsedJson.message || parsedJson.error;
              const err: any = new Error(msg);
              err.status = 403;
              err.statusCode = 403;
              err.responseBody = parsedJson;
              throw err;
            } else if (!isJson && (rawText.includes("<html>") || rawText.includes("403 Forbidden"))) {
              const err: any = new Error(`MetaApi Cloud Gateway returned 403 Forbidden (HTML response). The request reached MetaApi servers but was rejected. Please verify that your auth-token is active and has sufficient permissions.`);
              err.status = 403;
              err.statusCode = 403;
              err.responseBody = rawText;
              throw err;
            }
          }

          const errMsg = parsedJson ? (parsedJson.message || parsedJson.error || JSON.stringify(parsedJson)) : rawText;
          const err: any = new Error(`MetaApi request to ${targetUrl} failed (HTTP ${status}): ${errMsg}`);
          err.status = status;
          err.statusCode = status;
          err.responseBody = parsedJson || rawText;
          throw err;
        }

        // Response is OK (2xx)
        if (parsedJson !== null) {
          return parsedJson;
        }
        return rawText;
      } catch (err: any) {
        lastError = err;
        // If this was network failure on primaryUrl, try fallbackUrl
        if (targetUrl === primaryUrl && !err.status) {
          console.warn(`[METAAPI REST] Primary endpoint error (${err.message}). Trying fallback endpoint...`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error(`Failed to contact MetaApi endpoints: ${attemptedUrls.join(", ")}`);
  }

  private async getResolvedDomain(): Promise<string> {
    if (this.resolvedDomain) return this.resolvedDomain;
    try {
      console.log("[REST CLIENT] Resolving MetaStats server domain...");
      const data = await this.safeRequest("/users/current/servers/mt-client-api", { method: "GET" });
      if (data && data.domain) {
        this.resolvedDomain = data.domain;
        console.log(`[REST CLIENT] Resolved server domain: ${this.resolvedDomain}`);
        return this.resolvedDomain;
      }
    } catch (err: any) {
      console.warn("[REST CLIENT] Dynamic domain resolution failed, using fallback:", err.message || err);
    }
    this.resolvedDomain = "agiliumtrade.ai";
    return this.resolvedDomain;
  }

  async getAccounts(): Promise<MetaApiAccount[]> {
    const accounts = await this.safeRequest("/users/current/accounts", { method: "GET" });
    const list = Array.isArray(accounts) ? accounts : [];
    return list.map((a: any) => ({
      ...a,
      id: a.id || a._id,
      metastatsApiEnabled: !!a.metastatsApiEnabled
    }));
  }

  async getAccount(accountId: string): Promise<MetaApiAccount> {
    const a = await this.safeRequest(`/users/current/accounts/${accountId}`, { method: "GET" });
    return {
      ...a,
      id: a.id || a._id,
      metastatsApiEnabled: !!a.metastatsApiEnabled
    };
  }

  async createAccount(params: any): Promise<MetaApiAccount> {
    const payload = {
      reliability: "regular",
      ...params
    };
    const a = await this.safeRequest("/users/current/accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return {
      ...a,
      id: a.id || a._id,
      metastatsApiEnabled: !!a.metastatsApiEnabled
    };
  }

  async deploy(accountId: string): Promise<void> {
    await this.safeRequest(`/users/current/accounts/${accountId}/deploy`, { method: "POST" });
  }

  async updateAccount(accountId: string, params: any): Promise<void> {
    await this.safeRequest(`/users/current/accounts/${accountId}`, {
      method: "PUT",
      body: JSON.stringify(params)
    });
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.safeRequest(`/users/current/accounts/${accountId}`, { method: "DELETE" });
  }

  async undeploy(accountId: string): Promise<void> {
    await this.safeRequest(`/users/current/accounts/${accountId}/undeploy`, { method: "POST" });
  }

  async enableMetaStatsApi(accountId: string): Promise<void> {
    await this.safeRequest(`/users/current/accounts/${accountId}/enable-metastats-api`, { method: "POST" });
  }

  async getMetrics(accountId: string, account?: MetaApiAccount): Promise<any> {
    const acc = account || await this.getAccount(accountId);
    let region = acc.region || "vint-hill";
    if (acc.accountReplicas && acc.accountReplicas.length > 0) {
      const deployedReplica = acc.accountReplicas.find(r => r.state === "DEPLOYED");
      if (deployedReplica) {
        region = deployedReplica.region;
      }
    }
    const domain = await this.getResolvedDomain();
    const url = `https://metastats-api-v1.${region}.${domain}/users/current/accounts/${accountId}/metrics`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: this.getAuthHeaders()
    });
    const rawText = await res.text();
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      throw new Error(`Failed to fetch metrics (HTTP ${res.status}): ${rawText}`);
    }
    if (contentType.includes("application/json")) {
      return JSON.parse(rawText);
    }
    return rawText;
  }

  async getAccountTrades(accountId: string, startTime: string, endTime: string, account?: MetaApiAccount): Promise<any[]> {
    const acc = account || await this.getAccount(accountId);
    let region = acc.region || "vint-hill";
    if (acc.accountReplicas && acc.accountReplicas.length > 0) {
      const deployedReplica = acc.accountReplicas.find(r => r.state === "DEPLOYED");
      if (deployedReplica) {
        region = deployedReplica.region;
      }
    }
    const domain = await this.getResolvedDomain();
    const url = `https://metastats-api-v1.${region}.${domain}/users/current/accounts/${accountId}/historical-trades/${encodeURIComponent(startTime)}/${encodeURIComponent(endTime)}`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: this.getAuthHeaders()
    });
    const rawText = await res.text();
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      throw new Error(`Failed to fetch historical trades (HTTP ${res.status}): ${rawText}`);
    }
    let data: any = rawText;
    if (contentType.includes("application/json")) {
      data = JSON.parse(rawText);
    }
    return (data && data.trades) ? data.trades : (Array.isArray(data) ? data : []);
  }
}

function createCustomSyncListener(email: string, accountId: string, connection: any) {
  const BaseClass = SynchronizationListener || class {};
  const CustomSyncListener = class extends BaseClass {
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
        const updateData: any = {
          mt5SyncedAt: new Date().toISOString()
        };
        if (typeof accountInformation?.balance === 'number') {
          updateData.mt5Balance = accountInformation.balance;
        }
        if (typeof accountInformation?.equity === 'number') {
          updateData.mt5Equity = accountInformation.equity;
        }
        if (typeof accountInformation?.margin === 'number') {
          updateData.mt5Margin = accountInformation.margin;
        }
        await updateUserProfile(this.email, updateData);
      } catch (err) {
        console.error(`[STREAMING] Failed to handle onAccountInformationUpdated event for ${this.email}:`, err);
      }
    }
  };
  return new CustomSyncListener(email, accountId, connection);
}

import { collection, query, where, getDocs } from "firebase/firestore";
import { db, saveTradeToFirestore, updateUserProfile } from "../src/lib/firebase";

// Safe dynamic fetch using native globalThis.fetch if available
const fetch = typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
  ? globalThis.fetch
  : (...args: any[]) => import("node-fetch").then(({ default: f }) => (f as any)(...args));

function serializeError(err: any) {
  if (!err) return null;
  return {
    name: err.name || "Error",
    message: err.message || String(err),
    stack: err.stack,
    status: err.status,
    statusCode: err.status || err.statusCode || (err.response && err.response.status) || (err.details && err.details.status) || 500,
    responseBody: err.response?.data || err.details || null,
    requestUrl: err.response?.config?.url || null,
    metaapiError: {
      ...err,
      name: err.name,
      message: err.message,
      stack: err.stack,
      status: err.status,
      statusCode: err.statusCode || err.status,
      details: err.details,
      stringRepresentation: String(err)
    }
  };
}

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
 * Converts MetaStats REST API trades into the unified trade schema.
 */
function convertMetaStatsTradesToAppTrades(metastatsTrades: any[], accountId: string): any[] {
  if (!metastatsTrades || !Array.isArray(metastatsTrades)) return [];
  return metastatsTrades.map((t: any) => {
    const openTimeISO = t.openTime ? new Date(t.openTime).toISOString() : new Date().toISOString();
    const closeTimeISO = t.closeTime ? new Date(t.closeTime).toISOString() : new Date().toISOString();
    const closeDate = closeTimeISO.split("T")[0];
    
    return {
      id: `mt5-metastats-${t._id}`,
      pair: t.symbol ? String(t.symbol).toUpperCase() : "EURUSD",
      type: String(t.type).toUpperCase() === "BUY" ? "BUY" : "SELL",
      risk: 0,
      pl: Number(t.profit) + (Number(t.commission) || 0) + (Number(t.swap) || 0),
      emotion: "Disciplined",
      date: closeDate,
      notes: `MT5 Auto-Sync (MetaStats REST API). Trade ID: ${t._id}. Gain: ${t.gain || 0}%. Comment: ${t.comment || ""}.`,
      source: "mt5",
      mt5DealId: String(t._id),
      volume: Number(t.volume) || 1.0,
      commission: Number(t.commission) || 0,
      swap: Number(t.swap) || 0,
      ticket: String(t._id),
      symbol: t.symbol ? String(t.symbol).toUpperCase() : "EURUSD",
      buySell: String(t.type).toUpperCase() === "BUY" ? "BUY" : "SELL",
      openTime: openTimeISO,
      closeTime: closeTimeISO,
      openPrice: Number(t.openPrice) || 0,
      closePrice: Number(t.closePrice) || 0,
      stopLoss: Number(t.stopLoss) || 0,
      takeProfit: Number(t.takeProfit) || 0,
      profit: Number(t.profit) || 0,
      magicNumber: Number(t.magic) || 0,
      comment: t.comment || ""
    };
  });
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
    const profileUpdate: any = {
      mt5Connected: true,
      mt5AccountId: accountId,
      mt5Broker: accountInfo.broker || "DerivSVG-Server-02",
      mt5SyncedAt: new Date().toISOString()
    };
    if (typeof accountInfo.balance === 'number' && accountInfo.balance > 0) {
      profileUpdate.mt5Balance = accountInfo.balance;
    }
    if (typeof accountInfo.equity === 'number' && accountInfo.equity > 0) {
      profileUpdate.mt5Equity = accountInfo.equity;
    }
    if (typeof accountInfo.margin === 'number') {
      profileUpdate.mt5Margin = accountInfo.margin;
    }
    await updateUserProfile(email, profileUpdate);
  } catch (err) {
    console.error(`[SYNC ENGINE] Error saving synced data to Firestore for user ${email}:`, err);
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

    const METAAPI_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!accountId || !METAAPI_UUID_REGEX.test(accountId)) {
      console.log(`[REGISTRY] Account ID ${accountId} is a direct broker credential identifier or non-cloud account. Skipping MetaApi cloud sync.`);
      return;
    }

    this.pendingSyncs.add(accountId);
    console.log(`[REGISTRY] Bootstrapping real background sync for ${accountId} (${email}) - Attempt #${attempt}`);

    let connection: any;
    try {
      await ensureMetaApiLoaded();
      const api = new MetaApi(token);
      
      // Fetch account with graceful not-found handling
      let account: any;
      try {
        account = await api.metatraderAccountApi.getAccount(accountId);
      } catch (getErr: any) {
        const getErrMsg = getErr.message || String(getErr);
        const isNotFound = getErrMsg.toLowerCase().includes("not found") || 
                           getErrMsg.includes("NotFound") || 
                           getErr.status === 404 || 
                           getErr.statusCode === 404 ||
                           (getErr.response && getErr.response.status === 404);
        if (isNotFound) {
          console.log(`[REGISTRY] Account ${accountId} not found on MetaApi cloud. Halting sync for ${email}.`);
          this.pendingSyncs.delete(accountId);
          try {
            await updateUserProfile(email, {
              mt5Connected: false,
              mt5AccountId: null
            });
          } catch {}
          return;
        }
        throw getErr;
      }
      
      // Ensure deployed with graceful top-up handling
      if (account.state !== "DEPLOYED") {
        console.log(`[REGISTRY] Account ${accountId} state is ${account.state}. Triggering deployment...`);
        try {
          await account.deploy();
        } catch (depErr: any) {
          const depErrMsg = (depErr.message || String(depErr)).toLowerCase();
          const isTopUpNotice = depErrMsg.includes("top up") || 
                                depErrMsg.includes("trading account deployment") ||
                                depErrMsg.includes("replicas deployed") ||
                                depErrMsg.includes("high reliability");
          if (isTopUpNotice) {
            console.log(`[REGISTRY] Account ${accountId} (${email}) requires prepaid balance top-up on MetaApi (https://app.metaapi.cloud/billing). Halting background deployment without error.`);
            this.pendingSyncs.delete(accountId);
            return;
          }
          throw depErr;
        }
      }

      // Wait for account connection with a 15-second timeout
      console.log(`[REGISTRY] Waiting for account ${accountId} to connect to broker (Timeout: 15s)...`);
      await withTimeout(
        account.waitConnected(),
        15000,
        `Timeout waiting for account ${accountId} to connect to broker. Current status: ${account.connectionStatus}`
      );

      // Retrieve streaming connection
      const storage = new MemoryHistoryStorage();
      connection = account.getStreamingConnection(storage);
      await connection.connect();

      // Wait for synchronization with a 15-second timeout
      console.log(`[REGISTRY] Waiting for streaming synchronization on account ${accountId} (Timeout: 15s)...`);
      await withTimeout(
        connection.waitSynchronized(),
        15000,
        `Timeout waiting for streaming connection to synchronize on account ${accountId}`
      );

      // Register live synchronization listener
      const listener = createCustomSyncListener(email, accountId, connection);
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
          console.log(`[REGISTRY] 🛑 Closing connection for ${accountId} after failure.`);
          await connection.close();
        } catch (closeErr: any) {
          console.warn(`[REGISTRY] Notice closing connection for ${accountId} during cleanup:`, closeErr.message || closeErr);
        }
      }

      const errMsg = err.message || String(err);
      const fullErrLower = (errMsg + " " + (err?.details || "")).toLowerCase();

      // Check if it's an authorization/token error (401 Unauthorized / invalid auth-token)
      const isAuthError = fullErrLower.includes("401") || 
                          fullErrLower.includes("unauthorized") || 
                          fullErrLower.includes("invalid auth-token") ||
                          fullErrLower.includes("failed to authorize user") ||
                          err.status === 401 ||
                          err.statusCode === 401;

      if (isAuthError) {
        console.log(`[REGISTRY] MetaApi Token authorization expired or invalid (401 Unauthorized) for ${accountId} (${email}).`);
        return; // Halt retry loop
      }

      // Check if MetaApi account requires prepaid balance top-up or has no deployed replicas
      const isTopUpOrReplicaNotice = fullErrLower.includes("top up") || 
                                     fullErrLower.includes("replicas deployed") || 
                                     fullErrLower.includes("trading account deployment") ||
                                     fullErrLower.includes("high reliability");

      if (isTopUpOrReplicaNotice) {
        console.log(`[REGISTRY] MT5 Account ${accountId} (${email}) requires prepaid balance top-up on MetaApi (https://app.metaapi.cloud/billing). Halting background sync.`);
        return; // Halt retry loop cleanly without error
      }

      // Check if the account was NOT FOUND on MetaApi (fatal / deleted / expired)
      const isNotFound = fullErrLower.includes("not found") || 
                         fullErrLower.includes("notfound") || 
                         err.status === 404 || 
                         err.statusCode === 404 ||
                         (err.response && err.response.status === 404);
      
      if (isNotFound) {
        console.log(`[REGISTRY] MT5 Account ${accountId} was not found on MetaApi. Halting sync for ${email}.`);
        try {
          await updateUserProfile(email, {
            mt5Connected: false,
            mt5AccountId: null,
            mt5Broker: null,
            mt5Balance: null,
            mt5Equity: null,
            mt5SyncedAt: null
          });
        } catch (dbErr: any) {
          console.warn(`[REGISTRY] Notice updating profile for ${email}:`, dbErr.message || dbErr);
        }
        return; // Halt retry loop
      }
      
      // If we hit subscription quota limit, fallback to poll-based RPC sync immediately
      if (errMsg.includes("quota") || errMsg.includes("limit") || errMsg.includes("TooManyRequestsError") || err.status === 429) {
        console.log(`[REGISTRY] Streaming quota limit reached. Falling back to poll-based RPC background sync for ${accountId} (${email})`);
        this.startRpcPollSync(accountId, email, token);
        return;
      }

      // Check if it's a Broker Connection / Timeout error
      const isBrokerConnectionIssue = errMsg.includes("not connected to broker yet") || 
                                      err.name === "TimeoutError" || 
                                      errMsg.includes("TimeoutError");

      if (isBrokerConnectionIssue && attempt >= 2) {
        console.log(`[REGISTRY] MT5 Account ${accountId} failed broker connection after multiple attempts.`);
        return;
      }

      // Reconnection backoff calculation: starts at 15s, then 45s
      if (attempt < 2) {
        const delay = attempt === 0 ? 15000 : 45000;
        console.log(`[REGISTRY] Scheduling reconnection attempt #${attempt + 1} for ${accountId} in ${delay / 1000}s`);
        
        const timeout = setTimeout(() => {
          this.startSync(accountId, email, token, attempt + 1);
        }, delay);
        this.reconnectTimeouts.set(accountId, timeout);
      }
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
        const errMsg = err.message || String(err);
        console.error(`[REGISTRY POLL] Error during background RPC poll for ${email}:`, errMsg);

        const isNotFound = errMsg.toLowerCase().includes("not found") || 
                           errMsg.includes("NotFound") || 
                           err.status === 404 || 
                           err.statusCode === 404 ||
                           (err.response && err.response.status === 404);

        if (isNotFound) {
          console.warn(`[REGISTRY POLL] 🛑 Account ${accountId} not found on MetaApi during RPC poll. Disconnecting profile ${email}.`);
          try {
            await updateUserProfile(email, {
              mt5Connected: false,
              mt5AccountId: null,
              mt5Broker: null,
              mt5Balance: null,
              mt5Equity: null,
              mt5SyncedAt: null
            });
            if (mockInterval) {
              clearInterval(mockInterval);
            }
            this.activeConnections.delete(accountId);
          } catch (dbErr: any) {
            console.error(`[REGISTRY POLL] Failed to disconnect profile ${email}:`, dbErr.message || dbErr);
          }
        }
      }
    };

    // Run first iteration immediately
    runPoll();

    // Poll every 3 minutes
    const mockInterval = setInterval(runPoll, 1000 * 60 * 3);
    
    this.activeConnections.set(accountId, { api: null, connection: null, listener: null, email, mockInterval });
  }

  /**
   * Safe no-op for legacy simulation references
   */
  startMockSync(accountId: string, email: string) {
    console.log(`[REGISTRY] Simulation mode is disabled. Real accounts must be deployed directly. Account: ${accountId}, Email: ${email}`);
  }

  /**
   * Initializes background sync for all users who have MT5 connected
   */
  async initializeAllConnections() {
    try {
      const dbUsers = await getConnectedMT5Users();
      console.log(`[REGISTRY] Found ${dbUsers.length} premium users with MT5 connected on server startup.`);
      
      let token: string | null = null;
      try {
        token = getCleanToken();
      } catch (tokenErr) {
        console.warn("[REGISTRY] No global MetaApi token configured. Real accounts will await user token.");
      }

      const METAAPI_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      for (const user of dbUsers) {
        if (!user.mt5AccountId) continue;
        const isMockAccount = user.mt5AccountId.startsWith("mock-") || 
                              user.mt5AccountId.includes("sandbox");
        if (isMockAccount) {
          console.log(`[REGISTRY] Ignoring legacy mock account ${user.mt5AccountId} for ${user.email}`);
          continue;
        }
        if (!METAAPI_UUID_REGEX.test(user.mt5AccountId)) {
          console.log(`[REGISTRY] Skipping non-cloud MT5 account ID ${user.mt5AccountId} for ${user.email}`);
          continue;
        }
        if (token) {
          this.startSync(user.mt5AccountId, user.email, token);
        }
      }
    } catch (err: any) {
      console.error("[REGISTRY] Failed to load active MT5 connections on startup:", err.message || err);
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
export function getCleanToken(customToken?: string): string {
  // Check if a custom token was provided via request payload or header
  let rawToken = (customToken && typeof customToken === "string" && customToken.trim().length > 0)
    ? customToken
    : (process.env.METAAPI_TOKEN || 
       process.env.METAAPI_API_TOKEN || 
       process.env.VITE_METAAPI_TOKEN || 
       process.env.VITE_METAAPI_API_TOKEN);

  // Log token loading status (safely without exposing its value)
  console.log(`[METAAPI_AUTH] Checking token environment variables. Custom token provided: ${!!customToken}, Token present: ${!!rawToken}`);

  if (!rawToken) {
    console.error("[METAAPI_AUTH] No METAAPI_TOKEN, METAAPI_API_TOKEN, VITE_METAAPI_TOKEN, or VITE_METAAPI_API_TOKEN variable is set in the environment.");
    throw new Error("METAAPI_TOKEN, METAAPI_API_TOKEN, VITE_METAAPI_TOKEN, or VITE_METAAPI_API_TOKEN environment variable not found. Please set it in Vercel or AI Studio environment configuration.");
  }

  let token = rawToken.trim();

  // Strip enclosing quotes if present (often happens when pasting into .env or settings UI)
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    console.log("[METAAPI_AUTH] Stripping surrounding quotes from the token...");
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

  const { login, password, server, email, accountId: directAccountId } = req.body;

  const diagnostics: {
    startedAt: string;
    steps: Array<{
      name: string;
      description: string;
      startedAt: string;
      completedAt?: string;
      durationMs?: number;
      status: "started" | "completed" | "failed";
      details?: any;
    }>;
    failedStep: string | null;
    error: any;
  } = {
    startedAt: new Date().toISOString(),
    steps: [],
    failedStep: null,
    error: null
  };

  function startStep(name: string, description: string) {
    console.log(`[CONNECT DIAGNOSTICS] [${new Date().toISOString()}] STARTING STEP: ${name} (${description})`);
    diagnostics.steps.push({
      name,
      description,
      startedAt: new Date().toISOString(),
      status: "started"
    });
  }

  function completeStep(name: string, details?: any) {
    const step = diagnostics.steps.find(s => s.name === name);
    if (step) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - new Date(step.startedAt).getTime();
      step.status = "completed";
      step.details = details;
      console.log(`[CONNECT DIAGNOSTICS] [${step.completedAt}] COMPLETED STEP: ${name} in ${step.durationMs}ms`);
    }
  }

  function failStep(name: string, error: any) {
    const step = diagnostics.steps.find(s => s.name === name);
    if (step) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - new Date(step.startedAt).getTime();
      step.status = "failed";
      step.details = { error: error.message || String(error) };
      diagnostics.failedStep = name;
      console.error(`[CONNECT DIAGNOSTICS] [${step.completedAt}] FAILED STEP: ${name} in ${step.durationMs}ms. Error:`, error);
    }
  }

  console.log("[CONNECT API] Initiating connection request details:", {
    directAccountId,
    login,
    server,
    hasPassword: !!password,
    email
  });

  if (!directAccountId && (!login || !password || !server)) {
    console.error("[CONNECT API] STEP 1 FAILURE: Missing required directAccountId or login/password/server.");
    return res.status(400).json({
      success: false,
      error: "Missing required parameters. Please provide either an Account ID or Server, Login, and Password."
    });
  }

  let token: string;
  try {
    startStep("token_retrieval", "Retrieve clean MetaApi token");
    const passedToken = req.body.metaApiToken || req.body.token || (req.headers["x-metaapi-token"] as string);
    token = getCleanToken(passedToken);
    completeStep("token_retrieval");
  } catch (err: any) {
    failStep("token_retrieval", err);
    console.error("[CONNECT API] Token retrieval failed:", err);
    return res.status(400).json({
      success: false,
      error: "METAAPI_TOKEN environment variable not found.",
      message: err.message,
      stack: err.stack,
      metaapiError: serializeError(err),
      statusCode: 400,
      diagnostics
    });
  }

  if (process.env.VERCEL) {
    try {
      startStep("metaapi_init", "Initialize MetaApi Direct REST Client");
      const client = new MetaApiRestClient(token);
      completeStep("metaapi_init");

      let account: any = null;

      if (directAccountId) {
        startStep("get_account_by_id", `Query account by ID: ${directAccountId}`);
        account = await client.getAccount(directAccountId);
        completeStep("get_account_by_id", { accountId: account.id, state: account.state });
      } else {
        startStep("get_accounts", "Query registered accounts via Direct REST API");
        const accounts = await client.getAccounts();
        completeStep("get_accounts", { accountsCount: accounts.length });

        account = accounts.find((a: any) => String(a.login) === String(login) && a.server === server);

        if (account) {
          console.log(`[CONNECT API] Located existing MetaApi account via REST: ${account.id}. Updating credentials to maintain active account slot...`);
          startStep("update_account", "Update existing account credentials via Direct REST API");
          try {
            await client.updateAccount(account.id, {
              password: password,
              name: `Journaly - MT5 ${login}`
            });
            completeStep("update_account");
          } catch (updateErr: any) {
            console.warn("[CONNECT API] Update existing account via REST warning:", updateErr.message || updateErr);
          }
        }

        if (!account) {
          startStep("create_account", "Register new MT5 account on MetaApi using Direct REST API (reliability: regular)");
          account = await client.createAccount({
            name: `Journaly - MT5 ${login}`,
            type: "cloud",
            login: String(login),
            password: password,
            server: server,
            platform: "mt5",
            reliability: "regular",
            application: "metaapi",
            magic: 0,
            quoteStreamingIntervalInSeconds: 2.5
          });
          completeStep("create_account", { accountId: account.id });
        }
      }

      const connectedAccountId = account.id;

      // Always deploy/redeploy to ensure connection is refreshed and uses the new credentials
      startStep("deploy_account", "Trigger cloud deployment using Direct REST API");
      try {
        if (account.state !== "DEPLOYED") {
          await client.deploy(connectedAccountId);
        }
      } catch (depErr: any) {
        console.warn("[CONNECT API] Direct REST deploy warning (may already be deployed):", depErr.message || depErr);
      }
      try {
        const updated = await client.getAccount(connectedAccountId);
        account.state = updated.state;
        account.connectionStatus = updated.connectionStatus;
      } catch (refreshErr) {
        console.warn("[CONNECT API] Failed to refresh state after deployment:", refreshErr);
      }
      completeStep("deploy_account");

      return res.json({
        success: true,
        accountId: connectedAccountId,
        state: account.state,
        connectionStatus: account.connectionStatus,
        requiresPolling: true,
        message: "MT5 account deployed on MetaApi secure cloud. Linking broker to dashboard...",
        diagnostics
      });

    } catch (err: any) {
      failStep("account_provisioning", err);
      const exactStatusCode = err.status || err.statusCode || 400;
      const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
      diagnostics.error = serializeError(err);
      console.error("[CONNECT API] Direct REST MT5 Connection failed:", err);

      let cleanErrorMsg = err.message || String(err);
      if (cleanErrorMsg.includes("To allow high reliability please top up your account") || cleanErrorMsg.includes("top up") || cleanErrorMsg.includes("high reliability")) {
        cleanErrorMsg = `MetaApi Balance Notice: You have added your payment method, but MetaApi requires a topped-up prepaid credit (e.g. $10) at app.metaapi.cloud/billing before new cloud terminals can be provisioned via API.\n\nTwo quick ways to connect now:\n1. Top up your balance ($10) at https://app.metaapi.cloud/billing, then click Link again.\n2. OR create your MT5 account directly in the MetaApi console at https://app.metaapi.cloud/accounts, copy your Account ID, and paste it into the "Direct MetaApi Account ID" tab here to link instantly!`;
      } else if (finalStatus === 403 || cleanErrorMsg.includes("Forbidden")) {
        cleanErrorMsg = `MetaApi Cloud (HTTP 403): ${err.message || String(err)}. You can manage accounts at app.metaapi.cloud or link an existing account ID directly.`;
      }

      return res.status(finalStatus).json({
        success: false,
        error: cleanErrorMsg,
        message: cleanErrorMsg,
        stack: err.stack,
        metaapiError: serializeError(err),
        statusCode: finalStatus,
        diagnostics
      });
    }
  } else {
    let api: any;
    let accountApi: any;
    try {
      startStep("metaapi_init", "Initialize MetaApi SDK instance");
      await ensureMetaApiLoaded();
      api = new MetaApi(token);
      accountApi = api.metatraderAccountApi;
      completeStep("metaapi_init");
    } catch (initErr: any) {
      failStep("metaapi_init", initErr);
      console.error("[CONNECT API] MetaApi initialization failed:", initErr);
      return res.status(500).json({
        success: false,
        error: `MetaApi SDK Initialization Failed: ${initErr.message || String(initErr)}`,
        message: initErr.message,
        stack: initErr.stack,
        metaapiError: serializeError(initErr),
        statusCode: 500,
        diagnostics
      });
    }

    try {
      let account: any = null;

      if (directAccountId) {
        startStep("get_account_by_id", `Query account by ID: ${directAccountId}`);
        account = await accountApi.getAccount(directAccountId);
        completeStep("get_account_by_id", { accountId: account.id, state: account.state });
      } else {
        startStep("get_accounts", "Query registered accounts using getAccountsWithInfiniteScrollPagination");
        const accounts = await accountApi.getAccountsWithInfiniteScrollPagination();
        completeStep("get_accounts", { accountsCount: accounts.length });

        account = accounts.find((a: any) => String(a.login) === String(login) && a.server === server);

        if (account) {
          console.log(`[CONNECT API] Located existing MetaApi account: ${account.id}. Updating credentials to maintain active account slot...`);
          startStep("update_account", "Update existing account credentials");
          try {
            await account.update({
              password: password,
              name: `Journaly - MT5 ${login}`
            });
            completeStep("update_account");
          } catch (updateErr: any) {
            console.warn(`[CONNECT API] Failed to update existing account ${account.id}:`, updateErr.message || updateErr);
          }
        }

        if (!account) {
          startStep("create_account", "Register new MT5 account on MetaApi using createAccount (reliability: regular)");
          account = await accountApi.createAccount({
            name: `Journaly - MT5 ${login}`,
            type: "cloud",
            login: String(login),
            password: password,
            server: server,
            platform: "mt5",
            reliability: "regular",
            application: "metaapi",
            magic: 0,
            quoteStreamingIntervalInSeconds: 2.5
          } as any);
          completeStep("create_account", { accountId: account.id });
        }
      }

      const connectedAccountId = account.id;

      // Deploy if not already deployed
      startStep("deploy_account", "Trigger cloud deployment using account.deploy");
      try {
        if (account.state !== "DEPLOYED") {
          await account.deploy();
        }
      } catch (depErr: any) {
        console.warn("[CONNECT API] Account deploy warning (may already be deployed):", depErr.message || depErr);
      }
      completeStep("deploy_account");

      return res.json({
        success: true,
        accountId: connectedAccountId,
        state: account.state,
        connectionStatus: account.connectionStatus,
        requiresPolling: true,
        message: "MT5 account deployed on MetaApi secure cloud. Linking broker to dashboard...",
        diagnostics
      });

    } catch (err: any) {
      failStep("account_provisioning", err);

      const exactStatusCode = err.status || err.statusCode || (err.response && err.response.status) || (err.details && err.details.status) || 400;
      const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
      diagnostics.error = serializeError(err);

      console.error("[CONNECT API] Complete error object:", err);

      let cleanErrorMsg = err.message || String(err);
      if (cleanErrorMsg.includes("To allow high reliability please top up your account") || cleanErrorMsg.includes("top up") || cleanErrorMsg.includes("high reliability")) {
        cleanErrorMsg = `MetaApi Balance Notice: You have successfully added your payment method, but MetaApi requires a topped-up prepaid credit (e.g. $10) at app.metaapi.cloud/billing before new cloud terminals can be provisioned via API.\n\nTwo quick ways to connect now:\n1. Top up your balance ($10) at https://app.metaapi.cloud/billing, then click Link again.\n2. OR create your MT5 account directly in the MetaApi console at https://app.metaapi.cloud/accounts, copy your Account ID, and paste it into the "Direct MetaApi Account ID" tab here to link instantly!`;
      } else if (finalStatus === 403 || cleanErrorMsg.includes("Forbidden")) {
        cleanErrorMsg = `MetaApi Cloud (HTTP 403): ${err.message || String(err)}. You can manage accounts at app.metaapi.cloud or link an existing account ID directly.`;
      }

      return res.status(finalStatus).json({
        success: false,
        error: cleanErrorMsg,
        message: cleanErrorMsg,
        stack: err.stack,
        metaapiError: serializeError(err),
        statusCode: finalStatus,
        diagnostics
      });
    }
  }
}

/**
 * POST /api/mt5/status
 * Polling status and synchronous RPC data extraction endpoint
 */
export async function handleStatusAccount(req: Request, res: Response) {
  const { accountId, email } = req.body;

  const diagnostics: {
    startedAt: string;
    steps: Array<{
      name: string;
      description: string;
      startedAt: string;
      completedAt?: string;
      durationMs?: number;
      status: "started" | "completed" | "failed";
      details?: any;
    }>;
    failedStep: string | null;
    error: any;
  } = {
    startedAt: new Date().toISOString(),
    steps: [],
    failedStep: null,
    error: null
  };

  function startStep(name: string, description: string) {
    console.log(`[STATUS DIAGNOSTICS] [${new Date().toISOString()}] STARTING STEP: ${name} (${description})`);
    diagnostics.steps.push({
      name,
      description,
      startedAt: new Date().toISOString(),
      status: "started"
    });
  }

  function completeStep(name: string, details?: any) {
    const step = diagnostics.steps.find(s => s.name === name);
    if (step) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - new Date(step.startedAt).getTime();
      step.status = "completed";
      step.details = details;
      console.log(`[STATUS DIAGNOSTICS] [${step.completedAt}] COMPLETED STEP: ${name} in ${step.durationMs}ms`);
    }
  }

  function failStep(name: string, error: any) {
    const step = diagnostics.steps.find(s => s.name === name);
    if (step) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - new Date(step.startedAt).getTime();
      step.status = "failed";
      step.details = { error: error.message || String(error) };
      diagnostics.failedStep = name;
      console.error(`[STATUS DIAGNOSTICS] [${step.completedAt}] FAILED STEP: ${name} in ${step.durationMs}ms. Error:`, error);
    }
  }

  console.log(`[STATUS API] Received status request for account: ${accountId}, email: ${email}`);

  if (!accountId) {
    return res.status(400).json({
      success: false,
      error: "Missing required accountId parameter."
    });
  }

  let token: string;
  try {
    startStep("token_retrieval", "Retrieve clean MetaApi token");
    const passedToken = req.body.metaApiToken || req.body.token || (req.headers["x-metaapi-token"] as string);
    token = getCleanToken(passedToken);
    completeStep("token_retrieval");
  } catch (err: any) {
    failStep("token_retrieval", err);
    console.error("[STATUS API] Token retrieval failed:", err);
    return res.status(400).json({
      success: false,
      error: "METAAPI_TOKEN environment variable not found.",
      message: err.message,
      stack: err.stack,
      metaapiError: serializeError(err),
      statusCode: 400,
      diagnostics
    });
  }

  if (process.env.VERCEL) {
    try {
      startStep("metaapi_init", "Initialize MetaApi Direct REST Client");
      const client = new MetaApiRestClient(token);
      completeStep("metaapi_init");

      startStep("get_account", "Fetch MetaApi Metatrader account instance via Direct REST API");
      const account = await client.getAccount(accountId);
      completeStep("get_account", { state: account.state, connectionStatus: account.connectionStatus });

      if (account.state !== "DEPLOYED") {
        try {
          startStep("deploy_account", "Deploying undeployed account via Direct REST API");
          await client.deploy(accountId);
          completeStep("deploy_account");
        } catch (err: any) {
          failStep("deploy_account", err);
          const exactStatusCode = err.status || err.statusCode || 400;
          const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
          diagnostics.error = serializeError(err);
          console.error("[STATUS API] REST deploy failed:", err);

          return res.status(finalStatus).json({
            success: false,
            error: `Failed to redeploy account: ${err.message}`,
            message: err.message,
            stack: err.stack,
            metaapiError: serializeError(err),
            statusCode: finalStatus,
            diagnostics
          });
        }

        return res.json({
          success: true,
          completed: false,
          accountId,
          state: account.state,
          connectionStatus: account.connectionStatus,
          message: `Account is being deployed. Current state: ${account.state}`,
          diagnostics
        });
      }

      if (account.connectionStatus !== "CONNECTED") {
        return res.json({
          success: true,
          completed: false,
          accountId,
          state: account.state,
          connectionStatus: account.connectionStatus,
          message: `MetaApi is linking your account to MetaTrader server... Status: ${account.connectionStatus}`,
          diagnostics
        });
      }

      // If CONNECTED, perform full REST sync
      try {
        // Step A: Ensure MetaStats is enabled on the account
        startStep("enable_metastats", "Ensure MetaStats API is enabled on account via REST");
        if (!account.metastatsApiEnabled) {
          console.log(`[STATUS API] MetaStats is not enabled on account ${accountId}. Enabling it now via REST...`);
          await client.enableMetaStatsApi(accountId);
        }
        completeStep("enable_metastats");

        // Step B: Fetch account metrics via REST
        startStep("metastats_get_metrics", "Fetch live account metrics via MetaStats Direct REST API");
        const metrics = await client.getMetrics(accountId, account);
        completeStep("metastats_get_metrics", { balance: metrics.balance });

        // Step C: Fetch historical trades via REST
        startStep("metastats_get_trades", "Fetch historical trades via MetaStats Direct REST API");
        const startTime = "2020-01-01 00:00:00.000";
        const endTime = new Date().toISOString().replace("T", " ").replace("Z", "");
        const metastatsTrades = await client.getAccountTrades(accountId, startTime, endTime, account);
        completeStep("metastats_get_trades", { tradesCount: metastatsTrades?.length || 0 });

        // Step D: Reconstruct trades and save them to Firestore
        startStep("save_firestore", "Convert trades and save them to Firestore");
        const mapped = convertMetaStatsTradesToAppTrades(metastatsTrades, accountId);
        
        const accountInfo = {
          balance: typeof metrics.balance === 'number' ? metrics.balance : null,
          equity: typeof metrics.equity === 'number' ? metrics.equity : null,
          broker: account.server || "DerivSVG-Server-02",
          currency: metrics.currency || "USD"
        };

        if (email) {
          await saveSyncedDataToDatabase(email, accountId, mapped, accountInfo);
        }
        completeStep("save_firestore", { tradesImported: mapped.length });

        return res.json({
          success: true,
          completed: true,
          accountId,
          state: account.state,
          connectionStatus: account.connectionStatus,
          tradesImported: mapped.length,
          accountInfo,
          message: `Successfully synchronized and loaded ${mapped.length} trades!`,
          diagnostics
        });

      } catch (err: any) {
        failStep("data_fetch_and_sync", err);
        const exactStatusCode = err.status || err.statusCode || 400;
        const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
        diagnostics.error = serializeError(err);
        console.error("[STATUS API] REST Sync fallback execution failed:", err);
        return res.status(finalStatus).json({
          success: false,
          error: `REST Sync Execution Failed: ${err.message || String(err)}`,
          message: err.message,
          stack: err.stack,
          metaapiError: serializeError(err),
          statusCode: finalStatus,
          diagnostics
        });
      }

    } catch (err: any) {
      failStep("account_retrieval", err);
      const exactStatusCode = err.status || err.statusCode || 400;
      const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
      diagnostics.error = serializeError(err);
      console.error("[STATUS API] Direct REST Account fetch failed:", err);

      const errMsg = err.message || String(err);
      const isNotFound = errMsg.toLowerCase().includes("not found") || 
                         errMsg.includes("NotFound") || 
                         exactStatusCode === 404;

      if (isNotFound && email) {
        console.warn(`[STATUS API] REST Account ${accountId} not found on MetaApi. Disconnecting profile ${email}...`);
        try {
          await updateUserProfile(email, {
            mt5Connected: false,
            mt5AccountId: null,
            mt5Broker: null,
            mt5Balance: null,
            mt5Equity: null,
            mt5SyncedAt: null
          });
        } catch (dbErr: any) {
          console.error("[STATUS API] Failed to disconnect profile in DB:", dbErr);
        }

        return res.status(404).json({
          success: false,
          error: "MT5 account was not found on MetaApi. It has been automatically unlinked from your dashboard. Please reconnect with your valid broker credentials.",
          message: "MT5 account not found.",
          statusCode: 404,
          diagnostics
        });
      }

      return res.status(finalStatus).json({
        success: false,
        error: `Failed to fetch MetaApi account details via Direct REST: ${err.message || String(err)}`,
        message: err.message,
        stack: err.stack,
        metaapiError: serializeError(err),
        statusCode: finalStatus,
        diagnostics
      });
    }
  } else {
    let api: any;
    try {
      startStep("metaapi_init", "Initialize MetaApi SDK");
      await ensureMetaApiLoaded();
      api = new MetaApi(token);
      completeStep("metaapi_init");
    } catch (err: any) {
      failStep("metaapi_init", err);
      console.error("[STATUS API] MetaApi initialization failed:", err);
      return res.status(500).json({
        success: false,
        error: `MetaApi initialization failed: ${err.message}`,
        message: err.message,
        stack: err.stack,
        metaapiError: serializeError(err),
        statusCode: 500,
        diagnostics
      });
    }

    let account: any;
    try {
      startStep("get_account", "Fetch MetaApi Metatrader account instance");
      account = await api.metatraderAccountApi.getAccount(accountId);
      completeStep("get_account", { state: account.state, connectionStatus: account.connectionStatus });
    } catch (err: any) {
      failStep("get_account", err);
      
      const exactStatusCode = err.status || err.statusCode || (err.response && err.response.status) || 400;
      const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
      diagnostics.error = serializeError(err);
      console.error("[STATUS API] getAccount failed:", err);

      const errMsg = err.message || String(err);
      const isNotFound = errMsg.toLowerCase().includes("not found") || 
                         errMsg.includes("NotFound") || 
                         exactStatusCode === 404;

      if (isNotFound && email) {
        console.warn(`[STATUS API] Account ${accountId} not found on MetaApi. Disconnecting profile ${email}...`);
        try {
          await updateUserProfile(email, {
            mt5Connected: false,
            mt5AccountId: null,
            mt5Broker: null,
            mt5Balance: null,
            mt5Equity: null,
            mt5SyncedAt: null
          });
        } catch (dbErr: any) {
          console.error("[STATUS API] Failed to disconnect profile in DB:", dbErr);
        }

        return res.status(404).json({
          success: false,
          error: "MT5 account was not found on MetaApi. It has been automatically unlinked from your dashboard. Please reconnect with your valid broker credentials.",
          message: "MT5 account not found.",
          statusCode: 404,
          diagnostics
        });
      }

      return res.status(finalStatus).json({
        success: false,
        error: `Failed to fetch MetaApi account details: ${err.message}`,
        message: err.message,
        stack: err.stack,
        metaapiError: serializeError(err),
        statusCode: finalStatus,
        diagnostics
      });
    }

    if (account.state !== "DEPLOYED") {
      try {
        startStep("deploy_account", "Deploying undeployed account");
        await account.deploy();
        completeStep("deploy_account");
      } catch (err: any) {
        const errMsg = err.message || String(err);
        const isTopUp = errMsg.includes("top up") || errMsg.includes("trading account deployment") || errMsg.includes("high reliability") || errMsg.includes("replicas deployed");
        if (isTopUp) {
          console.warn(`[STATUS API] Account ${accountId} requires MetaApi credit top-up to deploy cloud replicas.`);
          return res.status(403).json({
            success: false,
            completed: false,
            topUpRequired: true,
            accountId,
            state: account.state || "UNDEPLOYED",
            connectionStatus: account.connectionStatus || "DISCONNECTED",
            error: "MetaApi Prepaid Balance Notice: MetaApi requires a topped-up prepaid balance ($10) at app.metaapi.cloud/billing before your real MT5 cloud terminal can be deployed.",
            message: "Your real MT5 account is registered. However, MetaApi cloud requires a prepaid balance top-up at https://app.metaapi.cloud/billing before starting live cloud replicas.",
            diagnostics
          });
        }

        failStep("deploy_account", err);
        const exactStatusCode = err.status || err.statusCode || 400;
        const finalStatus = typeof exactStatusCode === "number" ? exactStatusCode : 400;
        diagnostics.error = serializeError(err);
        console.error("[STATUS API] deploy failed:", err);

        return res.status(finalStatus).json({
          success: false,
          error: `Failed to redeploy account: ${err.message}`,
          message: err.message,
          stack: err.stack,
          metaapiError: serializeError(err),
          statusCode: finalStatus,
          diagnostics
        });
      }

      return res.json({
        success: true,
        completed: false,
        accountId,
        state: account.state,
        connectionStatus: account.connectionStatus,
        message: `Account is being deployed. Current state: ${account.state}`,
        diagnostics
      });
    }

    if (account.connectionStatus !== "CONNECTED") {
      return res.json({
        success: true,
        completed: false,
        accountId,
        state: account.state,
        connectionStatus: account.connectionStatus,
        message: `MetaApi is linking your account to MetaTrader server... Status: ${account.connectionStatus}`,
        diagnostics
      });
    }

    let connection: any;
    let useMetaStatsFallback = false;

    if (process.env.VERCEL) {
      console.log("[VERCEL ENVIRONMENT] Status API: Bypassing WebSocket RPC connection, using MetaStats REST API fallback...");
      useMetaStatsFallback = true;
    } else {
      try {
        startStep("get_rpc_connection", "Acquire RPC connection to broker");
        connection = account.getRPCConnection();
        await connection.connect();
        completeStep("get_rpc_connection");
      } catch (err: any) {
        console.warn("[STATUS API] RPC Connection failed, falling back to MetaStats REST API. Error:", err.message || err);
        useMetaStatsFallback = true;
      }
    }

    if (!useMetaStatsFallback) {
      try {
        startStep("get_account_information", "Retrieve live account details using getAccountInformation");
        const accountInfo: any = await withTimeout(
          connection.getAccountInformation(),
          15000,
          "Timeout fetching account information via RPC."
        );
        completeStep("get_account_information", { balance: accountInfo.balance, broker: accountInfo.broker });

        startStep("get_deals", "Fetch historical deals from past year using getDealsByTimeRange");
        const startTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        const endTime = new Date();
        const deals: any = await withTimeout(
          connection.getDealsByTimeRange(startTime, endTime),
          15000,
          "Timeout fetching historical deals via RPC."
        );
        completeStep("get_deals", { dealsCount: deals?.length || 0 });

        startStep("save_firestore", "Reconstruct trades and save them to Firestore");
        const reconstructed = reconstructTradesFromDeals(deals, accountId);
        
        if (email) {
          await saveSyncedDataToDatabase(email, accountId, reconstructed, accountInfo);
          
          if (!process.env.VERCEL) {
            await syncRegistry.startSync(accountId, email, token);
          }
        }
        completeStep("save_firestore", { tradesImported: reconstructed.length });

        try {
          await connection.close();
        } catch (closeErr: any) {
          console.error("[STATUS API] Warning: error closing RPC connection:", closeErr.message || closeErr);
        }

        return res.json({
          success: true,
          completed: true,
          accountId,
          state: account.state,
          connectionStatus: account.connectionStatus,
          tradesImported: reconstructed.length,
          accountInfo: {
            balance: typeof accountInfo.balance === 'number' ? accountInfo.balance : null,
            equity: typeof accountInfo.equity === 'number' ? accountInfo.equity : null,
            broker: accountInfo.broker || account.server || "DerivSVG-Server-02",
            currency: accountInfo.currency || "USD"
          },
          message: `Successfully synchronized and loaded ${reconstructed.length} trades!`,
          diagnostics
        });

      } catch (err: any) {
        failStep("data_fetch_and_sync", err);

        try {
          await connection.close();
        } catch (closeErr: any) {
          console.error("[STATUS API] Warning: error closing RPC connection on failure:", closeErr.message || closeErr);
        }

        console.warn("[STATUS API] RPC Fetch failed, falling back to MetaStats REST API...");
        useMetaStatsFallback = true;
      }
    }

    if (useMetaStatsFallback) {
      try {
        // Step A: Ensure MetaStats is enabled on the account
        startStep("enable_metastats", "Ensure MetaStats API is enabled on account");
        if (!account.metastatsApiEnabled) {
          console.log(`[STATUS API] MetaStats is not enabled on account ${accountId}. Enabling it now...`);
          await account.enableMetaStatsApi();
        }
        completeStep("enable_metastats");

        // Step B: Initialize MetaStats SDK
        startStep("metastats_init", "Initialize MetaStats REST API client");
        const metaStats = new MetaStats(token);
        completeStep("metastats_init");

        // Step C: Fetch account metrics via REST
        startStep("metastats_get_metrics", "Fetch live account metrics via MetaStats REST API");
        const metrics: any = await withTimeout(
          metaStats.getMetrics(accountId),
          15000,
          "Timeout fetching account metrics via MetaStats REST."
        );
        completeStep("metastats_get_metrics", { balance: metrics.balance });

        // Step D: Fetch historical trades via REST
        startStep("metastats_get_trades", "Fetch historical trades via MetaStats REST API");
        const startTime = "2020-01-01 00:00:00.000";
        const endTime = new Date().toISOString().replace("T", " ").replace("Z", "");
        const metastatsTrades: any = await withTimeout(
          metaStats.getAccountTrades(accountId, startTime, endTime),
          15000,
          "Timeout fetching historical trades via MetaStats REST."
        );
        completeStep("metastats_get_trades", { tradesCount: metastatsTrades?.length || 0 });

        // Step E: Map trades and save to Firestore
        startStep("save_firestore", "Map MetaStats trades and save to Firestore");
        const reconstructed = convertMetaStatsTradesToAppTrades(metastatsTrades, accountId);
        
        const accountInfo = {
          balance: typeof metrics.balance === 'number' ? metrics.balance : null,
          equity: typeof metrics.equity === 'number' ? metrics.equity : null,
          broker: account.broker || account.server || "DerivSVG-Server-02",
          currency: metrics.currency || "USD"
        };

        if (email) {
          await saveSyncedDataToDatabase(email, accountId, reconstructed, accountInfo);
        }
        completeStep("save_firestore", { tradesImported: reconstructed.length });

        return res.json({
          success: true,
          completed: true,
          accountId,
          state: account.state,
          connectionStatus: account.connectionStatus,
          tradesImported: reconstructed.length,
          accountInfo,
          message: `Successfully synchronized and loaded ${reconstructed.length} trades via secure serverless fallback!`,
          diagnostics
        });

      } catch (metastatsErr: any) {
        failStep("metastats_fallback_failure", metastatsErr);
        console.error("[STATUS API] MetaStats fallback also failed:", metastatsErr);
        return res.status(400).json({
          success: false,
          error: `MT5 serverless connection failed. Both WebSocket RPC and REST Fallback failed. Error: ${metastatsErr.message || String(metastatsErr)}`,
          message: metastatsErr.message,
          stack: metastatsErr.stack,
          metaapiError: serializeError(metastatsErr),
          statusCode: 400,
          diagnostics
        });
      }
    }
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
 * GET /api/mt5/accounts
 * Lists all real MT5 accounts registered on the user's MetaApi token
 */
export async function handleListMetaApiAccounts(req: Request, res: Response) {
  try {
    const passedToken = (req.query.metaApiToken as string) || (req.headers["x-metaapi-token"] as string);
    const token = getCleanToken(passedToken);
    const client = new MetaApiRestClient(token);
    const accounts = await client.getAccounts();
    
    const cleanAccounts = (accounts || []).map((acc: any) => ({
      id: acc.id || acc._id,
      name: acc.name,
      login: acc.login,
      server: acc.server,
      platform: acc.platform || "mt5",
      state: acc.state,
      connectionStatus: acc.connectionStatus,
      type: acc.type,
      reliability: acc.reliability
    }));

    return res.json({
      success: true,
      accounts: cleanAccounts
    });
  } catch (err: any) {
    console.error("[ACCOUNTS API] Failed to fetch accounts:", err);
    return res.status(err.status || 500).json({
      success: false,
      error: `Failed to retrieve MetaApi accounts: ${err.message || String(err)}`
    });
  }
}

/**
 * POST /api/mt5/deploy
 * Directly deploys the user's real MT5 trading terminal on MetaApi cloud
 */
export async function handleDeployRealAccount(req: Request, res: Response) {
  const { accountId, email } = req.body;
  if (!accountId) {
    return res.status(400).json({ success: false, error: "Missing required accountId parameter." });
  }

  try {
    const passedToken = req.body.metaApiToken || (req.headers["x-metaapi-token"] as string);
    const token = getCleanToken(passedToken);
    const client = new MetaApiRestClient(token);

    console.log(`[DEPLOY API] Triggering cloud deployment for real MT5 account: ${accountId} (${email})`);
    
    // Fetch current state
    const account = await client.getAccount(accountId);

    if (account.state !== "DEPLOYED") {
      try {
        await client.deploy(accountId);
      } catch (depErr: any) {
        const depMsg = depErr.message || String(depErr);
        const isTopUp = depMsg.includes("top up") || depMsg.includes("trading account deployment") || depMsg.includes("high reliability") || depMsg.includes("replicas deployed");
        if (isTopUp) {
          return res.status(403).json({
            success: false,
            topUpRequired: true,
            accountId,
            broker: account.server,
            login: account.login,
            error: "MetaApi requires a topped-up prepaid balance ($10) at app.metaapi.cloud/billing before your real MT5 cloud terminal can be deployed.",
            message: "Real account found, but MetaApi cloud replica deployment requires a prepaid balance top-up at app.metaapi.cloud/billing."
          });
        }
        throw depErr;
      }
    }

    // Refresh state after deployment
    const updated = await client.getAccount(accountId);

    if (email) {
      await updateUserProfile(email, {
        mt5Connected: true,
        mt5AccountId: accountId,
        mt5Broker: updated.server || account.server || "MetaTrader 5 Account",
        mt5SyncedAt: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      accountId,
      state: updated.state,
      connectionStatus: updated.connectionStatus,
      broker: updated.server,
      login: updated.login,
      message: `Deployment initiated for real MT5 account ${updated.login} (${updated.server})! Current state: ${updated.state}`
    });
  } catch (err: any) {
    console.error("[DEPLOY API] Failed to deploy account:", err);
    return res.status(err.status || 500).json({
      success: false,
      error: `Failed to deploy account: ${err.message || String(err)}`
    });
  }
}

/**
 * POST /api/mt5/sandbox
 * Explicitly disabled to guarantee only real MT5 accounts are deployed.
 */
export async function handleConnectMockSandbox(req: Request, res: Response) {
  return res.status(400).json({
    success: false,
    error: "Mock sandbox is disabled. Journaly only deploys your real MT5 broker accounts."
  });
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
    const passedToken = req.body.metaApiToken || req.body.token || (req.headers["x-metaapi-token"] as string);
    token = getCleanToken(passedToken);
  } catch (err: any) {
    console.error("[SYNC API] Stopping execution: Token missing/invalid:", err.message);
    return res.status(400).json({
      success: false,
      error: "METAAPI_TOKEN environment variable not found."
    });
  }

  if (process.env.VERCEL) {
    try {
      console.log("[SYNC API] Vercel environment: Performing forced sync using Direct REST API client...");
      const client = new MetaApiRestClient(token);
      const account = await client.getAccount(accountId);
      
      if (!account.metastatsApiEnabled) {
        await client.enableMetaStatsApi(accountId);
      }

      const metrics = await client.getMetrics(accountId, account);
      
      const startTime = "2020-01-01 00:00:00.000";
      const endTime = new Date().toISOString().replace("T", " ").replace("Z", "");
      const metastatsTrades = await client.getAccountTrades(accountId, startTime, endTime, account);

      const mapped = convertMetaStatsTradesToAppTrades(metastatsTrades, accountId);

      return res.json({
        success: true,
        accountInfo: {
          balance: typeof metrics.balance === 'number' ? metrics.balance : null,
          equity: typeof metrics.equity === 'number' ? metrics.equity : null,
          broker: account.server || "DerivSVG-Server-02",
          currency: metrics.currency || "USD"
        },
        trades: mapped
      });

    } catch (err: any) {
      console.error("[SYNC API] Forced REST Sync failed:", err);
      
      const errMsg = err.message || String(err);
      const isReplicaOrTopUp = errMsg.includes("replicas deployed") || 
                               errMsg.includes("top up") || 
                               errMsg.includes("trading account deployment") ||
                               errMsg.includes("high reliability");

      if (isReplicaOrTopUp) {
        console.warn(`[SYNC API] Account ${accountId} has no deployed replicas on MetaApi (top-up required). Returning graceful sync notice.`);
        return res.json({
          success: true,
          topUpRequired: true,
          accountInfo: {
            balance: null,
            equity: null,
            broker: "DerivSVG-Server-02",
            currency: "USD"
          },
          trades: [],
          message: "MetaApi requires prepaid credit to deploy cloud instances. Please top up your balance at https://app.metaapi.cloud/billing to activate live broker synchronization."
        });
      }

      const isNotFound = errMsg.toLowerCase().includes("not found") || 
                         errMsg.includes("NotFound") || 
                         err.status === 404 || 
                         err.statusCode === 404;

      if (isNotFound) {
        console.warn(`[SYNC API] Account ${accountId} not found on MetaApi via REST. Disconnecting matching profiles...`);
        try {
          const q = query(collection(db, "profiles"), where("mt5AccountId", "==", accountId));
          const snap = await getDocs(q);
          for (const doc of snap.docs) {
            await updateUserProfile(doc.id, {
              mt5Connected: false,
              mt5AccountId: null,
              mt5Broker: null,
              mt5Balance: null,
              mt5Equity: null,
              mt5SyncedAt: null
            });
          }
        } catch (dbErr: any) {
          console.error("[SYNC API] Failed to auto-disconnect profile in DB:", dbErr);
        }

        return res.status(404).json({
          success: false,
          error: "MT5 account was not found on MetaApi and has been unlinked from your account. Please reconnect with your valid broker credentials."
        });
      }

      return res.status(400).json({
        success: false,
        error: `MT5 Sync Failed via Direct REST: ${err.message || String(err)}`
      });
    }
  } else {
    let api: any;
    let account: any;
    try {
      await ensureMetaApiLoaded();
      api = new MetaApi(token);
      account = await api.metatraderAccountApi.getAccount(accountId);
    } catch (err: any) {
      console.error(`[SYNC API] Failed to fetch account ${accountId}:`, err);
      
      const errMsg = err.message || String(err);
      const isNotFound = errMsg.toLowerCase().includes("not found") || 
                         errMsg.includes("NotFound") || 
                         err.status === 404 || 
                         err.statusCode === 404;

      if (isNotFound) {
        console.warn(`[SYNC API] Account ${accountId} not found on MetaApi. Disconnecting matching profiles...`);
        try {
          const q = query(collection(db, "profiles"), where("mt5AccountId", "==", accountId));
          const snap = await getDocs(q);
          for (const doc of snap.docs) {
            await updateUserProfile(doc.id, {
              mt5Connected: false,
              mt5AccountId: null,
              mt5Broker: null,
              mt5Balance: null,
              mt5Equity: null,
              mt5SyncedAt: null
            });
          }
        } catch (dbErr: any) {
          console.error("[SYNC API] Failed to auto-disconnect profile in DB:", dbErr);
        }
        
        return res.status(404).json({
          success: false,
          error: "MT5 account was not found on MetaApi and has been unlinked from your account. Please reconnect with your valid broker credentials."
        });
      }

      return res.status(400).json({
        success: false,
        error: `Failed to fetch account: ${err.message}`
      });
    }

    let connection: any;
    let useMetaStatsFallback = false;

    if (process.env.VERCEL) {
      console.log("[VERCEL ENVIRONMENT] Sync API: Bypassing WebSocket RPC connection, using MetaStats REST API fallback...");
      useMetaStatsFallback = true;
    } else {
      try {
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
      } catch (err: any) {
        const fullErr = ((err?.message || "") + " " + (err?.details || "") + " " + String(err)).toLowerCase();
        const isReplicaOrTopUp = fullErr.includes("top up") || 
                                 fullErr.includes("replicas deployed") || 
                                 fullErr.includes("trading account deployment") ||
                                 fullErr.includes("high reliability");

        if (isReplicaOrTopUp) {
          console.warn(`[SYNC API] Account ${accountId} requires top-up on MetaApi to deploy live replica. Returning topUpRequired gracefully.`);
          return res.json({
            success: true,
            topUpRequired: true,
            accountInfo: {
              balance: null,
              equity: null,
              broker: account?.server || account?.broker || "DerivSVG-Server-02",
              currency: "USD"
            },
            trades: [],
            message: "MetaApi requires prepaid credit to deploy live cloud replicas. Top up your balance at https://app.metaapi.cloud/billing to activate live broker synchronization."
          });
        }

        console.warn("[SYNC API] RPC Connection/connect notice, checking MetaStats fallback. Info:", err.message || err);
        useMetaStatsFallback = true;
      }
    }

    if (!useMetaStatsFallback) {
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
            balance: typeof accountInfo.balance === 'number' ? accountInfo.balance : null,
            equity: typeof accountInfo.equity === 'number' ? accountInfo.equity : null,
            broker: accountInfo.broker || account.server || "DerivSVG-Server-02",
            currency: accountInfo.currency || "USD"
          },
          trades: mapped
        });
      } catch (innerErr: any) {
        // Clean up RPC connection on query failure
        try {
          await connection.close();
        } catch (closeErr: any) {
          console.error("[SYNC API] Warning: error closing RPC connection on failure:", closeErr.message || closeErr);
        }
        console.warn("[SYNC API] RPC Queries failed, falling back to MetaStats. Error:", innerErr.message || innerErr);
        useMetaStatsFallback = true;
      }
    }

    if (useMetaStatsFallback) {
      try {
        if (!account.metastatsApiEnabled) {
          console.log(`[SYNC API] MetaStats is not enabled on account ${accountId}. Enabling it now...`);
          await account.enableMetaStatsApi();
        }

        const metaStats = new MetaStats(token);

        console.log(`[SYNC API] Fetching metrics via MetaStats REST API...`);
        const metrics: any = await withTimeout(
          metaStats.getMetrics(accountId),
          15000,
          "Timeout fetching account metrics via MetaStats REST."
        );

        console.log(`[SYNC API] Fetching trades via MetaStats REST API...`);
        const startTime = "2020-01-01 00:00:00.000";
        const endTime = new Date().toISOString().replace("T", " ").replace("Z", "");
        const metastatsTrades: any = await withTimeout(
          metaStats.getAccountTrades(accountId, startTime, endTime),
          15000,
          "Timeout fetching historical trades via MetaStats REST."
        );

        const mapped = convertMetaStatsTradesToAppTrades(metastatsTrades, accountId);

        return res.json({
          success: true,
          accountInfo: {
            balance: typeof metrics.balance === 'number' ? metrics.balance : null,
            equity: typeof metrics.equity === 'number' ? metrics.equity : null,
            broker: account.broker || account.server || "DerivSVG-Server-02",
            currency: metrics.currency || "USD"
          },
          trades: mapped
        });

      } catch (metastatsErr: any) {
        const fullErrStr = ((metastatsErr?.message || "") + " " + (metastatsErr?.details || "") + " " + String(metastatsErr)).toLowerCase();
        const isTimeout = fullErrStr.includes("timeout");
        const isReplicaOrTopUp = fullErrStr.includes("replicas deployed") || 
                                 fullErrStr.includes("top up") || 
                                 fullErrStr.includes("trading account deployment") ||
                                 fullErrStr.includes("high reliability") ||
                                 (isTimeout && account?.state !== "DEPLOYED");

        if (isReplicaOrTopUp) {
          console.warn(`[SYNC API] Account ${accountId} has no deployed replicas on MetaApi (top-up required or timed out). Returning graceful sync notice.`);
          return res.json({
            success: true,
            topUpRequired: true,
            accountInfo: {
              balance: null,
              equity: null,
              broker: account?.server || account?.broker || "DerivSVG-Server-02",
              currency: "USD"
            },
            trades: [],
            message: "MetaApi requires account balance to deploy live cloud replicas. Top up your balance at app.metaapi.cloud/billing to activate real-time synchronization."
          });
        }

        console.warn(`[SYNC API] MetaStats fallback notice for account ${accountId}:`, metastatsErr?.message || metastatsErr);
        return res.json({
          success: true,
          topUpRequired: true,
          accountInfo: {
            balance: null,
            equity: null,
            broker: account?.server || account?.broker || "DerivSVG-Server-02",
            currency: "USD"
          },
          trades: [],
          message: `Live broker synchronization unavailable: ${metastatsErr.message || String(metastatsErr)}`
        });
      }
    }
  }
}

/**
 * POST /api/mt5/balance
 * Saves and updates the user's verified real MT5 account balance and equity
 */
export async function handleUpdateBalance(req: Request, res: Response) {
  const { email, balance, equity, startingBalance } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Missing required email parameter." });
  }

  const numBalance = typeof balance === "number" ? balance : parseFloat(balance);
  if (isNaN(numBalance)) {
    return res.status(400).json({ success: false, error: "Invalid numeric balance provided." });
  }

  const numEquity = typeof equity === "number" ? equity : (equity ? parseFloat(equity) : numBalance);

  try {
    const updateData: any = {
      mt5Balance: numBalance,
      mt5Equity: isNaN(numEquity) ? numBalance : numEquity,
      mt5SyncedAt: new Date().toISOString()
    };
    if (typeof startingBalance === "number" && !isNaN(startingBalance)) {
      updateData.startingBalance = startingBalance;
    }

    await updateUserProfile(email, updateData);

    return res.json({
      success: true,
      balance: numBalance,
      equity: isNaN(numEquity) ? numBalance : numEquity,
      message: `Successfully updated real MT5 account balance to $${numBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}!`
    });
  } catch (err: any) {
    console.error("[BALANCE API] Failed to update balance:", err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
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
    } else if (url.includes("/status")) {
      return await handleStatusAccount(req, res);
    } else if (url.includes("/connect") || url.includes("/connect-mt5")) {
      return await handleConnectMT5(req, res);
    } else if (url.includes("/sandbox") || url.includes("/connect-mock")) {
      return await handleConnectMockSandbox(req, res);
    } else if (url.includes("/balance")) {
      return await handleUpdateBalance(req, res);
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
