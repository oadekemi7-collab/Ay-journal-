import React, { useState, useEffect } from "react";
import { 
  Activity, 
  Settings, 
  Unlink, 
  RefreshCw, 
  Link, 
  CheckCircle, 
  Info, 
  TrendingUp, 
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  Database,
  Key,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Check
} from "lucide-react";
import { updateUserProfile } from "../lib/firebase";

interface MT5ConnectionPanelProps {
  email: string;
  isPremium: boolean;
  mt5Connected: boolean;
  mt5AccountId: string;
  mt5Broker: string;
  mt5Balance: number | null;
  mt5Equity: number | null;
  isSyncing: boolean;
  onSync: () => Promise<void>;
  onConnected: (accountId: string, name: string) => void;
  onDisconnected: () => void;
  onOpenUpgradeModal: () => void;
}

export default function MT5ConnectionPanel({
  email,
  isPremium,
  mt5Connected,
  mt5AccountId,
  mt5Broker,
  mt5Balance,
  mt5Equity,
  isSyncing,
  onSync,
  onConnected,
  onDisconnected,
  onOpenUpgradeModal
}: MT5ConnectionPanelProps) {
  const [activeTab, setActiveTab] = useState<"direct" | "broker">("broker");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPolling, setIsPolling] = useState(false);
  const cancelPollRef = React.useRef(false);

  // Direct tab state
  const [directAccountId, setDirectAccountId] = useState("");

  // Broker registration tab state
  const [broker, setBroker] = useState("");
  const [server, setServer] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [platform, setPlatform] = useState("mt5");

  const [isTokenConfigured, setIsTokenConfigured] = useState<boolean | null>(null);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const [customMetaApiToken, setCustomMetaApiToken] = useState(() => {
    return localStorage.getItem("journaly_custom_metaapi_token") || "";
  });
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenSavedNotice, setTokenSavedNotice] = useState(false);

  // Check backend server-side MetaApi Token configuration on mount
  useEffect(() => {
    fetch("/api/mt5/config")
      .then(async res => {
        const text = await res.text();
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            return JSON.parse(text);
          } catch {}
        }
        return null;
      })
      .then(data => {
        setIsTokenConfigured(!!(data && data.configured));
      })
      .catch(() => {
        setIsTokenConfigured(false);
      });
  }, []);

  const handleForceSandbox = async () => {
    cancelPollRef.current = true;
    setIsPolling(false);
    setLoading(true);
    setError("");
    setSuccessMsg("Initializing high-fidelity trade simulation sandbox...");
    try {
      const response = await fetch("/api/mt5/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const rawText = await response.text();
      const contentType = response.headers.get("content-type") || "";
      let data: any = null;
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(rawText);
        } catch {}
      }

      if (response.ok && data && data.success) {
        setSuccessMsg("Demo Sandbox activated! 8 historical trades successfully seeded.");
        setTimeout(() => {
          onConnected(data.accountId, data.broker);
        }, 1250);
      } else {
        setError((data && data.error) || `Failed to initialize Demo Sandbox (HTTP ${response.status}).`);
        setLoading(false);
      }
    } catch (err: any) {
      setError(`Failed to initialize Demo Sandbox: ${err.message || String(err)}`);
      setLoading(false);
    }
  };

  const handleCancelPolling = () => {
    cancelPollRef.current = true;
    setIsPolling(false);
    setLoading(false);
    setSuccessMsg("");
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    let url = "/api/connect-mt5";
    const payload: any = { email };

    if (activeTab === "direct") {
      if (!directAccountId.trim()) {
        setError("Please enter a valid MetaApi Account ID.");
        return;
      }
      payload.accountId = directAccountId.trim();
    } else {
      if (!server.trim() || !login.trim() || !password.trim()) {
        setError("Please fill in your Server Name, Account Name / Login ID, and MT5 Password.");
        return;
      }
      payload.login = login.trim();
      payload.password = password;
      payload.server = server.trim();
    }

    if (customMetaApiToken.trim()) {
      payload.metaApiToken = customMetaApiToken.trim();
      localStorage.setItem("journaly_custom_metaapi_token", customMetaApiToken.trim());
    }

    setLoading(true);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const statusCode = response.status;
      const contentType = response.headers.get("content-type") || "";
      let responseText = "";
      let responseJson: any = null;
      let jsonParsingFailed = false;

      try {
        responseText = await response.text();
      } catch (readErr: any) {
        responseText = `[Failed to read response body: ${readErr.message || String(readErr)}]`;
      }

      if (contentType.includes("application/json")) {
        try {
          responseJson = JSON.parse(responseText);
        } catch (jsonErr: any) {
          jsonParsingFailed = true;
        }
      } else {
        try {
          responseJson = JSON.parse(responseText);
        } catch (jsonErr) {
          jsonParsingFailed = true;
        }
      }

      if (response.ok && responseJson && responseJson.success) {
        const data = responseJson;
        if (data.requiresPolling) {
          setSuccessMsg(data.message || "Establishing secure connection to MT5 broker...");
          setIsPolling(true);
          cancelPollRef.current = false;
          
          let pollCount = 0;
          const maxPolls = 30; // 30 polls * 3 seconds = 90 seconds max
          const accountId = data.accountId;

          const pollStatus = async () => {
            if (cancelPollRef.current) {
              return; // Stop polling if cancelled
            }
            if (pollCount >= maxPolls) {
              setLoading(false);
              setIsPolling(false);
              setError("Connection verification took too long. Please verify your account manually or retry.");
              return;
            }

            try {
              const statusPayload: any = { accountId, email };
              if (customMetaApiToken.trim()) {
                statusPayload.metaApiToken = customMetaApiToken.trim();
              }
              const statusRes = await fetch("/api/mt5/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(statusPayload)
              });
              
              if (cancelPollRef.current) {
                return; // Stop polling if cancelled during fetch
              }

              const statusStatusCode = statusRes.status;
              let statusText = "";
              try {
                statusText = await statusRes.text();
              } catch (readErr: any) {
                statusText = `[Failed to read status response body: ${readErr.message || String(readErr)}]`;
              }

              let statusData: any = null;
              let statusJsonFailed = false;
              try {
                statusData = JSON.parse(statusText);
              } catch (e) {
                statusJsonFailed = true;
              }

              if (!statusRes.ok || statusJsonFailed || (statusData && !statusData.success)) {
                setLoading(false);
                setIsPolling(false);
                let errorDetails = "";
                if (statusStatusCode === 403) {
                  errorDetails = (statusData && (statusData.error || statusData.message)) || `MetaApi Status Check: HTTP 403 Forbidden. Cloud access restricted.`;
                } else if (statusJsonFailed) {
                  errorDetails = `HTTP STATUS: ${statusStatusCode} (Non-JSON status response)\n${statusText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;
                } else {
                  errorDetails = (statusData && (statusData.error || statusData.message)) || `HTTP STATUS: ${statusStatusCode}\n${JSON.stringify(statusData, null, 2)}`;
                }
                setError(errorDetails);
                return;
              }

              if (statusData.completed) {
                await updateUserProfile(email, {
                  mt5Connected: true,
                  mt5AccountId: statusData.accountId,
                  mt5Broker: statusData.accountInfo?.broker || broker || statusData.broker || statusData.name || "MetaTrader Broker Link",
                  mt5Balance: statusData.accountInfo?.balance || statusData.balance || 0,
                  mt5Equity: statusData.accountInfo?.equity || statusData.equity || 0,
                  mt5SyncedAt: new Date().toISOString()
                });

                setSuccessMsg(statusData.message || "MT5 account linked and synchronized successfully!");
                setTimeout(() => {
                  onConnected(
                    statusData.accountId, 
                    statusData.accountInfo?.broker || broker || statusData.broker || statusData.name || "MT5 Connected Account"
                  );
                }, 1200);
                setLoading(false);
                setIsPolling(false);
              } else {
                setSuccessMsg(statusData.message || "Linking with MetaTrader broker...");
                pollCount++;
                if (!cancelPollRef.current) {
                  setTimeout(pollStatus, 3000);
                }
              }
            } catch (pollErr: any) {
              console.error("Polling error:", pollErr);
              pollCount++;
              if (!cancelPollRef.current) {
                setTimeout(pollStatus, 3000);
              }
            }
          };

          setTimeout(pollStatus, 3000);
        } else {
          // Direct flow (already complete)
          await updateUserProfile(email, {
            mt5Connected: true,
            mt5AccountId: data.accountId,
            mt5Broker: data.accountInfo?.broker || broker || data.broker || data.name || "MetaTrader Broker Link",
            mt5Balance: data.accountInfo?.balance || data.balance || 0,
            mt5Equity: data.accountInfo?.equity || data.equity || 0,
            mt5SyncedAt: new Date().toISOString()
          });

          setSuccessMsg(data.message || "MT5 account linked and synchronized successfully!");
          setTimeout(() => {
            onConnected(
              data.accountId, 
              data.accountInfo?.broker || broker || data.broker || data.name || "MT5 Connected Account"
            );
          }, 1200);
          setLoading(false);
        }
      } else {
        let errorMsg = "";
        if (responseJson && (responseJson.error || responseJson.message)) {
          errorMsg = responseJson.error || responseJson.message;
        } else if (statusCode === 403) {
          if (jsonParsingFailed || responseText.includes("<html>")) {
            errorMsg = `MetaApi Connection Blocked (HTTP 403 Forbidden):\nThe request reached MetaApi servers but access was blocked. This indicates your auth-token is either invalid, expired, or MetaApi rejected the request due to account limits.`;
          } else {
            errorMsg = `MetaApi Connection Forbidden (HTTP 403): Access denied by MetaApi cloud.`;
          }
        } else if (jsonParsingFailed) {
          if (responseText.includes("<html>")) {
            const cleanText = responseText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            errorMsg = `HTTP STATUS: ${statusCode} (HTML Error Received)\n${cleanText}`;
          } else {
            errorMsg = `HTTP STATUS: ${statusCode}\n${responseText}`;
          }
        } else if (responseJson) {
          errorMsg = responseJson.error || responseJson.message || `HTTP STATUS: ${statusCode}\n${JSON.stringify(responseJson, null, 2)}`;
        } else {
          errorMsg = `HTTP STATUS: ${statusCode}\n${responseText}`;
        }
        setError(errorMsg);
        setLoading(false);
      }
    } catch (err: any) {
      setError(`fetch() Exception Occurred:\nMessage: ${err.message || String(err)}\nStack:\n${err.stack || "No stack trace available"}`);
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await updateUserProfile(email, {
        mt5Connected: false,
        mt5AccountId: null,
        mt5Broker: null,
        mt5Balance: null,
        mt5Equity: null,
        mt5SyncedAt: null
      });
      setShowConfirmDisconnect(false);
      onDisconnected();
    } catch (err) {
      console.error("Disconnection error:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return "$0.00";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  // If user is on Free plan, render a promo card
  if (!isPremium) {
    return (
      <div 
        id="mt5-promo-card"
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden"
      >
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2 max-w-lg">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold tracking-wider uppercase">
              <RefreshCw size={10} className="animate-spin duration-10000" />
              MetaTrader 5 Sync
            </div>
            <h3 className="text-lg font-black font-display tracking-tight text-zinc-100 uppercase">
              Connect MT5 for Automatic Trade Syncing
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Stop entering trades manually. Synchronize your MT5 account history, profits, losses, and active metrics straight to your secure cloud ledger in the background.
            </p>
          </div>
          
          <button
            onClick={onOpenUpgradeModal}
            className="px-5 py-3 bg-emerald-555 bg-emerald-500 hover:bg-emerald-450 text-zinc-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-emerald-500/10 cursor-pointer"
            id="btn-promo-upgrade"
          >
            <span>Upgrade to Premium</span>
            <ArrowRight size={14} className="stroke-[2.5]" />
          </button>
        </div>
      </div>
    );
  }

  // Render polling connection progress state
  if (isPolling) {
    return (
      <div 
        id="mt5-connecting-progress"
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
        
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-850/60 pb-3 mb-5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl animate-pulse">
            <RefreshCw size={16} className="stroke-[2.5] animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-black text-zinc-100 font-display tracking-tight uppercase">
              Linking MetaTrader 5 Account...
            </h3>
            <p className="text-xs text-zinc-400">
              MetaApi cloud server is deploying and registering your MT5 terminal.
            </p>
          </div>
        </div>

        {/* Loading Message */}
        <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-5 text-center space-y-4 mb-5">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-500/10 border-t-emerald-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Activity size={16} className="text-emerald-500 animate-pulse" />
              </div>
            </div>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm font-bold text-zinc-200">
              {successMsg || "Connecting to your MetaTrader server..."}
            </p>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              Please wait • Up to 60s
            </p>
          </div>
        </div>

        {/* Troubleshooting / Sandbox Bypass Box */}
        <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-850/80 space-y-3.5 mb-5">
          <div className="flex items-start gap-2.5 text-xs text-zinc-300">
            <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-extrabold block text-[10px] uppercase tracking-wider text-amber-500">
                Stuck on DISCONNECTED?
              </span>
              <p className="text-zinc-400">
                If the status stays <code className="bg-zinc-900 px-1 text-amber-400 font-mono rounded">DISCONNECTED</code>, it means MetaApi is struggling to log into your broker (usually due to a typo in the server name, password, or login ID).
              </p>
            </div>
          </div>

          <div className="border-t border-zinc-850/60 pt-3 flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleForceSandbox}
              className="flex-1 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Database size={13} />
              Use Demo Sandbox
            </button>
            <button
              onClick={handleCancelPolling}
              className="py-2 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-850 rounded-xl text-xs font-bold uppercase transition-all duration-150 cursor-pointer"
            >
              Cancel Link
            </button>
          </div>
        </div>

        <div className="text-center">
          <p className="text-[10px] text-zinc-600 font-medium">
            Secured and compiled via MetaApi Cloud Services
          </p>
        </div>
      </div>
    );
  }

  // Render connected state
  if (mt5Connected) {
    return (
      <div 
        id="mt5-active-connection"
        className="bg-zinc-900 border border-emerald-500/20 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10 border-b border-zinc-850/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
              <Activity size={18} className="stroke-[2.5] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-wider font-extrabold uppercase text-emerald-400 leading-none">Broker Link Active</span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              </div>
              <h3 className="text-base font-black text-zinc-100 font-display tracking-tight uppercase mt-0.5">
                {mt5Broker || "MetaTrader 5 Account"}
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono">
                ID: {mt5AccountId} {isTokenConfigured === false && "• Developer Mock Sandbox"}
              </p>
            </div>
          </div>

          {/* Connected Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onSync}
              disabled={isSyncing || loading}
              className="px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 disabled:border-zinc-900 text-zinc-300 disabled:text-zinc-600 font-bold rounded-xl text-xs transition-all duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed"
              title="Force synchronize trades now"
            >
              <RefreshCw size={13} className={`stroke-[2.5] ${isSyncing ? "animate-spin text-emerald-400" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
            </button>

            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="px-3 py-2.5 bg-rose-950/10 hover:bg-rose-950/20 border border-rose-900/30 hover:border-rose-900/50 text-rose-400 hover:text-rose-300 font-bold rounded-xl text-xs transition-all duration-150 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Disconnect account from ledger"
            >
              <Unlink size={13} className={loading ? "animate-pulse" : ""} />
              <span>{loading ? "Disconnecting..." : "Disconnect"}</span>
            </button>
          </div>
        </div>

        {/* Live Metrics strip from MT5 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 relative z-10">
          <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-850/50">
            <span className="text-[9px] uppercase font-black tracking-wider text-zinc-500 block">MT5 Account Balance</span>
            <span className="text-base font-black text-zinc-100 font-display mt-0.5 block">{formatCurrency(mt5Balance)}</span>
          </div>

          <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-850/50">
            <span className="text-[9px] uppercase font-black tracking-wider text-zinc-500 block">MT5 Account Equity</span>
            <span className="text-base font-black text-emerald-400 font-display mt-0.5 block">{formatCurrency(mt5Equity)}</span>
          </div>

          <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-850/50">
            <span className="text-[9px] uppercase font-black tracking-wider text-zinc-500 block">Sync Frequency</span>
            <span className="text-xs font-extrabold text-zinc-300 mt-1 block flex items-center gap-1">
              <RefreshCw size={10} className="text-emerald-500 animate-spin duration-5000" />
              Auto Background
            </span>
          </div>

          <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-850/50">
            <span className="text-[9px] uppercase font-black tracking-wider text-zinc-500 block">Data Ledger Origin</span>
            <span className="text-xs font-extrabold text-zinc-300 mt-1 block flex items-center gap-1">
              <Database size={10} className="text-emerald-500" />
              MetaApi Server
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Render Link form
  return (
    <div 
      id="mt5-connect-form-panel"
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />

      {/* Header */}
      <div className="flex items-center gap-3 relative z-10 border-b border-zinc-850/60 pb-3">
        <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
          <Link size={16} className="stroke-[2.5]" />
        </div>
        <div>
          <h3 className="text-base font-black text-zinc-100 font-display tracking-tight uppercase">
            MetaTrader 5 (MT5) Account Connection
          </h3>
          <p className="text-xs text-zinc-400">
            Configure automatic background synchronization.
          </p>
        </div>
      </div>

      {isTokenConfigured === false && (
        <div className="my-3.5 p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/30 text-amber-400 text-xs font-medium flex items-start gap-2.5">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold block uppercase tracking-wider text-[10px] text-amber-500">Real MT5 Connection Setup Required:</span>
            <p className="text-zinc-300 text-xs font-normal">
              To connect your real MT5 trading account and sync real-time data, please add your <strong>MetaApi API Token</strong> as <code className="bg-zinc-950 px-1 py-0.5 rounded text-amber-400 border border-zinc-850">METAAPI_API_TOKEN</code> in the <strong>AI Studio Settings menu</strong> (Environment Variables) first.
            </p>
          </div>
        </div>
      )}

      {error && (() => {
        const isAuth401 = error.includes("401") || 
                          error.toLowerCase().includes("invalid auth-token") || 
                          error.includes("UnauthorizedError") || 
                          error.toLowerCase().includes("failed to authorize");

        if (isAuth401) {
          return (
            <div className="my-3.5 p-4 rounded-xl bg-zinc-950 border border-amber-500/30 text-zinc-300 text-xs font-medium space-y-3.5 shadow-xl">
              {/* Header with Connectivity Confirmation */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <ShieldAlert size={16} className="shrink-0 text-amber-500" />
                  <span>MetaApi Cloud: 401 Unauthorized (Invalid Auth Token)</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-extrabold uppercase tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  API Server: Connected &amp; Online
                </div>
              </div>

              {/* Explicit answer to user's question */}
              <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="flex items-center gap-2 text-zinc-200 font-bold text-xs">
                  <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                  <span>Is the API connected at all? <strong className="text-emerald-400">Yes, completely!</strong></span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Your request reached our local server, which initialized the MetaApi SDK and sent the credentials to the MetaTrader cloud gateway (<code className="text-zinc-300 bg-zinc-950 px-1 rounded">mt-provisioning-api-v1.agiliumtrade.ai</code>).
                </p>
                <div className="pt-1.5 border-t border-zinc-800 text-[11px] text-amber-300/90 leading-relaxed">
                  <strong>Why did MetaApi return HTTP 401?</strong> MetaApi Cloud rejected the API token header with:
                  <span className="block font-mono bg-zinc-950 text-amber-200 p-2 rounded-lg mt-1 border border-amber-900/30 text-[10px]">
                    "Failed to authorize user due to invalid auth-token header. Request URL: https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts"
                  </span>
                  This occurs when the configured MetaApi token has expired or was revoked on <a href="https://app.metaapi.cloud" target="_blank" rel="noreferrer" className="underline font-bold text-amber-300 hover:text-amber-200">app.metaapi.cloud</a>.
                </div>
              </div>

              {/* Solution 1: Use Instant Demo Sandbox */}
              <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Database size={12} />
                    Instant Sandbox (Zero Setup Needed)
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Immediately test the dashboard, metrics, and journal with 8 seeded MT5 trades.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleForceSandbox}
                  className="w-full sm:w-auto px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Database size={13} />
                  Connect Sandbox Now
                </button>
              </div>

              {/* Solution 2: Provide Fresh Token */}
              <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
                    <Key size={13} className="text-amber-400" />
                    Or provide a fresh MetaApi Token:
                  </span>
                  <a 
                    href="https://app.metaapi.cloud/token" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold underline"
                  >
                    Generate at app.metaapi.cloud <ExternalLink size={10} />
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste fresh MetaApi Token (eyJhbGciOi...)"
                    value={customMetaApiToken}
                    onChange={(e) => {
                      setCustomMetaApiToken(e.target.value);
                      localStorage.setItem("journaly_custom_metaapi_token", e.target.value.trim());
                    }}
                    className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-xs text-zinc-200 outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customMetaApiToken.trim()) {
                        localStorage.setItem("journaly_custom_metaapi_token", customMetaApiToken.trim());
                        setTokenSavedNotice(true);
                        setTimeout(() => setTokenSavedNotice(false), 2500);
                      }
                    }}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    {tokenSavedNotice ? "Saved!" : "Save"}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  After saving your fresh token, click <strong>"Link MetaTrader 5 Account"</strong> below to connect.
                </p>
              </div>

              {/* Collapsible raw logs */}
              <details className="pt-1">
                <summary className="text-[10px] text-zinc-500 hover:text-zinc-400 cursor-pointer uppercase font-mono tracking-wider">
                  Show raw diagnostic response details
                </summary>
                <pre className="mt-2 font-mono bg-zinc-950 p-2.5 rounded-lg border border-zinc-900 text-rose-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-44 text-[10px]">
                  {error}
                </pre>
              </details>
            </div>
          );
        }

        const isReliabilityOrQuota = error.includes("top up") || 
                                    error.includes("reliability") || 
                                    error.includes("ForbiddenError") ||
                                    error.includes("Account Quota") ||
                                    error.includes("maximum number of accounts") ||
                                    error.includes("Balance Notice") ||
                                    error.includes("Balance Required");

        if (isReliabilityOrQuota) {
          return (
            <div className="my-3.5 p-4 rounded-xl bg-zinc-950 border border-amber-500/30 text-zinc-300 text-xs font-medium space-y-3.5 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <ShieldAlert size={16} className="shrink-0 text-amber-500" />
                  <span>MetaApi Cloud: Balance &amp; Account Provisioning Notice</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-extrabold uppercase tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Gateway Connected
                </div>
              </div>

              <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="flex items-center gap-2 text-zinc-200 font-bold text-xs">
                  <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                  <span>Cloud Gateway reached: <strong className="text-emerald-400">Connection confirmed</strong></span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  MetaApi received your connection request. Although your payment method is configured, MetaApi operates as a prepaid service requiring a positive prepaid credit balance (e.g. $10) before new cloud trading servers can be auto-provisioned via the API.
                </p>
                <div className="pt-1.5 border-t border-zinc-800 text-[11px] text-amber-300/90 leading-relaxed space-y-1">
                  <strong>How to connect immediately:</strong>
                  <ul className="list-disc list-inside space-y-1.5 text-zinc-300 mt-1">
                    <li>
                      <strong>Option 1 (Fastest &amp; Free):</strong> Add your MT5 broker account directly in your MetaApi console at <a href="https://app.metaapi.cloud/accounts" target="_blank" rel="noreferrer" className="underline text-emerald-400 font-bold">app.metaapi.cloud/accounts</a>, copy the generated <strong>Account ID</strong>, switch to the <strong>"Direct MetaApi Account ID"</strong> tab above, and paste it here!
                    </li>
                    <li>
                      <strong>Option 2:</strong> Add a $10 prepaid top-up credit to your MetaApi balance at <a href="https://app.metaapi.cloud/billing" target="_blank" rel="noreferrer" className="underline text-emerald-400 font-bold">app.metaapi.cloud/billing</a>, then submit this form again.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Solution: Use Instant Demo Sandbox */}
              <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Database size={12} />
                    Instant Sandbox (Zero Setup Needed)
                  </span>
                  <p className="text-[11px] text-zinc-400">
                    Immediately test the dashboard, metrics, and journal with 8 seeded MT5 trades.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleForceSandbox}
                  className="w-full sm:w-auto px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Database size={13} />
                  Connect Sandbox Now
                </button>
              </div>

              <details className="pt-1">
                <summary className="text-[10px] text-zinc-500 hover:text-zinc-400 cursor-pointer uppercase font-mono tracking-wider">
                  Show raw diagnostic response details
                </summary>
                <pre className="mt-2 font-mono bg-zinc-950 p-2.5 rounded-lg border border-zinc-900 text-amber-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-44 text-[10px]">
                  {error}
                </pre>
              </details>
            </div>
          );
        }

        // Generic error
        return (
          <div className="my-3.5 p-4 rounded-xl bg-rose-950/25 border border-rose-900/40 text-rose-300 text-xs font-medium space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-[10px]">
              <ShieldAlert size={16} className="shrink-0 text-rose-500" />
              <span>MT5 Secure Connection Diagnostic Error:</span>
            </div>
            <pre className="font-mono bg-zinc-950/90 p-3 rounded-lg border border-rose-950 text-rose-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-56 text-[11px]">
              {error}
            </pre>
            <div className="pt-2 flex flex-col sm:flex-row gap-2 items-center justify-between border-t border-rose-900/20">
              <span className="text-[10px] text-zinc-400">Want to test without a real broker?</span>
              <button
                type="button"
                onClick={handleForceSandbox}
                className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all duration-150 cursor-pointer flex items-center gap-1.5"
              >
                <Database size={12} />
                Connect Sandbox Instead
              </button>
            </div>
          </div>
        );
      })()}

      {successMsg && (
        <div className="my-3.5 p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
          <CheckCircle size={14} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2.5 my-4 bg-zinc-950/60 p-1.5 rounded-xl border border-zinc-850">
        <button
          onClick={() => setActiveTab("direct")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-150 cursor-pointer ${
            activeTab === "direct"
              ? "bg-zinc-900 text-zinc-100 shadow"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Direct MetaApi Account ID
        </button>
        <button
          onClick={() => setActiveTab("broker")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-150 cursor-pointer ${
            activeTab === "broker"
              ? "bg-zinc-900 text-zinc-100 shadow"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Server Broker Details
        </button>
      </div>

      {/* Forms */}
      <form onSubmit={handleConnect} className="space-y-4">
        {activeTab === "direct" ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-850/50 text-xs text-zinc-400 mb-2">
              <Info size={14} className="text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Enter your pre-configured MetaApi Account ID. We will link directly and fetch balance, equity, and historic deals automatically.
              </span>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-black text-zinc-500 mb-1">MetaApi Account ID</label>
              <input 
                type="text"
                required
                placeholder="e.g. a7b1d2e5-fa2b-449d-b8d2-c23d1d36d24f"
                value={directAccountId}
                onChange={(e) => setDirectAccountId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 focus:border-emerald-500/50 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-700 font-mono"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="flex items-start gap-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-850/50 text-xs text-zinc-400 mb-1">
              <Info size={14} className="text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Provide your official MT5 Broker details to establish a live connection to your real trading account securely.
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1">Broker Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. FTMO, IC Markets, RoboForex"
                  value={broker}
                  onChange={(e) => setBroker(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-700"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1">Server Name</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. FTMO-Server, ICMarkets-Demo"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1">Account Name / Login ID</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. 509201"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-black text-zinc-400 mb-1">MT5 Password</label>
                <input 
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-700"
                />
              </div>
            </div>
          </div>
        )}

        {/* Optional Custom MetaApi Token override */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowTokenInput(!showTokenInput)}
            className="text-[11px] font-bold text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Key size={12} className={customMetaApiToken ? "text-emerald-400" : "text-zinc-500"} />
            <span>
              {customMetaApiToken ? "Custom MetaApi Token: Active" : "Have your own MetaApi Token? (Optional override)"}
            </span>
            {showTokenInput ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showTokenInput && (
            <div className="mt-2.5 p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-850 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-zinc-400">MetaApi API Token</label>
                <a
                  href="https://app.metaapi.cloud/token"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 underline font-medium"
                >
                  Generate at app.metaapi.cloud <ExternalLink size={9} />
                </a>
              </div>
              <input
                type="text"
                placeholder="eyJhbGciOi..."
                value={customMetaApiToken}
                onChange={(e) => {
                  setCustomMetaApiToken(e.target.value);
                  localStorage.setItem("journaly_custom_metaapi_token", e.target.value.trim());
                }}
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500/50 rounded-lg px-3 py-2 text-xs text-zinc-200 outline-none font-mono"
              />
              <p className="text-[10px] text-zinc-500">
                This token will authenticate directly with MetaApi Cloud, bypassing any missing or expired server tokens.
              </p>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-black uppercase text-xs tracking-wider rounded-xl transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
        >
          {loading ? "Establishing Broker Link..." : "Link MetaTrader 5 Account"}
        </button>
      </form>
    </div>
  );
}
