import { useState } from 'react';
import { 
  ShieldAlert, 
  Users, 
  Layers, 
  Percent, 
  Search, 
  X, 
  Cpu, 
  TrendingUp, 
  Activity, 
  CheckCircle, 
  Globe, 
  DollarSign 
} from 'lucide-react';
import { AdminDiagnosticsData } from '../lib/firebase';

interface AdminDiagnosticsProps {
  onClose: () => void;
  data: AdminDiagnosticsData | null;
  isLoading: boolean;
}

export default function AdminDiagnostics({ onClose, data, isLoading }: AdminDiagnosticsProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (isLoading) {
    return (
      <div 
        id="admin-diagnostics-overlay-loading" 
        className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      >
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-2xl p-8 max-w-sm w-full text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-emerald-500 animate-spin mb-4" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 font-display">Syncing Engine</h3>
          <p className="text-xs text-zinc-500 mt-2">Retrieving global live users, multi-user partitions, and logged setup aggregates from Firestore...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Filter users based on search
  const filteredUsers = data.userBreakdown.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const averageTrades = data.totalUsers > 0 
    ? (data.totalTrades / data.totalUsers).toFixed(1) 
    : '0';

  const topAsset = data.globalPairs.length > 0 
    ? data.globalPairs[0].pair 
    : 'N/A';

  // Capitalize format for nice currency output
  const formatCurrency = (val: number) => {
    return typeof val === 'number'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
      : '$0';
  };

  return (
    <div 
      id="admin-diagnostics-modal-overlay" 
      className="fixed inset-0 bg-zinc-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto select-none"
    >
      <div 
        id="admin-diagnostics-dashboard" 
        className="w-full max-w-4xl bg-zinc-900/95 border border-emerald-500/20 rounded-3xl overflow-hidden shadow-2xl shadow-emerald-950/20 relative animate-fade-in my-8"
      >
        {/* Subtle decorative grid background */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(to_right,#10b981_1px,transparent_1px),linear-gradient(to_bottom,#10b981_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Header Ribbon */}
        <div className="px-6 py-5 border-b border-zinc-850 bg-zinc-900/50 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Cpu size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black font-display tracking-tight text-white uppercase sm:text-base">
                  Database Diagnostics &amp; Telemetry
                </h2>
                <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-950/30 border border-rose-900/30 px-1.5 py-0.5 rounded leading-none shrink-0 animate-pulse">
                  Admin Only
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">Global operational analytics &amp; user statistics for Journaly database instances</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            id="close-diagnostics-modal-btn"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto relative z-10 scrollbar-thin">
          
          {/* SECURE ALERT HANDSHAKE BANNER */}
          <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3" id="admin-security-alert-box">
            <Globe size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-emerald-400/90 font-medium">
              <span className="font-extrabold text-emerald-300">Operational Invariant Protocol:</span> You are logged in with credential <code className="bg-emerald-950/40 text-emerald-300 px-1 py-0.5 rounded font-bold border border-emerald-900/30">toolaoilqbi@gmail.com</code>. Access is restricted programmatically. This panel enables live scanning across database partitions and does not compromise isolated user workspaces.
            </div>
          </div>

          {/* METRIC CARD HUD GRID */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="admin-stats-hud-grid">
            
            {/* CARD 1: TOTAL USERS */}
            <div id="diagnostics-card-users" className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 text-zinc-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Active Users</span>
                <Users size={14} className="text-emerald-400" />
              </div>
              <div>
                <span className="text-2xl font-black font-display text-zinc-100">{data.totalUsers}</span>
                <span className="text-[10px] text-emerald-400 ml-1.5 font-bold">registered</span>
              </div>
            </div>

            {/* CARD 2: TOTAL TRADES LOGGED */}
            <div id="diagnostics-card-trades" className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 text-zinc-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">Total Logged Setups</span>
                <Layers size={14} className="text-emerald-400" />
              </div>
              <div>
                <span className="text-2xl font-black font-display text-zinc-100">{data.totalTrades}</span>
                <span className="text-[10px] text-emerald-400 ml-1.5 font-bold">executions</span>
              </div>
            </div>

            {/* CARD 3: AVERAGE SETUPS PER USER */}
            <div id="diagnostics-card-avg" className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 text-zinc-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">Avg. Setups / User</span>
                <Percent size={14} className="text-emerald-400" />
              </div>
              <div>
                <span className="text-2xl font-black font-display text-zinc-100">{averageTrades}</span>
                <span className="text-[10px] text-emerald-400 ml-1.5 font-bold">ratio</span>
              </div>
            </div>

            {/* CARD 4: TOP TRADED ASSET CLUSTER */}
            <div id="diagnostics-card-top-asset" className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3 text-zinc-500">
                <span className="text-[10px] font-bold uppercase tracking-wider">Primary Instrument</span>
                <TrendingUp size={14} className="text-emerald-400" />
              </div>
              <div>
                <span className="text-xl font-black font-display text-emerald-400 max-w-full truncate block uppercase">{topAsset}</span>
                <span className="text-[9px] text-zinc-500">most active pair</span>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" id="admin-analytics-splits">
            
            {/* COLUMNS 1, 2, 3: USER PROFILE REGISTRATION DIRECTORY */}
            <div className="lg:col-span-3 space-y-4" id="admin-user-directory-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">User Telemetry Directory</h3>
                  <p className="text-[10px] text-zinc-550 text-zinc-500 mt-0.5">Database records indexed across partitions</p>
                </div>
                
                {/* Internal telemetry Search Bar */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter by email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500 pr-8 placeholder-zinc-600 font-mono w-full sm:w-48"
                  />
                  <Search size={11} className="absolute right-2.5 top-2.5 text-zinc-500" />
                </div>
              </div>

              {/* Table list of all users */}
              <div className="overflow-x-auto rounded-xl border border-zinc-850 bg-zinc-950">
                <table className="w-full text-left text-[11px]" id="admin-telemetry-user-table">
                  <thead className="bg-zinc-900 border-b border-zinc-850 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-4 py-2.5">User Email</th>
                      <th className="px-4 py-2.5 text-center">Setups Logged</th>
                      <th className="px-4 py-2.5 text-right">Starting Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 font-mono">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                          No database partitions found matching search criteria
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u, i) => (
                        <tr key={i} className="hover:bg-zinc-900/40 text-zinc-300">
                          <td className="px-4 py-2.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                            <span className="truncate max-w-[180px] sm:max-w-xs block" title={u.email}>
                              {u.email}
                            </span>
                            {u.email === 'toolaoilqbi@gmail.com' && (
                              <span className="text-[8px] bg-emerald-950 text-emerald-400 border border-emerald-900/40 px-1 py-0.2 rounded font-bold shrink-0">
                                OWNER
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-zinc-100">
                            {u.tradeCount}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-400">
                            {u.startingBalance !== null ? formatCurrency(u.startingBalance) : (
                              <span className="text-zinc-600 text-[9px] uppercase font-normal">Not Configured</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] px-1 text-zinc-500 flex items-center justify-between">
                <span>Showing {filteredUsers.length} of {data.totalUsers} indexed system entities</span>
                <span>Active Handshakes: 100% Secure</span>
              </div>
            </div>

            {/* COLUMN 4, 5: PAIR LOG DISTRIBUTION */}
            <div className="lg:col-span-2 space-y-4 bg-zinc-950/40 border border-zinc-850 p-4 rounded-2xl" id="admin-pair-distribution-card">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Global Instrument Volume</h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">Distribution of trading assets across all logged history</p>
              </div>

              {data.globalPairs.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 font-mono text-[11px]">
                  No asset pairs logged in the database yet
                </div>
              ) : (
                <div className="space-y-3 pt-2" id="admin-asset-bars-grid">
                  {data.globalPairs.map((pairItem, idx) => {
                    const percentage = data.totalTrades > 0 
                      ? (pairItem.count / data.totalTrades) * 100 
                      : 0;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-bold text-zinc-300 uppercase">{pairItem.pair}</span>
                          <span className="text-[10px] text-zinc-500">
                            {pairItem.count} {pairItem.count === 1 ? 'setup' : 'setups'} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        {/* Custom progress bar */}
                        <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-850">
                          <div 
                            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-zinc-950/80 border-t border-zinc-850 flex items-center justify-between font-mono text-[10px] text-zinc-500 relative z-10">
          <div className="flex items-center gap-1">
            <CheckCircle size={10} className="text-emerald-500" />
            <span>Telemetry Server online &amp; synchronized.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-805 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            id="close-diagnostics-footer-btn"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}
