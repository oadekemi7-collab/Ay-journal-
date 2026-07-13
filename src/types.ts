export type EmotionType = 
  | 'Disciplined'
  | 'Calm'
  | 'Confident'
  | 'Fearful'
  | 'Greedy'
  | 'Revenge'
  | 'FOMO'
  | 'Impatient';

export interface Trade {
  id: string;
  pair: string;
  type: 'BUY' | 'SELL';
  risk: number;
  pl: number;
  emotion: EmotionType | string;
  date: string; // ISO date string or YYYY-MM-DD
  notes?: string;
  source?: 'manual' | 'mt5';
  mt5DealId?: string;
  volume?: number;
  commission?: number;
  swap?: number;
}

export interface TradingStats {
  totalPL: number;
  totalTrades: number;
  winRate: number; // percentage (0 to 100)
  winningCount: number;
  losingCount: number;
  breakEvenCount: number;
  totalWinsPL: number; // sum of positive PL
  totalLossesPL: number; // sum of negative PL
  averageRisk: number;
  averagePL: number;
  balance?: number;
  equity?: number;
  todayProfit?: number;
  totalProfit?: number;
  totalLoss?: number;
  profitFactor?: number;
  averageRR?: number;
  bestTrade?: number;
  worstTrade?: number;
  mostWinsDay?: string;
  mostLossesDay?: string;
  mostWinsDayCount?: number;
  mostLossesDayCount?: number;
}
