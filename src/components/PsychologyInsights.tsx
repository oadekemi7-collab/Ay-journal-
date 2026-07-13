import { BrainCircuit, TrendingUp, TrendingDown, Swords, HelpCircle } from 'lucide-react';
import { Trade } from '../types';

interface PsychologyInsightsProps {
  trades: Trade[];
}

interface EmotionAggregation {
  emotion: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPL: number;
  averagePL: number;
  winRate: number;
}

export default function PsychologyInsights({ trades }: PsychologyInsightsProps) {
  // If no trades exist yet
  if (trades.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 h-full flex flex-col justify-center items-center text-center text-zinc-500">
        <BrainCircuit size={40} className="text-zinc-700 mb-3" />
        <h4 className="font-display font-medium text-sm text-zinc-400">Psychological Performance Insights</h4>
        <p className="text-xs max-w-xs mt-1">
          Once you complete logging multiple trading setups with diverse emotions, advanced psychological analysis will unlock here.
        </p>
      </div>
    );
  }

  // Aggregate stats by emotion
  const emotionMap: Record<string, EmotionAggregation> = {};

  trades.forEach((trade) => {
    const rawEmotion = trade.emotion || 'Unspecified';
    const emotion = rawEmotion.charAt(0).toUpperCase() + rawEmotion.slice(1);

    if (!emotionMap[emotion]) {
      emotionMap[emotion] = {
        emotion,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalPL: 0,
        averagePL: 0,
        winRate: 0,
      };
    }

    const agg = emotionMap[emotion];
    agg.totalTrades += 1;
    agg.totalPL += trade.pl;
    if (trade.pl > 0) {
      agg.wins += 1;
    } else if (trade.pl < 0) {
      agg.losses += 1;
    }
  });

  // Calculate averages and rates
  const emotionList: EmotionAggregation[] = Object.values(emotionMap).map((agg) => {
    return {
      ...agg,
      averagePL: agg.totalPL / agg.totalTrades,
      winRate: agg.totalTrades > 0 ? (agg.wins / agg.totalTrades) * 100 : 0,
    };
  });

  // Sort list by aggregate total profit/loss desc (highest profit to lowest)
  const sortedEmotions = [...emotionList].sort((a, b) => b.totalPL - a.totalPL);

  // Best/worst emotions based on total PL
  const bestEmotion = sortedEmotions.find(e => e.totalPL > 0);
  const worstEmotion = [...sortedEmotions].reverse().find(e => e.totalPL < 0);

  // Formatting helper
  const formatCompactCurrency = (value: number) => {
    const isNeg = value < 0;
    const absVal = Math.abs(value);
    const formatted = absVal.toLocaleString('en-US', {
      maximumFractionDigits: 0,
    });
    return `${isNeg ? '-' : '+'}$${formatted}`;
  };

  return (
    <div id="psychology-insights-section" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg h-full">
      <div className="flex items-center gap-2 mb-4">
        <BrainCircuit className="text-violet-500" size={18} />
        <h3 className="text-md font-bold font-display text-zinc-100">Mindset Analytics Dashboard</h3>
      </div>

      {/* Highlights - Best and Worst Emotional States */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5" id="mindset-cards-grid">
        {/* Most Gain Mindset */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3 flex items-start gap-2.5">
          <div className="p-2 rounded bg-emerald-950/45 text-emerald-400 border border-emerald-900/50 mt-0.5">
            <TrendingUp size={15} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Peak Performance Mindset</span>
            <h4 className="text-sm font-semibold text-zinc-100 mt-0.5 truncate">
              {bestEmotion ? bestEmotion.emotion : 'None yet'}
            </h4>
            <p className="text-[11px] text-zinc-400 mt-1 font-medium font-mono">
              {bestEmotion ? (
                <>
                  P/L: <span className="text-emerald-405 text-emerald-400 font-bold">{formatCompactCurrency(bestEmotion.totalPL)}</span> ({bestEmotion.totalTrades} {bestEmotion.totalTrades === 1 ? 'trade' : 'trades'})
                </>
              ) : (
                'Log profitable trade'
              )}
            </p>
          </div>
        </div>

        {/* Most Drawdown Mindset */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-3 flex items-start gap-2.5">
          <div className="p-2 rounded bg-rose-950/45 text-rose-450 border border-rose-900/50 mt-0.5">
            <TrendingDown size={15} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Heaviest Drawdown Trigger</span>
            <h4 className="text-sm font-semibold text-zinc-100 mt-0.5 truncate">
              {worstEmotion ? worstEmotion.emotion : 'None yet'}
            </h4>
            <p className="text-[11px] text-zinc-400 mt-1 font-medium font-mono">
              {worstEmotion ? (
                <>
                  P/L: <span className="text-red-405 text-red-400 font-bold">{formatCompactCurrency(worstEmotion.totalPL)}</span> ({worstEmotion.totalTrades} {worstEmotion.totalTrades === 1 ? 'trade' : 'trades'})
                </>
              ) : (
                'Keep drawdown low!'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Aggregate table/bars list */}
      <div className="space-y-3.5">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-1">
          Emotional Metrics Breakdown
        </span>

        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1" id="mindset-breakdown-scrollable">
          {sortedEmotions.map((agg) => {
            const isGood = agg.totalPL >= 0;
            // Percent width relative to absolute max PL for visual bar rendering
            const maxVal = Math.max(...sortedEmotions.map(e => Math.abs(e.totalPL)), 1);
            const rawPct = (Math.abs(agg.totalPL) / maxVal) * 100;
            const barWidth = Math.max(5, Math.min(100, rawPct));

            return (
              <div key={agg.emotion} className="group" id={`mindset-record-${agg.emotion}`}>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-200">{agg.emotion}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-medium">
                      {agg.totalTrades} {agg.totalTrades === 1 ? 'setup' : 'setups'}
                    </span>
                  </div>
                  <div className="font-mono text-zinc-300 flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">{agg.winRate.toFixed(0)}% WR</span>
                    <span className={`font-bold ${isGood ? 'text-emerald-400' : 'text-red-500'}`}>
                      {formatCompactCurrency(agg.totalPL)}
                    </span>
                  </div>
                </div>

                {/* Performance Color Bar */}
                <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden flex items-center">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isGood 
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-sm shadow-emerald-500/20' 
                        : 'bg-gradient-to-r from-red-650 to-red-500 shadow-sm shadow-red-500/20'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
