import { Bell, BellOff, Check, TrendingUp, History } from 'lucide-react';
import type { BalanceClaim } from '@/lib/supabase';
import { formatCurrency, formatInr, formatTimeAgo } from '@/lib/utils';

type ClaimsFeedProps = {
  claims: BalanceClaim[];
  onClaim: (id: string) => void;
  onClearAll: () => void;
  notificationsMuted: boolean;
  onToggleMute: () => void;
  onShowHistory?: () => void;
  deviceNameMap?: Map<string, string>;
};

export function ClaimsFeed({
  claims,
  onClaim,
  onClearAll,
  notificationsMuted,
  onToggleMute,
  onShowHistory,
  deviceNameMap,
}: ClaimsFeedProps) {
  const unclaimed = claims.filter((c) => !c.claimed);
  const totalIncrease = unclaimed.reduce((sum, c) => sum + (c.increase_amount ?? 0), 0);

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            {unclaimed.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                {unclaimed.length}
              </span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-slate-200">Balance Claims</h2>
          {totalIncrease > 0 && (
            <span className="text-xs text-emerald-400 font-medium tnum">
              +{formatCurrency(totalIncrease)} unclaimed<span className="hidden sm:inline"> · <span className="text-slate-600">{formatInr(totalIncrease)}</span></span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMute}
            title={notificationsMuted ? 'Unmute balance notifications' : 'Mute balance notifications'}
            aria-label={notificationsMuted ? 'Unmute balance notifications' : 'Mute balance notifications'}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors ${
              notificationsMuted
                ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
            }`}
          >
            {notificationsMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            <span className="text-xs">{notificationsMuted ? 'Muted' : 'Mute'}</span>
          </button>
          {onShowHistory && (
            <button
              onClick={onShowHistory}
              title="View all claims history"
              aria-label="View claims history"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}
          {claims.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {claims.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No balance increases detected yet. Claims will appear here when any device balance goes up.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {claims.slice(0, 20).map((claim) => (
            <div
              key={claim.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                claim.claimed
                  ? 'bg-black/20 opacity-50'
                  : 'bg-emerald-500/[0.07] border border-emerald-500/15 hover:bg-emerald-500/[0.12]'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                claim.claimed ? 'bg-white/5' : 'bg-emerald-500/20'
              }`}>
                <TrendingUp className={`w-3.5 h-3.5 ${claim.claimed ? 'text-slate-600' : 'text-emerald-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold tnum ${claim.claimed ? 'text-slate-500' : 'text-emerald-400'}`}>
                    +{formatCurrency(claim.increase_amount ?? 0)}<span className="hidden sm:inline"> · <span className="text-slate-600">{formatInr(claim.increase_amount ?? 0)}</span></span>
                  </span>
                  <span className="text-xs text-slate-500 font-mono truncate">
                    {deviceNameMap?.get(claim.device_id) ?? claim.device_id}
                  </span>
                </div>
                <div className="text-xs text-slate-500 tnum">
                  {formatCurrency(claim.previous_balance ?? 0)} → {formatCurrency(claim.new_balance ?? 0)}
                  <span className="hidden sm:inline"> · {formatInr(claim.previous_balance ?? 0)} → {formatInr(claim.new_balance ?? 0)}</span>
                  {' · '}{formatTimeAgo(claim.created_at)}
                </div>
              </div>
              {!claim.claimed && (
                <button
                  onClick={() => onClaim(claim.id)}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 shrink-0 px-2 py-1 rounded-lg hover:bg-emerald-500/10 transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  Claim
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
