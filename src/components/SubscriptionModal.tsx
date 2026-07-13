import React, { useState } from "react";
import { Sparkles, Shield, Check, Lock, ArrowRight, Loader2, X } from "lucide-react";

interface SubscriptionModalProps {
  email: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SubscriptionModal({ email, onClose }: SubscriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePaystackRedirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      console.log(`[PAYSTACK CHECKOUT] Initializing Paystack transaction for: ${email}`);
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          callbackUrl: window.location.href // Redirects back to our app with reference
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to initiate payment. Please contact support.");
      }

      console.log(`[PAYSTACK CHECKOUT] Secure redirect URL obtained. Redirecting to Paystack: ${data.authorizationUrl}`);
      // Redirect user to official Paystack Checkout page
      window.location.href = data.authorizationUrl;

    } catch (err: any) {
      console.error("Paystack initialization failed:", err);
      setError(err.message || "Could not initialize checkout. Please check network connection.");
      setLoading(false);
    }
  };

  return (
    <div id="subscription-modal-backdrop" className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-40 flex items-center justify-center p-4 overflow-y-auto">
      <div 
        id="subscription-modal-content" 
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl relative overflow-hidden animate-fade-in-up duration-200"
      >
        {/* Top Decorative Amber/Green gradient glow */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500" />

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg bg-zinc-950/40 border border-zinc-850 hover:border-zinc-800 cursor-pointer"
        >
          <X size={14} />
        </button>

        <div className="p-6 md:p-8 space-y-6">
          
          {/* Modal Header */}
          <div className="text-center space-y-2 mt-2">
            <div className="inline-flex p-2 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/20 text-emerald-400 border border-emerald-500/20 mb-1 animate-pulse">
              <Sparkles size={20} className="stroke-[2.5]" />
            </div>
            <h2 className="text-2xl font-black font-display tracking-tight text-zinc-100 uppercase">
              Upgrade to Premium
            </h2>
            <p className="text-xs text-zinc-400">
              Unlock instant MT5 trade synchronization, auto-analytics & metrics.
            </p>
          </div>

          {/* Price tag badge */}
          <div className="bg-zinc-950/60 rounded-xl border border-zinc-850 p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider block">Prop Elite Subscription</span>
              <span className="text-zinc-100 font-bold text-sm">Premium Monthly Plan</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-zinc-100">₦15,000</span>
              <span className="text-zinc-500 text-xs font-semibold">/mo</span>
            </div>
          </div>

          {/* Premium Bullet Points */}
          <div className="space-y-3 py-1">
            <h4 className="text-[10px] uppercase font-black text-zinc-400 tracking-wider">Premium Plan Includes:</h4>
            <div className="grid grid-cols-1 gap-2.5 text-xs">
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>Automatic MT5 Syncing</strong> — No more typing in your trades manually.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>Real-time Balance & Equity tracking</strong> synced straight from MT5.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>Advanced Ticket Records</strong> — Log commissions, lot size, and swap rates automatically.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>Continuous background ledger sync</strong> — New trades auto-populate.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>Comprehensive Trade Analytics</strong> — Track total losses, best trades, and worst trades instantly.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>Weekly Pattern Tracking</strong> — Discover your most wins day and most losses day.</span>
              </div>
              <div className="flex items-start gap-2 text-zinc-300">
                <Check size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span><strong>All Metrics Support</strong> — Every analytics dimension curated to help you make better trading decisions.</span>
              </div>
            </div>
          </div>

          {/* Redirection info & Checkout button */}
          <form onSubmit={handlePaystackRedirect} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/40 text-rose-400 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Secure Checkout Badge */}
            <div className="flex items-center justify-between text-[10px] text-zinc-500 bg-zinc-950/30 p-2.5 rounded border border-zinc-850/40">
              <span className="flex items-center gap-1 font-semibold">
                <Lock size={10} className="text-emerald-500" />
                Paystack Secure Gateways
              </span>
              <span className="flex items-center gap-1 font-semibold">
                <Shield size={10} className="text-emerald-500" />
                Verified Server-Side
              </span>
            </div>

            {/* Info note */}
            <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
              Clicking below will securely redirect you to Paystack's official transaction checkout. Your payment details are fully processed by Paystack under banking security protocols.
            </p>

            {/* Upgrade Submission Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-450 hover:to-teal-450 text-zinc-950 font-black uppercase text-xs tracking-wider rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Redirecting to Paystack...</span>
                </>
              ) : (
                <>
                  <span>Activate Premium — ₦15,000/mo</span>
                  <ArrowRight size={14} className="stroke-[2.5]" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
