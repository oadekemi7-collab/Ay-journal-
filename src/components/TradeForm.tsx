import { useState, FormEvent } from 'react';
import { PlusCircle, Info, Smile, Key } from 'lucide-react';
import { EmotionType, Trade } from '../types';

interface TradeFormProps {
  onAddTrade: (trade: Omit<Trade, 'id'>) => void;
}

const COMMON_PAIRS = ['XAUUSD', 'NAS100', 'EURUSD', 'BTCUSD', 'GBPUSD', 'US30'];

const EMOTION_OPTIONS: { value: EmotionType; label: string; colorClass: string; desc: string }[] = [
  { value: 'Disciplined', label: 'Disciplined', colorClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50', desc: 'Stuck strictly to the plan.' },
  { value: 'Calm', label: 'Calm', colorClass: 'bg-teal-950/40 text-teal-400 border-teal-900/50', desc: 'No physiological anxiety or stress.' },
  { value: 'Confident', label: 'Confident', colorClass: 'bg-indigo-950/40 text-indigo-400 border-indigo-900/50', desc: 'High trust in set up, relaxed.' },
  { value: 'Fearful', label: 'Fearful', colorClass: 'bg-amber-950/40 text-amber-500 border-amber-900/50', desc: 'Anxious, hesitant, closed early.' },
  { value: 'Greedy', label: 'Greedy', colorClass: 'bg-rose-950/40 text-rose-400 border-rose-900/50', desc: 'Targeting excessive gains, ignored risk.' },
  { value: 'Revenge', label: 'Revenge', colorClass: 'bg-purple-950/40 text-purple-400 border-purple-900/50', desc: 'Trading right after a loss to make back money.' },
  { value: 'FOMO', label: 'FOMO', colorClass: 'bg-sky-950/40 text-sky-450 border-sky-900/50', desc: 'Fear of missing out, chased momentum.' },
  { value: 'Impatient', label: 'Impatient', colorClass: 'bg-violet-950/40 text-violet-400 border-violet-900/50', desc: 'Entered too early, didn\'t wait for trigger.' },
];

export default function TradeForm({ onAddTrade }: TradeFormProps) {
  const [pair, setPair] = useState('');
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [risk, setRisk] = useState('');
  const [plType, setPlType] = useState<'WIN' | 'LOSS'>('WIN');
  const [plAmount, setPlAmount] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType | 'custom'>('Disciplined');
  const [customEmotion, setCustomEmotion] = useState('');
  const [date, setDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [notes, setNotes] = useState('');

  // Form error states
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!pair.trim()) {
      setError('Trading Pair/Symbol is required.');
      return;
    }

    const calculatedRisk = parseFloat(risk);
    if (isNaN(calculatedRisk) || calculatedRisk < 0) {
      setError('Risk must be a valid positive number.');
      return;
    }

    const absPL = parseFloat(plAmount);
    if (isNaN(absPL) || absPL < 0) {
      setError('P/L amount must be a valid positive number.');
      return;
    }

    const finalPL = plType === 'WIN' ? absPL : -absPL;
    const finalEmotion = selectedEmotion === 'custom' ? customEmotion.trim() : selectedEmotion;

    if (!finalEmotion) {
      setError('Please choose or enter an emotional state.');
      return;
    }

    onAddTrade({
      pair: pair.toUpperCase().trim(),
      type: direction,
      risk: calculatedRisk,
      pl: finalPL,
      emotion: finalEmotion,
      date,
      notes: notes.trim() || undefined,
    });

    // Reset some fields
    setPair('');
    setRisk('');
    setPlAmount('');
    setNotes('');
    setCustomEmotion('');
    setSelectedEmotion('Disciplined');
  };

  const handleQuickPairSelect = (selectedPair: string) => {
    setPair(selectedPair);
  };

  const currentEmotionDetail = EMOTION_OPTIONS.find(e => e.value === selectedEmotion);

  return (
    <div id="trade-input-form-container" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <PlusCircle className="text-emerald-500" size={18} />
        <h3 className="text-md font-bold font-display text-zinc-100">Log Trading Session</h3>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900/50 text-red-400 p-3 rounded-lg text-xs font-semibold mb-4 flex items-start gap-2">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" id="log-trade-form">
        {/* Trading Pair */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Trading Pair / Symbol
          </label>
          <input
            type="text"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-650"
            placeholder="e.g. NAS100, XAUUSD"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
          />
          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COMMON_PAIRS.map((p) => (
              <button
                key={p}
                type="button"
                className={`text-[10px] font-mono px-2 py-1 rounded transition-colors duration-155 border ${
                  pair.toUpperCase() === p
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                    : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-800/80'
                }`}
                onClick={() => handleQuickPairSelect(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Direction (BUY vs SELL) */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Order Direction
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`py-2 rounded-lg text-xs font-bold font-display transition-all border ${
                direction === 'BUY'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50 shadow-sm shadow-emerald-900/10'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
              }`}
              onClick={() => setDirection('BUY')}
            >
              LONG / BUY
            </button>
            <button
              type="button"
              className={`py-2 rounded-lg text-xs font-bold font-display transition-all border ${
                direction === 'SELL'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/50 shadow-sm shadow-rose-900/10'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
              }`}
              onClick={() => setDirection('SELL')}
            >
              SHORT / SELL
            </button>
          </div>
        </div>

        {/* Risk and P/L Section */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Risk Size ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs">$</span>
              <input
                type="number"
                step="any"
                min="0"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg pl-6 pr-3 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-600"
                placeholder="100.00"
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Result (P/L)
            </label>
            {/* Win/Loss small toggle identifier */}
            <div className="flex gap-2 mb-1.5 justify-end">
              <button
                type="button"
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                  plType === 'WIN' 
                    ? 'bg-emerald-500 text-zinc-950 shadow-sm' 
                    : 'text-zinc-500 bg-zinc-950'
                }`}
                onClick={() => setPlType('WIN')}
              >
                WIN (+)
              </button>
              <button
                type="button"
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-all ${
                  plType === 'LOSS' 
                    ? 'bg-rose-500 text-zinc-950 shadow-sm' 
                    : 'text-zinc-500 bg-zinc-950'
                }`}
                onClick={() => setPlType('LOSS')}
              >
                LOSS (-)
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs">
                {plType === 'WIN' ? '+' : '-'}$
              </span>
              <input
                type="number"
                step="any"
                min="0"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg pl-7 pr-3 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-600"
                placeholder="250.00"
                value={plAmount}
                onChange={(e) => setPlAmount(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Emotion Tracking field (VERY IMPORTANT) */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Smile size={13} className="text-zinc-400" />
              Mental Mindset / Emotion
            </label>
            <span className="text-[10px] text-zinc-500">Psychology context</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <select
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-200"
              value={selectedEmotion}
              onChange={(e) => setSelectedEmotion(e.target.value as EmotionType | 'custom')}
            >
              <option disabled value="">Select trade mindset...</option>
              {EMOTION_OPTIONS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
              <option value="custom">✍️ Custom Mindset...</option>
            </select>

            {/* Custom Mindset Input */}
            {selectedEmotion === 'custom' && (
              <textarea
                rows={3}
                maxLength={3000}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-650 mt-1 resize-y"
                placeholder="Describe your mental performance, emotional state, or customized rules in extensive detail (unlimited thoughts allowed)..."
                value={customEmotion}
                onChange={(e) => setCustomEmotion(e.target.value)}
              />
            )}

            {/* Hint about selected mindset */}
            {selectedEmotion !== 'custom' && currentEmotionDetail && (
              <p className="text-[10px] text-zinc-500 italic px-1">
                📌 {currentEmotionDetail.desc}
              </p>
            )}
          </div>
        </div>

        {/* Date Selector */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Execution Date
          </label>
          <input
            type="date"
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-350 font-mono"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Description Notes - Large text block */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Notes (Optional)
          </label>
          <textarea
            rows={3}
            maxLength={1000}
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-650 resize-y"
            placeholder="Write very long notes... (e.g. Market trend, daily rules followed, lesson of the setup, mistakes to avoid)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-450 hover:to-teal-500 text-zinc-950 font-bold font-display py-2.5 px-4 rounded-lg text-sm shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98] mt-3"
        >
          Add Logged Trade
        </button>
      </form>
    </div>
  );
}
