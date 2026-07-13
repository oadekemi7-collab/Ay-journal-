import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart3, Percent, DollarSign, Award, ArrowUpRight, ArrowDownRight, Scale, Zap, Activity } from 'lucide-react';
import { TradingStats } from '../types';

interface StatsDashboardProps {
  stats: TradingStats;
}

export default function StatsDashboard({ 
  stats, 
}: StatsDashboardProps) {
  // Formatting helper
  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (value > 0) return `+$${absValue}`;
    if (value < 0) return `-$${absValue}`;
    return `$${absValue}`;
  };

  const formatCurrencyNoSign = (value: number) => {
    return `$${Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const balance = stats.balance ?? 0;
  const equity = stats.equity ?? balance;
  const todayProfit = stats.todayProfit ?? 0;
  const winRate = stats.winRate ?? 0;
  const totalProfit = stats.totalProfit ?? 0;
  const totalLoss = stats.totalLoss ?? 0;
  const totalTrades = stats.totalTrades ?? 0;
  const profitFactor = stats.profitFactor ?? 0;
  const averageRR = stats.averageRR ?? 0;
  const bestTrade = stats.bestTrade ?? 0;
  const worstTrade = stats.worstTrade ?? 0;
  const mostWinsDay = stats.mostWinsDay ?? '—';
  const mostLossesDay = stats.mostLossesDay ?? '—';
  const mostWinsDayCount = stats.mostWinsDayCount ?? 0;
  const mostLossesDayCount = stats.mostLossesDayCount ?? 0;

  const isTodayProfit = todayProfit > 0;
  const isTodayLoss = todayProfit < 0;

  return (
    <div className="space-y-6" id="stats-dashboard-container">
      {/* 1. TOP ROW: PRIMARY FINANCIAL METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="stats-dashboard-primary-grid">
        
        {/* BALANCE CARD */}
        <div 
          id="card-balance"
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Account Balance</span>
            <div className="p-2 rounded-xl bg-zinc-950 text-emerald-400 border border-zinc-850">
              <DollarSign size={16} className="stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-tight">
              {formatCurrencyNoSign(balance)}
            </h2>
            <p className="text-[10px] text-zinc-500 mt-1 font-medium">
              Current settled equity valuation
            </p>
          </div>
        </div>

        {/* EQUITY CARD */}
        <div 
          id="card-equity"
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Account Equity</span>
            <div className="p-2 rounded-xl bg-zinc-950 text-teal-400 border border-zinc-850">
              <Scale size={16} className="stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h2 className="text-2xl sm:text-3xl font-black font-display text-teal-400 tracking-tight">
              {formatCurrencyNoSign(equity)}
            </h2>
            <p className="text-[10px] text-zinc-500 mt-1 font-medium">
              Real-time margin including floating P&L
            </p>
          </div>
        </div>

        {/* TODAY'S PROFIT CARD */}
        <div 
          id="card-today-profit"
          className={`rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden border transition-all ${
            isTodayProfit 
              ? 'bg-gradient-to-br from-emerald-950/40 to-zinc-900 border-emerald-500/30 shadow-emerald-950/5' 
              : isTodayLoss 
                ? 'bg-gradient-to-br from-rose-950/20 to-zinc-900 border-red-500/20' 
                : 'bg-zinc-900 border-zinc-800'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Today's Profit</span>
            <div className={`p-2 rounded-xl ${
              isTodayProfit 
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/40' 
                : isTodayLoss 
                  ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40' 
                  : 'bg-zinc-950 text-zinc-500 border border-zinc-850'
            }`}>
              {isTodayProfit ? <ArrowUpRight size={16} className="stroke-[2.5]" /> : isTodayLoss ? <ArrowDownRight size={16} className="stroke-[2.5]" /> : <Activity size={16} />}
            </div>
          </div>
          <div className="mt-4">
            <h2 className={`text-2xl sm:text-3xl font-black font-display tracking-tight ${
              isTodayProfit ? 'text-emerald-400' : isTodayLoss ? 'text-rose-400' : 'text-zinc-400'
            }`}>
              {formatCurrency(todayProfit)}
            </h2>
            <p className="text-[10px] text-zinc-500 mt-1 font-medium">
              Cumulative returns of closed deals today
            </p>
          </div>
        </div>

      </div>

      {/* 2. MIDDLE ROW: CORE EFFICIENCY METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats-dashboard-secondary-grid">
        
        {/* WIN RATE CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between relative overflow-hidden" id="metric-winrate">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Win Rate</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-emerald-400 border border-zinc-850">
              <Percent size={14} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight">
              {winRate.toFixed(1)}%
            </h3>
            <div className="w-full bg-zinc-950 h-1 rounded-full mt-2 overflow-hidden border border-zinc-850">
              <div 
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, winRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* TOTAL PROFIT CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-total-profit">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Profit</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-emerald-400 border border-zinc-850">
              <TrendingUp size={14} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight">
              {formatCurrencyNoSign(totalProfit)}
            </h3>
            <p className="text-[9px] text-zinc-550 mt-1 font-medium">Sum of all winning payouts</p>
          </div>
        </div>

        {/* TOTAL LOSS CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-total-loss">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Loss</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-rose-400 border border-zinc-850">
              <TrendingDown size={14} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl sm:text-2xl font-bold font-mono text-rose-400 tracking-tight">
              {formatCurrencyNoSign(totalLoss)}
            </h3>
            <p className="text-[9px] text-zinc-550 mt-1 font-medium">Sum of all losing deficits</p>
          </div>
        </div>

        {/* NUMBER OF TRADES CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-total-trades">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Trades</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-zinc-400 border border-zinc-850">
              <BarChart3 size={14} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl sm:text-2xl font-bold font-display text-white tracking-tight">
              {totalTrades}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 text-[9px] text-zinc-500 font-medium">
              <span className="text-emerald-500">{stats.winningCount} W</span>
              <span>•</span>
              <span className="text-rose-400">{stats.losingCount} L</span>
              {stats.breakEvenCount > 0 && (
                <>
                  <span>•</span>
                  <span>{stats.breakEvenCount} BE</span>
                </>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* 3. BOTTOM ROW: RATIOS AND EXTREMES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats-dashboard-tertiary-grid">
        
        {/* PROFIT FACTOR CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-profit-factor">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Profit Factor</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-teal-400 border border-zinc-850">
              <Zap size={14} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className={`text-xl sm:text-2xl font-bold font-display tracking-tight ${
              profitFactor >= 1.5 ? 'text-teal-400' : profitFactor >= 1.0 ? 'text-zinc-200' : 'text-rose-400'
            }`}>
              {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
            </h3>
            <p className="text-[9px] text-zinc-550 mt-1 font-medium">Gross wins divided by losses</p>
          </div>
        </div>

        {/* AVERAGE RR CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-avg-rr">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Average R:R</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-indigo-400 border border-zinc-850">
              <Award size={14} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
              averageRR >= 1.5 ? 'text-emerald-400' : 'text-zinc-200'
            }`}>
              {averageRR.toFixed(1)}x
            </h3>
            <p className="text-[9px] text-zinc-550 mt-1 font-medium">Reward-to-risk multiplier</p>
          </div>
        </div>

        {/* BEST TRADE CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-best-trade">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Best Trade</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-emerald-400 border border-zinc-850">
              <ArrowUpRight size={14} className="stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight">
              {bestTrade > 0 ? formatCurrency(bestTrade) : '$0.00'}
            </h3>
            <p className="text-[9px] text-zinc-550 mt-1 font-medium">Highest single payout record</p>
          </div>
        </div>

        {/* WORST TRADE CARD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col justify-between" id="metric-worst-trade">
          <div className="flex justify-between items-start">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400">Worst Trade</span>
            <div className="p-1.5 rounded-lg bg-zinc-950 text-rose-400 border border-zinc-850">
              <ArrowDownRight size={14} className="stroke-[2.5]" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-xl sm:text-2xl font-bold font-mono text-rose-400 tracking-tight">
              {worstTrade < 0 ? formatCurrency(worstTrade) : '$0.00'}
            </h3>
            <p className="text-[9px] text-zinc-550 mt-1 font-medium">Max single drawdown deficit</p>
          </div>
        </div>

      </div>

      {/* 4. WEEKDAY PERFORMANCE ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="stats-dashboard-weekday-grid">
        
        {/* MOST WINS DAY */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex justify-between items-center" id="metric-most-wins-day">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400 block">Most Wins Day</span>
              <h3 className="text-lg sm:text-xl font-black font-display text-white tracking-tight mt-0.5">
                {mostWinsDay}
              </h3>
            </div>
          </div>
          {mostWinsDayCount > 0 && (
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                {mostWinsDayCount} {mostWinsDayCount === 1 ? 'Win' : 'Wins'}
              </span>
            </div>
          )}
        </div>

        {/* MOST LOSSES DAY */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex justify-between items-center" id="metric-most-losses-day">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <TrendingDown size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-zinc-400 block">Most Losses Day</span>
              <h3 className="text-lg sm:text-xl font-black font-display text-white tracking-tight mt-0.5">
                {mostLossesDay}
              </h3>
            </div>
          </div>
          {mostLossesDayCount > 0 && (
            <div className="text-right">
              <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                {mostLossesDayCount} {mostLossesDayCount === 1 ? 'Loss' : 'Losses'}
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
