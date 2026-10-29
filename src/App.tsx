import { useState, useEffect } from 'react';
import { 
  Activity, 
  Calendar, 
  Trash2, 
  Database, 
  Clock, 
  CheckCircle,
  HelpCircle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Filter,
  LogOut,
  User,
  Sun,
  Moon,
  Loader2,
  XCircle
} from 'lucide-react';
import { Trade, TradingStats } from './types';
import StatsDashboard from './components/StatsDashboard';
import DateStrip from './components/DateStrip';
import TradeForm from './components/TradeForm';
import PsychologyInsights from './components/PsychologyInsights';
import TradesTable from './components/TradesTable';
import GoogleLogin from './components/GoogleLogin';
import AdminDiagnostics from './components/AdminDiagnostics';
import SubscriptionModal from './components/SubscriptionModal';
import MT5ConnectionPanel from './components/MT5ConnectionPanel';
import { 
  getTradesForUser, 
  saveTradeToFirestore, 
  deleteTradeFromFirestore, 
  batchSaveTradesToFirestore, 
  clearAllUserTrades,
  clearMT5TradesForUser,
  getUserStartingBalance,
  saveUserStartingBalance,
  getAdminDiagnostics,
  AdminDiagnosticsData,
  getUserProfile,
  updateUserProfile,
  subscribeToTradesForUser,
  subscribeToUserProfile
} from './lib/firebase';

const generateDemoTrades = (): Trade[] => {
  const today = new Date();
  
  const formatDate = (daysOffset: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + daysOffset);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  return [
    {
      id: `demo-trade-1`,
      pair: 'NAS100',
      type: 'BUY',
      risk: 250,
      pl: 750,
      emotion: 'Disciplined',
      date: formatDate(0), // Today
      notes: 'Bullish breakout from the key demand zone. Entry was pristine, stayed very calm throughout the trade.',
    },
    {
      id: `demo-trade-2`,
      pair: 'XAUUSD',
      type: 'SELL',
      risk: 150,
      pl: -150,
      emotion: 'Greedy',
      date: formatDate(-1), // Yesterday
      notes: 'Attempted to short the retail resistance, got caught in a liquidity sweep. Violated maximum size limit.',
    },
    {
      id: `demo-trade-3`,
      pair: 'EURUSD',
      type: 'BUY',
      risk: 100,
      pl: 200,
      emotion: 'Calm',
      date: formatDate(-3), // 3 days ago
      notes: 'Standard London session continuation play. Hit 1:2 Risk-to-Reward ratio target flawlessly.',
    },
    {
      id: `demo-trade-4`,
      pair: 'GBPUSD',
      type: 'SELL',
      risk: 200,
      pl: 600,
      emotion: 'Confident',
      date: formatDate(-4), // 4 days ago
      notes: 'Faded the retail trap on GBPUSD during key news release. Very clean execution.',
    },
    {
      id: `demo-trade-5`,
      pair: 'BTCUSD',
      type: 'BUY',
      risk: 300,
      pl: -300,
      emotion: 'Revenge',
      date: formatDate(-5), // 5 days ago
      notes: 'Over-leveraged. Overslept and missed original entry, chased price which reversed. Clear violation of setup rule 4.',
    },
    {
      id: `demo-trade-6`,
      pair: 'NAS100',
      type: 'SELL',
      risk: 150,
      pl: 300,
      emotion: 'Disciplined',
      date: formatDate(-7), // 7 days ago
      notes: 'Premium Fibonacci retracement block short setup. Held until the 2.0 RR targets.',
    },
    {
      id: `demo-trade-7`,
      pair: 'XAUUSD',
      type: 'BUY',
      risk: 200,
      pl: -200,
      emotion: 'FOMO',
      date: formatDate(-8), // 8 days ago
      notes: 'Entered on minor green candle because of fear of missing the gold breakout. Terrible entry location.',
    }
  ];
};

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('journaly_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    localStorage.setItem('journaly_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const [user, setUser] = useState<{ email: string; name: string; avatar: string } | null>(() => {
    const saved = localStorage.getItem('tradezella_journal_user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [utcTime, setUtcTime] = useState('');
  const [showNotification, setShowNotification] = useState<string | null>(null);

  // Premium Subscription & MT5 Integration States
  const [userPlan, setUserPlan] = useState<'free' | 'premium'>('free');
  const [mt5Connected, setMt5Connected] = useState(false);
  const [mt5AccountId, setMt5AccountId] = useState('');
  const [mt5Broker, setMt5Broker] = useState('');
  const [mt5Balance, setMt5Balance] = useState<number | null>(null);
  const [mt5Equity, setMt5Equity] = useState<number | null>(null);
  const [mt5Syncing, setMt5Syncing] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Paystack transaction verification states
  const [paystackVerifying, setPaystackVerifying] = useState(false);
  const [paystackVerifyError, setPaystackVerifyError] = useState<string | null>(null);
  const [paystackVerifySuccess, setPaystackVerifySuccess] = useState(false);

  useEffect(() => {
    // Detect Paystack redirect callback parameters
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    
    if (reference && user) {
      const verifyPayment = async () => {
        setPaystackVerifying(true);
        setPaystackVerifyError(null);
        setPaystackVerifySuccess(false);
        try {
          console.log(`[PAYSTACK CLIENT VERIFY] Verifying payment reference: ${reference} for ${user.email}`);
          const res = await fetch('/api/paystack/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference, email: user.email })
          });
          const rawText = await res.text();
          const contentType = res.headers.get('content-type') || '';
          let data: any = null;
          if (contentType.includes('application/json')) {
            try {
              data = JSON.parse(rawText);
            } catch (jsonErr) {
              console.warn('[PAYSTACK VERIFY] Failed to parse JSON response:', jsonErr);
            }
          }

          if (res.ok && data && data.success) {
            setPaystackVerifySuccess(true);
            setUserPlan('premium');
            triggerNotification("Congratulations! Paystack subscription verified. Premium features unlocked!");
          } else {
            setPaystackVerifyError((data && data.error) || (res.status === 403 ? "Verification forbidden (HTTP 403)." : "Payment verification failed with the server."));
          }
        } catch (err: any) {
          console.error("Paystack verification error on client:", err);
          setPaystackVerifyError(err.message || "Failed to establish server connection for payment verification.");
        } finally {
          setPaystackVerifying(false);
          // Strip parameters to prevent double run on page reloads
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('reference');
          cleanUrl.searchParams.delete('trxref');
          window.history.replaceState({}, document.title, cleanUrl.toString());
        }
      };

      verifyPayment();
    }
  }, [user]);

  // Admin diagnostics telemetry hook states
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminData, setAdminData] = useState<AdminDiagnosticsData | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  const handleOpenAdminPanel = async () => {
    setShowAdminPanel(true);
    setIsAdminLoading(true);
    try {
      const data = await getAdminDiagnostics();
      setAdminData(data);
    } catch (err) {
      console.error("Failed to fetch admin telemetry:", err);
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Initialize data from Firestore with real-time sync
  useEffect(() => {
    if (!user) {
      setTrades([]);
      setIsLoaded(true);
      return;
    }
    
    setIsLoaded(false);
    
    // Subscribe in real-time to secure Cloud Firestore trades
    const unsubscribe = subscribeToTradesForUser(user.email, (fetchedTrades) => {
      if (fetchedTrades.length > 0) {
        setTrades(fetchedTrades);
        setIsLoaded(true);
        // Backup to local storage for offline resiliency
        const storageKey = `tradezella_journal_trades_${user.email}`;
        localStorage.setItem(storageKey, JSON.stringify(fetchedTrades));
      } else {
        // Fallback to offline localStorage partition if any exist raw
        const storageKey = `tradezella_journal_trades_${user.email}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const loadedTrades = JSON.parse(saved);
            setTrades(loadedTrades);
            // Proactively auto-migrate existing offline trades to cloud database
            batchSaveTradesToFirestore(user.email, loadedTrades).catch(err => {
              console.error('Migration backup error:', err);
            });
          } catch (err) {
            console.error('Local copy read error:', err);
            setTrades([]);
          }
        } else {
          setTrades([]);
        }
        setIsLoaded(true);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Load and sync Premium Profile Details in real-time
  useEffect(() => {
    if (!user) {
      setUserPlan('free');
      setMt5Connected(false);
      setMt5AccountId('');
      setMt5Broker('');
      setMt5Balance(null);
      setMt5Equity(null);
      return;
    }

    // Direct developer override
    if (user.email.toLowerCase() === 'toolaoilqbi@gmail.com') {
      setUserPlan('premium');
    }

    // Subscribe in real-time to profile details
    const unsubscribe = subscribeToUserProfile(user.email, (profile) => {
      if (profile) {
        if (user.email.toLowerCase() === 'toolaoilqbi@gmail.com') {
          setUserPlan('premium');
        } else {
          setUserPlan(profile.plan === 'premium' ? 'premium' : 'free');
        }
        setMt5Connected(!!profile.mt5Connected);
        setMt5AccountId(profile.mt5AccountId || '');
        setMt5Broker(profile.mt5Broker || '');
        setMt5Balance(profile.mt5Balance ?? null);
        setMt5Equity(profile.mt5Equity ?? null);
      } else {
        // Create dynamic profile if it doesn't exist yet
        if (user.email.toLowerCase() === 'toolaoilqbi@gmail.com') {
          setUserPlan('premium');
          updateUserProfile(user.email, { plan: 'premium' });
        } else {
          setUserPlan('free');
        }
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Sync function for MT5 trades
  const handleSyncMT5 = async (silent = false) => {
    if (!user || !mt5AccountId) return;
    if (!silent) setMt5Syncing(true);
    try {
      const customMetaApiToken = localStorage.getItem("journaly_custom_metaapi_token");
      const response = await fetch('/api/mt5/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          accountId: mt5AccountId,
          ...(customMetaApiToken ? { metaApiToken: customMetaApiToken } : {})
        })
      });
      const rawText = await response.text();
      const contentType = response.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr) {
          console.warn('[MT5 SYNC] Failed to parse JSON response:', jsonErr);
        }
      }

      if (response.ok && data && data.success) {
        setMt5Balance(data.accountInfo.balance);
        setMt5Equity(data.accountInfo.equity);
        setMt5Broker(data.accountInfo.broker);
        
        // Save current MT5 balance & equity to user profile so it persists
        updateUserProfile(user.email, {
          mt5Balance: data.accountInfo.balance,
          mt5Equity: data.accountInfo.equity,
          mt5Broker: data.accountInfo.broker
        });

        // Add any new trades to firestore and local state
        const syncedTrades: Trade[] = data.trades || [];
        if (syncedTrades.length > 0) {
          // Compare with existing trades to find duplicates by mt5DealId
          const existingDealIds = new Set(
            trades.filter(t => t.source === 'mt5' && t.mt5DealId).map(t => t.mt5DealId)
          );

          const newTradesToSave = syncedTrades.filter(
            t => !existingDealIds.has(t.mt5DealId)
          );

          if (newTradesToSave.length > 0) {
            // Save each new trade to firestore
            for (const t of newTradesToSave) {
              await saveTradeToFirestore(user.email, t);
            }
            
            // Append new trades to state
            setTrades(prev => {
              const updated = [...newTradesToSave, ...prev];
              // Sync offline storage fallback
              const storageKey = `tradezella_journal_trades_${user.email}`;
              localStorage.setItem(storageKey, JSON.stringify(updated));
              return updated;
            });

            triggerNotification(`Synced ${newTradesToSave.length} new trades from MetaTrader 5!`);
          } else if (!silent) {
            triggerNotification("MT5 Trade ledger is already fully up to date.");
          }
        } else if (!silent) {
          triggerNotification("MT5 connected. No new trades to sync.");
        }
      } else {
        console.error("Failed to sync MT5 account:", data.error);
        if (!silent) triggerNotification(`MT5 Sync failed: ${data.error}`);
      }
    } catch (err: any) {
      console.error("MT5 Sync error:", err);
      if (!silent) triggerNotification("MT5 Server Synchronization currently offline.");
    } finally {
      if (!silent) setMt5Syncing(false);
    }
  };

  // Trigger silent automatic background sync when MT5 is connected
  useEffect(() => {
    if (user && userPlan === 'premium' && mt5Connected && mt5AccountId) {
      // Sync immediately
      handleSyncMT5(true);

      // Setup automatic sync loop (every 45 seconds)
      const interval = setInterval(() => {
        handleSyncMT5(true);
      }, 45000);

      return () => clearInterval(interval);
    }
  }, [user?.email, userPlan, mt5Connected, mt5AccountId]);

  // Sync Live UTC Clock (crucial for retail & institutional session tracking)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerNotification = (message: string) => {
    setShowNotification(message);
    setTimeout(() => {
      setShowNotification(null);
    }, 3500);
  };

  // State calculations
  const calculateStats = (tradeList: Trade[]): TradingStats => {
    const totalTrades = tradeList.length;
    let totalPL = 0;
    let winningCount = 0;
    let losingCount = 0;
    let breakEvenCount = 0;
    let totalWinsPL = 0;
    let totalLossesPL = 0;
    let totalRisk = 0;

    // Today's local date
    const todayStr = new Date().toISOString().split('T')[0];

    let bestTrade = 0;
    let worstTrade = 0;
    let todayProfit = 0;
    let rrSum = 0;
    let rrCount = 0;

    const getDayOfWeek = (dateStr: string): string => {
      if (!dateStr) return '';
      try {
        if (dateStr.includes('-') && !dateStr.includes('T') && !dateStr.includes(':') && !dateStr.includes(' ')) {
          const [year, month, day] = dateStr.split('-');
          const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return d.toLocaleDateString('en-US', { weekday: 'long' });
        } else {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-US', { weekday: 'long' });
          }
        }
      } catch (e) {}
      return '';
    };

    const weekdayWins: Record<string, number> = {
      "Sunday": 0, "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0, "Saturday": 0
    };
    const weekdayLosses: Record<string, number> = {
      "Sunday": 0, "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0, "Saturday": 0
    };

    tradeList.forEach((t) => {
      totalPL += t.pl;
      totalRisk += t.risk;
      
      if (t.pl > 0) {
        winningCount++;
        totalWinsPL += t.pl;
        if (t.pl > bestTrade) bestTrade = t.pl;
      } else if (t.pl < 0) {
        losingCount++;
        totalLossesPL += t.pl;
        if (t.pl < worstTrade) worstTrade = t.pl;
      } else {
        breakEvenCount++;
      }

      const dayName = getDayOfWeek(t.date);
      if (dayName && dayName in weekdayWins) {
        if (t.pl > 0) {
          weekdayWins[dayName]++;
        } else if (t.pl < 0) {
          weekdayLosses[dayName]++;
        }
      }

      // Check if trade date matches today's YYYY-MM-DD
      if (t.date === todayStr) {
        todayProfit += t.pl;
      }

      // Risk-Reward tracking
      if (t.risk && t.risk > 0) {
        rrSum += t.pl / t.risk;
        rrCount++;
      }
    });

    let mostWinsDay = '—';
    let mostWinsDayCount = 0;
    Object.entries(weekdayWins).forEach(([day, count]) => {
      if (count > mostWinsDayCount) {
        mostWinsDayCount = count;
        mostWinsDay = day;
      }
    });

    let mostLossesDay = '—';
    let mostLossesDayCount = 0;
    Object.entries(weekdayLosses).forEach(([day, count]) => {
      if (count > mostLossesDayCount) {
        mostLossesDayCount = count;
        mostLossesDay = day;
      }
    });

    const activeOutcomes = winningCount + losingCount;
    const winRate = activeOutcomes > 0 ? (winningCount / activeOutcomes) * 100 : 0;
    const averageRisk = totalTrades > 0 ? totalRisk / totalTrades : 0;
    const averagePL = totalTrades > 0 ? totalPL / totalTrades : 0;

    // Calculate Average RR
    let averageRR = 0;
    if (rrCount > 0) {
      averageRR = rrSum / rrCount;
    } else {
      const avgWin = winningCount > 0 ? totalWinsPL / winningCount : 0;
      const avgLoss = losingCount > 0 ? Math.abs(totalLossesPL) / losingCount : 0;
      averageRR = avgLoss > 0 ? avgWin / avgLoss : 0;
    }

    // Profit Factor calculation
    const absLoss = Math.abs(totalLossesPL);
    const profitFactor = absLoss > 0 ? totalWinsPL / absLoss : totalWinsPL > 0 ? Infinity : 0;

    // Determine current balance & equity
    let currentBalance = 0; // default starting balance
    const savedBal = localStorage.getItem('journaly_starting_balance');
    if (savedBal) {
      const parsed = parseFloat(savedBal);
      if (!isNaN(parsed)) currentBalance = parsed;
    }
    
    currentBalance += totalPL;

    const balance = (mt5Connected && mt5Balance !== null) ? mt5Balance : currentBalance;
    const equity = (mt5Connected && mt5Equity !== null) ? mt5Equity : balance;

    return {
      totalPL,
      totalTrades,
      winRate,
      winningCount,
      losingCount,
      breakEvenCount,
      totalWinsPL,
      totalLossesPL,
      averageRisk,
      averagePL,
      balance,
      equity,
      todayProfit,
      totalProfit: totalWinsPL,
      totalLoss: absLoss,
      profitFactor,
      averageRR,
      bestTrade,
      worstTrade,
      mostWinsDay,
      mostLossesDay,
      mostWinsDayCount,
      mostLossesDayCount
    };
  };

  const [selectedMonth, setSelectedMonth] = useState<string>('All');

  // Extract unique months from trades list
  const getTradeMonths = (tradeList: Trade[]) => {
    const monthsSet = new Set<string>();
    tradeList.forEach((t) => {
      if (t.date) {
        const parts = t.date.split('-');
        if (parts.length >= 2) {
          monthsSet.add(`${parts[0]}-${parts[1]}`);
        }
      }
    });
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  };

  const tradeMonths = getTradeMonths(trades);

  const formatMonthName = (yearMonthStr: string) => {
    if (yearMonthStr === 'All') return 'All Months';
    const [year, month] = yearMonthStr.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  // 1. Filter trades by selected month
  const monthlyTrades = selectedMonth !== 'All'
    ? trades.filter((t) => t.date && t.date.startsWith(selectedMonth))
    : trades;

  const currentStats = calculateStats(monthlyTrades);

  // Filter trades for bottom table if a date is selected from the strip
  const dateTrades = selectedDateFilter 
    ? monthlyTrades.filter((t) => t.date === selectedDateFilter)
    : [];
  
  const visibleTrades = selectedDateFilter
    ? (dateTrades.length > 0 ? dateTrades : monthlyTrades)
    : monthlyTrades;

  // Add new trade
  const handleAddTrade = (newTradeData: Omit<Trade, 'id'>) => {
    const newTrade: Trade = {
      ...newTradeData,
      id: `trade-id-${Date.now()}`
    };

    if (user) {
      saveTradeToFirestore(user.email, newTrade).catch(err => {
        console.error('Error saving new trade to cloud:', err);
      });
      const storageKey = `tradezella_journal_trades_${user.email}`;
      localStorage.setItem(storageKey, JSON.stringify([newTrade, ...trades]));
    }

    setTrades((prev) => [newTrade, ...prev]);
    triggerNotification(`Logged trade ${newTradeData.pair} (+${newTradeData.pl >= 0 ? '$' : '-$'}${Math.abs(newTradeData.pl)}) to cloud ledger!`);
  };

  // Delete trade
  const handleDeleteTrade = (id: string) => {
    const target = trades.find(t => t.id === id);
    if (!target) return;

    deleteTradeFromFirestore(id).catch(err => {
      console.error('Error deleting trade from cloud:', err);
    });

    const updated = trades.filter((trade) => trade.id !== id);
    setTrades(updated);

    if (user) {
      const storageKey = `tradezella_journal_trades_${user.email}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }

    triggerNotification(`Removed trade record ${target.pair} from cloud ledger.`);
  };

  // Edit trade
  const handleEditTrade = (updatedTrade: Trade) => {
    if (user) {
      saveTradeToFirestore(user.email, updatedTrade).catch(err => {
        console.error('Error updating trade in cloud:', err);
      });
    }

    const updated = trades.map((t) => (t.id === updatedTrade.id ? updatedTrade : t));
    setTrades(updated);

    if (user) {
      const storageKey = `tradezella_journal_trades_${user.email}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }

    triggerNotification(`Updated trade modifications for ${updatedTrade.pair}.`);
  };

  // Clear all data
  const handleClearAll = () => {
    if (user) {
      clearAllUserTrades(user.email).catch(err => {
        console.error('Error clearing trades in cloud:', err);
      });
      const storageKey = `tradezella_journal_trades_${user.email}`;
      localStorage.removeItem(storageKey);
    }

    setTrades([]);
    triggerNotification("Cleared all trade logs completely. Cloud database is fresh.");
  };

  const handleSignOut = () => {
    localStorage.removeItem('tradezella_journal_user');
    localStorage.removeItem('journaly_starting_balance');
    setUser(null);
    setTrades([]);
    setSelectedDateFilter(null);
    triggerNotification("Signed out of secure session.");
  };

  if (!user) {
    return (
      <>
        {showNotification && (
          <div 
            id="system-banner-notification"
            className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-emerald-500/40 text-emerald-400 pl-4 pr-5 py-3 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in-up duration-350 transition-all backdrop-blur-md"
          >
            <CheckCircle size={15} className="text-emerald-400" />
            <span>{showNotification}</span>
          </div>
        )}
        <GoogleLogin 
          onSuccess={(loggedUser) => {
            localStorage.setItem('tradezella_journal_user', JSON.stringify(loggedUser));
            setUser(loggedUser);
            triggerNotification(`Welcome, ${loggedUser.name}! Secure session established.`);
          }}
        />
      </>
    );
  }

  return (
    <div id="main-trading-journal-app" className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* Top Banner Notification */}
      {showNotification && (
        <div 
          id="system-banner-notification"
          className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-emerald-500/40 text-emerald-400 pl-4 pr-5 py-3 rounded-lg shadow-2xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in-up duration-300 transition-all backdrop-blur-md"
        >
          <CheckCircle size={15} className="text-emerald-400" />
          <span>{showNotification}</span>
        </div>
      )}

      {/* Header Panel */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 sticky top-0 z-40 backdrop-blur-md" id="app-header-navigation">
        <div className="max-w-full mx-auto px-4 md:px-8 lg:px-12 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          
          {/* Logo & Platform Tag */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-550 bg-emerald-500 text-zinc-950 flex items-center justify-center animate-pulse duration-1000">
              <Activity size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black font-display tracking-tight text-zinc-100 uppercase">
                  Journaly
                </h1>
                <span className="text-[9px] uppercase font-bold text-emerald-400 border border-emerald-550/30 px-1 py-0.5 rounded leading-none">
                  Prop Elite
                </span>
              </div>
              <p className="text-[10px] text-emerald-400 font-extrabold tracking-wider uppercase">Trade. Review. Improve.</p>
            </div>
          </div>

          {/* Time & Quick Utility Actions */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-400">
            {/* User Session Profile tag */}
            {user && (
              <div id="user-profile-badge" className="flex items-center gap-2.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full object-cover border border-emerald-500/40" />
                <span className="text-[11px] font-bold text-zinc-100">{user.name}</span>
                <button
                  onClick={handleSignOut}
                  className="ml-1 text-zinc-500 hover:text-rose-400 transition-colors p-0.5 cursor-pointer flex items-center justify-center"
                  title="Sign out of Google Session"
                  id="btn-google-signout"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}

            {/* Admin Diagnostics button - ONLY for toolaoilqbi@gmail.com */}
            {user?.email.toLowerCase() === 'toolaoilqbi@gmail.com' && (
              <button
                onClick={handleOpenAdminPanel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-450 text-zinc-950 font-bold rounded-xl transition-all duration-150 shadow-md shadow-emerald-500/10 cursor-pointer text-[11px] select-none h-[32px] shrink-0"
                title="Open Global Database Telemetry"
                id="btn-admin-telemetry"
              >
                <Database size={12} className="stroke-[2.5]" />
                <span>Diagnostics</span>
              </button>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-750 text-zinc-400 hover:text-zinc-200 rounded-xl transition-all duration-150 cursor-pointer h-[32px] w-[32px]"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              id="btn-theme-toggle"
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </button>

            {/* Live UTC Clock */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-850 rounded-lg text-emerald-400 font-mono text-[11px]" title="Institutional standard trading time">
              <Clock size={12} className="text-emerald-400" />
              <span>{utcTime || 'SYS-SYNCING...'}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5" id="header-utility-actions">
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900/40 hover:bg-rose-950/25 border border-zinc-850 hover:border-rose-900/50 text-zinc-400 hover:text-rose-450 rounded-lg transition-all duration-150 tooltip cursor-pointer"
                title="Wipe local storage and begin empty journal"
                id="btn-clear-database"
              >
                <Trash2 size={12.5} />
                <span>Wipe Logs</span>
              </button>
            </div>
          </div>


        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-full w-full mx-auto p-4 md:p-8 lg:p-12 space-y-6" id="dashboard-container-body">
        
        {/* MT5 BRONKER SYNC PANEL - PREM ONLY (PROMO FOR FREE) */}
        <section aria-label="MetaTrader Sync Connection" id="section-mt5-sync-panel">
          <MT5ConnectionPanel 
            email={user.email}
            isPremium={userPlan === 'premium'}
            mt5Connected={mt5Connected}
            mt5AccountId={mt5AccountId}
            mt5Broker={mt5Broker}
            mt5Balance={mt5Balance}
            mt5Equity={mt5Equity}
            isSyncing={mt5Syncing}
            onSync={() => handleSyncMT5(false)}
            onConnected={(accountId, name) => {
              setMt5Connected(true);
              setMt5AccountId(accountId);
              setMt5Broker(name);
              triggerNotification("MetaTrader 5 sync pipeline successfully established!");
            }}
            onDisconnected={() => {
              setMt5Connected(false);
              setMt5AccountId('');
              setMt5Broker('');
              setMt5Balance(null);
              setMt5Equity(null);
              // Clear MT5 trades from state
              setTrades(prev => {
                const updated = prev.filter(t => t.source !== 'mt5');
                const storageKey = `tradezella_journal_trades_${user.email}`;
                localStorage.setItem(storageKey, JSON.stringify(updated));
                return updated;
              });
              // Clear MT5 trades from Firestore
              clearMT5TradesForUser(user.email).catch(err => {
                console.error("Failed to clear MT5 trades from cloud:", err);
              });
              triggerNotification("Disconnected MetaTrader 5 broker link and cleared synced trades.");
            }}
            onOpenUpgradeModal={() => setShowUpgradeModal(true)}
          />
        </section>

        {/* MONTH SELECTOR RIBBON */}
        <div id="monthly-stats-ribbon" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/45 p-3 sm:px-4 rounded-xl border border-zinc-850">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3 bg-emerald-500 rounded-full" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Filter Portfolio by Month
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setSelectedMonth('All');
                setSelectedDateFilter(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer border ${
                selectedMonth === 'All'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-950/40 text-zinc-400 border-zinc-900 hover:border-zinc-800 hover:text-zinc-200'
              }`}
            >
              All Months ({trades.length})
            </button>
            
            {tradeMonths.map((m) => {
              const count = trades.filter(t => t.date && t.date.startsWith(m)).length;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setSelectedMonth(m);
                    setSelectedDateFilter(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-155 cursor-pointer border ${
                    selectedMonth === m
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-900 hover:border-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {formatMonthName(m)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. TOP ANALYTICS DASHBOARD - STYLED CARDS (THE ABSOLUTE HIGHEST PRIORITY REQ) */}
        <section aria-label="Analytical Overview" id="section-metrics-hud">
          <StatsDashboard 
            stats={currentStats} 
          />
        </section>

        {/* 2. DATE STRIP TIMELINE SELECTOR (VERY IMPORTANT REQ) */}
        <section aria-label="Timeline Navigation" id="section-timeline-navigator">
          <DateStrip 
            selectedDateFilter={selectedDateFilter}
            onSelectDateFilter={setSelectedDateFilter}
            trades={monthlyTrades}
          />
        </section>

        {/* 3. MIDDLE SPLIT LEVEL: Trade log on left, Psychological insights breakdown on right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="middle-section-split-grids">
          
          <div className="lg:col-span-5" id="col-logs-form">
            <TradeForm onAddTrade={handleAddTrade} />
          </div>

          <div className="lg:col-span-7" id="col-insights-chart">
            <PsychologyInsights trades={trades} />
          </div>

        </div>

        {/* 4. BOTTOM SECONDARY LEVEL: Comprehensive Trades Log Grid with search search and list deletion */}
        <section aria-label="Trade History" id="section-trades-history-table">
          <TradesTable 
            trades={visibleTrades} 
            allTrades={monthlyTrades}
            selectedDateFilter={selectedDateFilter}
            onClearDateFilter={() => setSelectedDateFilter(null)}
            onDeleteTrade={handleDeleteTrade} 
            onEditTrade={handleEditTrade}
          />
        </section>

      </main>

      {/* Simple Professional Prop Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 mt-12 py-6 text-center text-[10px] text-zinc-600" id="app-footer">
        <div className="max-w-full mx-auto px-4 md:px-8 lg:px-12 flex flex-col md:flex-row justify-between items-center gap-3">
          <div>
            &copy; 2026 Journaly Inc. All trade records kept client-side within browser LocalStorage.
          </div>
          <div className="flex gap-4">
            <span className="hover:text-zinc-500 transition-colors">Risk Warning: Derivates carry high loss thresholds.</span>
            <span>•</span>
            <span className="hover:text-zinc-500 transition-colors">Psychological Discipline Protocol V1.2</span>
          </div>
        </div>
      </footer>

      {/* Admin Diagnostics Overlay Panel */}
      {showAdminPanel && (
        <AdminDiagnostics 
          onClose={() => setShowAdminPanel(false)} 
          data={adminData} 
          isLoading={isAdminLoading} 
          />
      )}

      {/* Subscription Checkout Modal */}
      {showUpgradeModal && (
        <SubscriptionModal 
          email={user.email}
          onClose={() => setShowUpgradeModal(false)}
          onSuccess={() => {
            setUserPlan('premium');
            triggerNotification("Upgraded to Premium plan successfully! Unlocking MT5 automatic syncing.");
          }}
        />
      )}

      {/* Paystack Server-Side Verification Dialog Overlay */}
      {(paystackVerifying || paystackVerifyError || paystackVerifySuccess) && (
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 text-center space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" />
            
            {paystackVerifying && (
              <div className="space-y-4 py-4">
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-spin">
                  <Loader2 size={32} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Verifying Payment</h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  Communicating with Paystack secure payment gateway to verify your premium upgrade. Please do not close or reload this window.
                </p>
              </div>
            )}

            {paystackVerifyError && (
              <div className="space-y-4 py-4">
                <div className="inline-flex p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <XCircle size={32} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-rose-400 uppercase tracking-tight">Verification Failed</h3>
                <p className="text-xs text-zinc-300 max-w-xs mx-auto leading-relaxed bg-zinc-950/50 p-3 rounded-lg border border-zinc-850">
                  {paystackVerifyError}
                </p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  If you have been debited, please contact support with your payment reference or try subscribing again.
                </p>
                <button
                  onClick={() => setPaystackVerifyError(null)}
                  className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}

            {paystackVerifySuccess && (
              <div className="space-y-4 py-4">
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle size={32} className="stroke-[2.5]" />
                </div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Upgrade Activated!</h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  Your payment has been successfully verified server-side with Paystack. Your Journaly Premium features are now fully unlocked!
                </p>
                <button
                  onClick={() => setPaystackVerifySuccess(false)}
                  className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-zinc-950 font-black text-xs uppercase rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  Let's Trade
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
