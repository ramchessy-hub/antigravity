import { Coins, Wifi, WifiOff, TrendingUp, ArrowDownToLine, Award } from 'lucide-react';
import { formatTime, formatTimeAgo, getDeviceStatus, USD_TO_INR } from '@/lib/utils';

type CocoBalanceCardProps = {
  deviceId: string;
  balanceText: string | null;
  balanceValue: number | null;
  lastSeenAt: string | null;
  todayChange: number;
  lifetimeEarnings: number;
  lifetimeWithdrawn: number;
  lastWithdrawalAt: string | null;
  lastWithdrawalAmount: number | null;
};

export function CocoBalanceCard({
  deviceId,
  balanceText,
  balanceValue,
  lastSeenAt,
  todayChange,
  lifetimeEarnings,
  lifetimeWithdrawn,
  lastWithdrawalAt,
  lastWithdrawalAmount,
}: CocoBalanceCardProps) {
  const status = getDeviceStatus(lastSeenAt);
  const isLive = status === 'live';
  const hasChange = todayChange > 0;
  const inrValue = (balanceValue ?? 0) * USD_TO_INR;
  const inrChange = todayChange * USD_TO_INR;
  const hasWithdrawal = (lastWithdrawalAmount ?? 0) > 0;

  return (
    <div className="glass-card glass-card-hover p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Coco Balance</h3>
            <p className="text-[11px] text-slate-500">BCD tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isLive ? (
            <>
              <div className="relative">
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              </div>
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-slate-500 font-medium">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Balance display */}
      <div className="mb-4">
        {balanceText ? (
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-300 tnum">{balanceText}</div>
        ) : balanceValue !== null ? (
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-300 tnum">{balanceValue.toFixed(2)} BCD$</div>
        ) : (
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-600">—</div>
        )}
        <div className="text-lg sm:text-xl font-bold text-green-400 mt-1 tnum">
          ₹{inrValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 font-mono">{deviceId}</div>
      </div>

      {/* Today change + Lifetime earnings */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between bg-black/20 border border-white/[0.05] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 ${hasChange ? 'text-emerald-400' : 'text-slate-600'}`} />
            <span className="text-xs text-slate-400">Today's change</span>
          </div>
          <span className={`text-xs sm:text-sm font-semibold tnum ${hasChange ? 'text-emerald-400' : 'text-slate-500'}`}>
            {hasChange ? `+${todayChange.toFixed(2)} BCD$` : '0.00 BCD$'}
            <span className="hidden sm:inline"> / ₹{inrChange.toFixed(2)}</span>
          </span>
        </div>

        <div className="flex items-center justify-between bg-black/20 border border-white/[0.05] rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400">Lifetime earnings</span>
          </div>
          <span className="text-xs sm:text-sm font-semibold tnum text-amber-300">
            {lifetimeEarnings.toFixed(2)} BCD$
            <span className="hidden sm:inline text-slate-500"> / ₹{(lifetimeEarnings * USD_TO_INR).toFixed(2)}</span>
          </span>
        </div>

        {hasWithdrawal && (
          <div className="flex items-center justify-between bg-orange-500/5 border border-orange-500/15 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">Last withdrawal</span>
            </div>
            <div className="text-right">
              <span className="text-xs sm:text-sm font-semibold tnum text-orange-400">
                -{(lastWithdrawalAmount ?? 0).toFixed(2)} BCD$
              </span>
              {lastWithdrawalAt && (
                <div className="text-[10px] text-slate-500">{formatTimeAgo(lastWithdrawalAt)}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Last seen */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Last sync</span>
        <span className="tnum">{isLive ? formatTime(lastSeenAt) : formatTimeAgo(lastSeenAt)}</span>
      </div>

      {lifetimeWithdrawn > 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-600 mt-2 pt-2 border-t border-white/[0.04]">
          <span>Total withdrawn</span>
          <span className="tnum">{lifetimeWithdrawn.toFixed(2)} BCD$</span>
        </div>
      )}
    </div>
  );
}
