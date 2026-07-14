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
  Database
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

  // Check backend server-side MetaApi Token configuration on mount
  useEffect(() => {
    fetch("/api/mt5/config")
      .then(res => res.json())
      .then(data => {
        setIsTokenConfigured(!!data.configured);
      })
      .catch(() => {
        setIsTokenConfigured(false);
      });
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    let url = "/api/mt5/connect";
    const payload: any = {};

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
      url = "/api/connect-mt5";
      payload.login = login.trim();
      payload.password = password;
      payload.server = server.trim();
      payload.email = email;
    }

    setLoading(true);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        // Update user profile in Firestore for seamless local sync
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
      } else {
        setError(data.error || "Connection failed. Please check your credentials.");
      }
    } catch (err) {
      setError("Failed to communicate with MT5 secure gateway. Please verify your connection or check server logs.");
    } finally {
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

      {error && (
        <div className="my-3.5 p-3 rounded-xl bg-rose-950/20 border border-rose-900/30 text-rose-400 text-xs font-medium flex items-center gap-2">
          <ShieldAlert size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
