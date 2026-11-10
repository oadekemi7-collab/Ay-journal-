import React, { useState, useEffect } from 'react';
import { 
  X, 
  DollarSign, 
  CheckCircle, 
  Server, 
  Lock, 
  ShieldCheck, 
  RefreshCw, 
  ArrowRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';

interface SetRealBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  currentBalance: number | null;
  currentEquity: number | null;
  brokerName?: string;
  loginId?: string;
  totalRealPnL?: number;
  tradesCount?: number;
  onBalanceUpdated: (newBalance: number, newEquity: number) => void;
}

export default function SetRealBalanceModal({
  isOpen,
  onClose,
  email,
  currentBalance,
  currentEquity,
  brokerName = 'DerivSVG-Server-02',
  loginId = '101523396',
  totalRealPnL = -26367.52,
  tradesCount = 1233,
  onBalanceUpdated,
}: SetRealBalanceModalProps) {
  const [balanceInput, setBalanceInput] = useState<string>('');
  const [equityInput, setEquityInput] = useState<string>('');
  const [useSeparateEquity, setUseSeparateEquity] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (currentBalance !== null && currentBalance >= 0) {
        setBalanceInput(String(currentBalance));
        setEquityInput(String(currentEquity ?? currentBalance));
      } else {
        setBalanceInput('');
        setEquityInput('');
      }
      setError('');
      setSuccess('');
    }
  }, [isOpen, currentBalance, currentEquity]);

  if (!isOpen) return null;

  const handlePreset = (amount: number) => {
    setBalanceInput(String(amount));
    if (!useSeparateEquity) {
      setEquityInput(String(amount));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const parsedBalance = parseFloat(balanceInput.replace(/,/g, '').trim());
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      setError('Please enter a valid numeric account balance ($0 or greater).');
      return;
    }

    let parsedEquity = parsedBalance;
    if (useSeparateEquity && equityInput.trim()) {
      const eq = parseFloat(equityInput.replace(/,/g, '').trim());
      if (!isNaN(eq)) {
        parsedEquity = eq;
      }
    }

    setIsSubmitting(true);

    try {
      // Implied starting capital: Deposit = Current Balance - Net PnL
      const calculatedStarting = Math.max(0, parsedBalance - totalRealPnL);

      const res = await fetch('/api/mt5/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          balance: parsedBalance,
          equity: parsedEquity,
          startingBalance: calculatedStarting
        })
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data && data.success) {
        setSuccess(`Real MT5 Balance updated to $${parsedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}!`);
        onBalanceUpdated(parsedBalance, parsedEquity);
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setError(data?.error || 'Failed to update balance. Please try again.');
      }
    } catch (err: any) {
      setError(`Network error: ${err.message || String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-black text-white font-display uppercase tracking-tight">
                Set Real MT5 Account Balance
              </h3>
              <p className="text-xs text-zinc-400">
                Match your exact broker balance from MetaTrader 5
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 relative z-10">
          {/* Active Broker Info Badge */}
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-emerald-400" />
              <span className="font-bold text-zinc-200">{brokerName}</span>
              <span className="text-zinc-600">•</span>
              <span className="font-mono text-zinc-400">Login: {loginId}</span>
            </div>
            <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">
              {tradesCount.toLocaleString()} Synced Trades
            </span>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-2">
              Quick Starting Capital Presets
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {[500, 1000, 2500, 5000, 10000, 25000, 50000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handlePreset(amt)}
                  className="py-1.5 px-2 bg-zinc-950/60 hover:bg-emerald-500/10 border border-zinc-850 hover:border-emerald-500/30 text-zinc-300 hover:text-emerald-300 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer text-center"
                >
                  ${amt >= 1000 ? `${amt / 1000}k` : amt}
                </button>
              ))}
            </div>
          </div>

          {/* Real Balance Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-200 flex items-center justify-between">
              <span>Your Current Real MT5 Balance ($ USD)</span>
              <span className="text-[10px] text-zinc-500 font-normal">As shown in your MT5 app</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={balanceInput}
                onChange={(e) => {
                  setBalanceInput(e.target.value);
                  if (!useSeparateEquity) {
                    setEquityInput(e.target.value);
                  }
                }}
                placeholder="e.g. 5000.00"
                required
                className="w-full pl-8 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-base font-mono font-black text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                autoFocus
              />
            </div>
          </div>

          {/* Equity Toggle & Field */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label 
                onClick={() => setUseSeparateEquity(!useSeparateEquity)}
                className="flex items-center gap-2 text-xs font-medium text-zinc-400 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={useSeparateEquity}
                  onChange={(e) => setUseSeparateEquity(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Set separate Floating Equity (if you have open positions)</span>
              </label>
            </div>

            {useSeparateEquity && (
              <div className="relative animate-in fade-in slide-in-from-top-1 duration-150">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={equityInput}
                  onChange={(e) => setEquityInput(e.target.value)}
                  placeholder="e.g. 5025.50"
                  className="w-full pl-8 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-mono font-bold text-emerald-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
              </div>
            )}
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle size={14} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !balanceInput.trim()}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-450 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-600 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} className="stroke-[2.5]" />
                  <span>Save Real Balance</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
