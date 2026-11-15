import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Bitcoin,
  ChevronDown,
  DollarSign,
  ExternalLink,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';

type SolanaWalletCardProps = {
  solBalance: number | null;
  usdcBalance: number | null;
  totalUsdValue: number | null;
  solPriceUsd: number | null;
  lastCheckedAt: string | null;
  alertTriggered: boolean;
  walletAddress: string;
  onCheckNow: () => void;
  checking: boolean;
  alertsMuted: boolean;
  onToggleMute: () => void;
};

export function SolanaWalletCard({
  solBalance,
  usdcBalance,
  totalUsdValue,
  solPriceUsd,
  lastCheckedAt,
  walletAddress,
  onCheckNow,
  checking,
  alertsMuted,
  onToggleMute,
}: SolanaWalletCardProps) {
  const [expanded, setExpanded] = useState(false);
  const aboveThreshold = (totalUsdValue ?? 0) > 100;

  return (
    <div className="glass-card glass-card-hover p-4 sm:p-5 transition-all">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setExpanded((current) => !current)}
          className="flex items-center gap-3 text-left min-w-0"
          aria-expanded={expanded}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-sky-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Solana Wallet</h3>
            <p className="text-[11px] text-slate-500 truncate">
              <span className="hidden sm:inline">{(solBalance ?? 0).toFixed(4)} SOL · ${(usdcBalance ?? 0).toFixed(2)} USDC · </span>checked {lastCheckedAt ? formatTimeAgo(lastCheckedAt) : 'never'}
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleMute}
            title={alertsMuted ? 'Unmute Telegram alerts' : 'Mute Telegram alerts'}
            aria-label={alertsMuted ? 'Unmute Telegram alerts' : 'Mute Telegram alerts'}
            className={`p-2 rounded-lg transition-colors ${alertsMuted ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          >
            {alertsMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>
          <button
            onClick={onCheckNow}
            disabled={checking}
            className="text-xs px-2.5 py-1.5 bg-sky-500/10 border border-sky-500/20 text-sky-300 rounded-lg hover:bg-sky-500/20 transition-all disabled:opacity-50"
          >
            {checking ? '...' : 'Check'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-white/[0.06] pt-4 animate-fade-in">
          <a
            href={`https://solscan.io/account/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-400 transition-colors mb-4 font-mono"
          >
            <span className="truncate">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>

          <div className="mb-4">
            <div className="text-3xl font-extrabold tnum bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">${(totalUsdValue ?? 0).toFixed(2)}</div>
            <div className="text-[11px] text-slate-500 mt-1 uppercase tracking-[0.15em]">Total USD Value</div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between bg-black/20 border border-white/[0.05] rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Bitcoin className="w-4 h-4 text-sky-400" />
                <span className="text-xs text-slate-400">SOL</span>
              </div>
              <div className="text-right tnum">
                <span className="text-sm font-semibold text-slate-200">{(solBalance ?? 0).toFixed(4)}</span>
                <span className="text-xs text-slate-500 ml-2">(${((solBalance ?? 0) * (solPriceUsd ?? 0)).toFixed(2)})</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-black/20 border border-white/[0.05] rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">USDC</span>
              </div>
              <span className="text-sm font-semibold text-slate-200 tnum">${(usdcBalance ?? 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-black/20 border border-white/[0.05] rounded-lg px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">SOL Price</span>
            </div>
            <span className="text-sm font-semibold text-cyan-300 tnum">${(solPriceUsd ?? 0).toFixed(2)}</span>
          </div>

          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${aboveThreshold ? 'bg-red-500/10 border border-red-500/20' : 'bg-black/20 border border-white/[0.05]'}`}>
            <AlertTriangle className={`w-4 h-4 ${aboveThreshold ? 'text-red-400' : 'text-slate-600'}`} />
            <span className={`text-xs ${aboveThreshold ? 'text-red-400 font-medium' : 'text-slate-500'}`}>
              {aboveThreshold ? (alertsMuted ? 'Above $100 threshold · alerts muted' : 'Auto-withdraw armed: USDC ≥ $100') : 'Below $100 threshold'}
            </span>
          </div>

          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>Last checked</span>
            <span>{lastCheckedAt ? formatTimeAgo(lastCheckedAt) : 'Never'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
