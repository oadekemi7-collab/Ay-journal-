import { Calendar as CalendarIcon, Check, FilterX, HelpCircle, AlertCircle, Sparkles, TrendingUp, TrendingDown, Ban } from 'lucide-react';
import { Trade } from '../types';

interface DateStripProps {
  selectedDateFilter: string | null;
  onSelectDateFilter: (dateStr: string | null) => void;
  trades: Trade[];
}

export default function DateStrip({ selectedDateFilter, onSelectDateFilter, trades }: DateStripProps) {
  // Current local time anchor
  const todayObj = new Date();
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Generate 9 days starting from 8 days ago (offset -8) up to today (offset 0)
  const daysData = Array.from({ length: 9 }, (_, i) => {
    const offset = i - 8; // offset starts at -8 (8 days ago) and ends at 0 (today)
    const d = new Date(todayObj);
    d.setDate(todayObj.getDate() + offset);
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dateNum = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dateNum}`; // YYYY-MM-DD
    
    const dayName = dayLabels[d.getDay()];
    const dateDay = d.getDate();
    // Month is indexed relative to the actual generated month
    const monthName = monthLabels[d.getMonth()] || 'Jun';
    
    return {
      dateString,
      dayName,
      dateDay,
      monthName,
      isToday: offset === 0,
      isFuture: offset > 0,
    };
  });

  return (
    <div id="trading-date-strip" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      {/* Decorative backdrop light effect */}
      <div className="absolute top-0 right-0 w-80 h-32 bg-emerald-500/5 blur-[80px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-0 w-80 h-32 bg-rose-500/5 blur-[80px] pointer-events-none rounded-full" />

      {/* Header of DateStrip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10 border-b border-zinc-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400">
            <CalendarIcon size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100 font-display">
              Vitals &amp; Session Timeline Strip
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Live visual status timeline. Box colors automatically shift dynamically matching logged profit and loss.
            </p>
          </div>
        </div>
        
        {selectedDateFilter && (
          <button
            onClick={() => onSelectDateFilter(null)}
            className="text-xs font-bold text-rose-450 text-rose-400 bg-rose-950/40 hover:bg-rose-900/40 px-4 py-2 rounded-xl border border-rose-900/60 flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/20 hover:scale-[1.02]"
          >
            <FilterX size={13} />
            <span>Show All Executions ({trades.length})</span>
          </button>
        )}
      </div>

      {/* Grid containing jumbo size date boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3 relative z-10" id="large-date-boxes">
        {daysData.map((day) => {
          const isSelected = selectedDateFilter === day.dateString;
          
          // Fetch trades for this day
          const dayTrades = trades.filter(t => t.date === day.dateString);
          const tradeCount = dayTrades.length;
          const totalPL = dayTrades.reduce((sum, t) => sum + t.pl, 0);
          const hasTrades = tradeCount > 0;

          // Formatting helper
          const formatAmount = (val: number) => {
            if (val === 0) return '$0.00';
            const prefix = val > 0 ? '+' : '-';
            return `${prefix}$${Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
          };

          // Determination of styles (Color align with profit/loss, or fallback today-red / future-green)
          let cardBgStyle = '';
          let borderStyle = '';
          let plTextStyle = '';
          let statusPrompt = '';
          let statusBadgeText = '';
          let statusBadgeClass = '';
          let iconComponent = null;

          if (hasTrades) {
            // Live execution found on this day - color align with profit / loss!
            if (totalPL > 0) {
              // Profitable Day (GREEN)
              cardBgStyle = isSelected
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-zinc-950 shadow-lg shadow-emerald-500/20'
                : 'bg-emerald-950/30 hover:bg-emerald-950/50 text-emerald-100';
              borderStyle = isSelected ? 'border-zinc-100 ring-2 ring-emerald-400' : 'border-emerald-500/50 hover:border-emerald-400';
              plTextStyle = isSelected ? 'text-zinc-950 font-black text-lg' : 'text-emerald-400 font-extrabold text-base';
              
              // Find first trade info for prompt details
              const mainTrade = dayTrades[0];
              statusPrompt = `${mainTrade.pair} ${mainTrade.type} (${mainTrade.emotion})`;
              statusBadgeText = `${tradeCount} Win${tradeCount > 1 ? 's' : ''}`;
              statusBadgeClass = isSelected ? 'bg-zinc-950 text-emerald-400' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
              iconComponent = <TrendingUp size={14} className={isSelected ? 'text-zinc-950' : 'text-emerald-400'} />;
            } else if (totalPL < 0) {
              // Losing Day (RED)
              cardBgStyle = isSelected
                ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-zinc-950 shadow-lg shadow-rose-500/20'
                : 'bg-rose-950/30 hover:bg-rose-950/50 text-rose-100';
              borderStyle = isSelected ? 'border-zinc-100 ring-2 ring-rose-400' : 'border-rose-500/50 hover:border-rose-400';
              plTextStyle = isSelected ? 'text-zinc-950 font-black text-lg' : 'text-rose-400 font-extrabold text-base';
              
              const mainTrade = dayTrades[0];
              statusPrompt = `${mainTrade.pair} ${mainTrade.type} (${mainTrade.emotion})`;
              statusBadgeText = `${tradeCount} Loss${tradeCount > 1 ? 'es' : ''}`;
              statusBadgeClass = isSelected ? 'bg-zinc-950 text-rose-400' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
              iconComponent = <TrendingDown size={14} className={isSelected ? 'text-zinc-950' : 'text-rose-400'} />;
            } else {
              // Breakeven Day (Neutral gray/yellow alignment)
              cardBgStyle = isSelected
                ? 'bg-gradient-to-br from-zinc-500 to-zinc-600 text-zinc-950 shadow-lg shadow-zinc-500/20'
                : 'bg-zinc-800/40 hover:bg-zinc-850 text-zinc-300';
              borderStyle = isSelected ? 'border-zinc-100 ring-2 ring-zinc-400' : 'border-zinc-700 hover:border-zinc-600';
              plTextStyle = isSelected ? 'text-zinc-950 font-black text-lg' : 'text-zinc-400 font-extrabold text-base';
              
              statusPrompt = 'Breakeven Executed';
              statusBadgeText = 'Neutral';
              statusBadgeClass = isSelected ? 'bg-zinc-950 text-zinc-400' : 'bg-zinc-800 text-zinc-400';
              iconComponent = <HelpCircle size={14} className={isSelected ? 'text-zinc-950' : 'text-zinc-450 text-zinc-400'} />;
            }
          } else {
            // NO trades logged on this day - style as neutral gray/zinc
            cardBgStyle = isSelected
              ? 'bg-zinc-800 text-zinc-100 shadow-xl shadow-zinc-950/40 border-zinc-700'
              : 'bg-zinc-900/40 hover:bg-zinc-900/80 text-zinc-400';
            borderStyle = isSelected ? 'border-zinc-700 ring-2 ring-zinc-800' : 'border-zinc-900 hover:border-zinc-800';
            plTextStyle = isSelected ? 'text-zinc-300 font-extrabold text-base' : 'text-zinc-500 font-bold text-xs';
            statusPrompt = 'No Trades Logged';
            
            if (day.isToday) {
              statusBadgeText = 'TODAY';
              statusBadgeClass = isSelected ? 'bg-zinc-950 text-zinc-400' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-800';
              iconComponent = <Ban size={13} className="text-zinc-500 animate-pulse" />;
            } else {
              statusBadgeText = 'NEUTRAL';
              statusBadgeClass = isSelected ? 'bg-zinc-950 text-zinc-500' : 'bg-zinc-900 border border-zinc-850/60 text-zinc-500';
              iconComponent = <HelpCircle size={13} className="text-zinc-650 text-zinc-500" />;
            }
          }

          return (
            <button
              key={day.dateString}
              id={`date-strip-box-${day.dateString}`}
              onClick={() => onSelectDateFilter(isSelected ? null : day.dateString)}
              className={`flex flex-col justify-between p-4.5 rounded-2xl border text-left transition-all duration-300 cursor-pointer min-h-[145px] hover:min-h-[145px] relative overflow-hidden ${cardBgStyle} ${borderStyle} ${
                isSelected ? 'scale-[1.03] shadow-xl z-20' : 'hover:scale-[1.01]'
              }`}
            >
              {/* Box Header (Month, Day name, and Status Badge) */}
              <div className="flex justify-between items-start w-full relative z-10">
                <div className="flex flex-col">
                  <span className={`text-[9px] uppercase font-bold tracking-wider opacity-70 ${isSelected ? 'text-zinc-950' : 'text-zinc-400'}`}>
                    {day.monthName}
                  </span>
                  <span className={`text-sm font-black font-display uppercase tracking-tight ${isSelected ? 'text-zinc-950' : 'text-zinc-200'}`}>
                    {day.dayName}
                  </span>
                </div>

                {/* Badge outlining status */}
                <span className={`text-[8px] font-black tracking-widest px-2 py-0.5 rounded-full uppercase leading-none ${statusBadgeClass}`}>
                  {statusBadgeText}
                </span>
              </div>

              {/* Box Body: Big Day Number */}
              <div className="my-2.5 flex items-baseline gap-2 relative z-10">
                <span className={`text-4xl font-extrabold font-display tracking-tighter leading-none ${isSelected ? 'text-zinc-950' : 'text-zinc-100'}`}>
                  {day.dateDay}
                </span>
                
                {/* Micro counter/icon */}
                <div className="flex items-center">
                  {iconComponent}
                </div>
              </div>

              {/* Box Footer: Profit & Loss and Emotional prompt alignment */}
              <div className="w-full mt-1.5 pt-2 border-t border-zinc-800/20 relative z-10 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className={`font-mono tracking-tight leading-none ${plTextStyle}`}>
                    {hasTrades ? formatAmount(totalPL) : '$0.00'}
                  </span>
                </div>
                
                <span className={`text-[9px] font-bold uppercase tracking-wider block truncate max-w-full ${
                  isSelected ? 'text-zinc-950 opacity-90' : 'text-zinc-400'
                }`}>
                  {statusPrompt}
                </span>
              </div>
              
              {/* Subtle design grid pattern inside individual box */}
              <div className="absolute right-1 bottom-1 opacity-5 pointer-events-none text-zinc-400 select-none text-[50px] font-black font-display leading-none">
                {day.dateDay}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
