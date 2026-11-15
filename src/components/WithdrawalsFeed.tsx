import { useState } from 'react';
import { ArrowDownToLine, ChevronDown, History } from 'lucide-react';
import type { DeviceWithdrawal } from '@/lib/supabase';
import { formatCurrency, formatInr, formatTimeAgo } from '@/lib/utils';

type WithdrawalsFeedProps = {
  withdrawals: DeviceWithdrawal[];
  totalLifetimeWithdrawn: number;
  deviceNameMap?: Map<string, string>;
};

export function WithdrawalsFeed({ withdrawals, totalLifetimeWithdrawn, deviceNameMap }: WithdrawalsFeedProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <div className="relative">
            <ArrowDownToLine className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            {withdrawals.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                {(() => { const n = withdrawals.filter((w) => (w.withdrawal_amount ?? 0) >= 0.5).length; return n > 9 ? '9+' : n; })()}
              </span>
            )}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-slate-200">Withdrawals Detected</h2>
          {totalLifetimeWithdrawn > 0 && (
            <span className="text-xs text-amber-400 font-medium tnum">
              {formatCurrency(totalLifetimeWithdrawn)} total<span className="hidden sm:inline"> · <span className="text-slate-600">{formatInr(totalLifetimeWithdrawn)}</span></span>
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <>
          {withdrawals.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No withdrawals detected yet. Only balance drops of $0.50 or more appear here.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {withdrawals
                .filter((w) => (w.withdrawal_amount ?? 0) >= 0.5)
                .slice(0, 30)
                .map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 bg-amber-500/[0.07] border border-amber-500/15 hover:bg-amber-500/[0.12] transition-all"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/20">
                    <ArrowDownToLine className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-amber-400 tnum">
                        -{formatCurrency(w.withdrawal_amount ?? 0)}<span className="hidden sm:inline"> · <span className="text-slate-600">{formatInr(w.withdrawal_amount ?? 0)}</span></span>
                      </span>
                      <span className="text-xs text-slate-500 truncate">{deviceNameMap?.get(w.device_id) ?? w.device_id}</span>
                    </div>
                    <div className="text-xs text-slate-500 tnum">
                      {formatCurrency(w.previous_balance ?? 0)} → {formatCurrency(w.new_balance ?? 0)}
                      <span className="hidden sm:inline"> · {formatInr(w.previous_balance ?? 0)} → {formatInr(w.new_balance ?? 0)}</span>
                      {' · '}{formatTimeAgo(w.detected_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type DeviceWithdrawalBadgeProps = {
  lastWithdrawalAt: string | null;
  lastWithdrawalAmount: number | null;
  lifetimeWithdrawn: number | null;
};

export function DeviceWithdrawalBadge({ lastWithdrawalAt, lastWithdrawalAmount, lifetimeWithdrawn }: DeviceWithdrawalBadgeProps) {
  if (!lastWithdrawalAt || !lastWithdrawalAmount || lastWithdrawalAmount <= 0) {
    return null;
  }
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-amber-400/80" title={`Last withdrawn ${formatCurrency(lastWithdrawalAmount)} · ${formatInr(lastWithdrawalAmount)} · ${formatTimeAgo(lastWithdrawalAt)}`}>
      <History className="w-3 h-3" />
      <span>-{formatCurrency(lastWithdrawalAmount)} · {formatInr(lastWithdrawalAmount)}</span>
      {lifetimeWithdrawn && lifetimeWithdrawn > lastWithdrawalAmount && (
        <span className="text-slate-500">/ {formatCurrency(lifetimeWithdrawn)} · {formatInr(lifetimeWithdrawn)} total</span>
      )}
    </div>
  );
}
