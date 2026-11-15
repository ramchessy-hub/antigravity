import { useEffect, useRef, useState } from 'react';
import { TrendingUp, X } from 'lucide-react';
import type { BalanceClaim } from '@/lib/supabase';
import { formatCurrency, formatInr, formatTimeAgo } from '@/lib/utils';

type ClaimToastProps = {
  claims: BalanceClaim[];
  onDismiss: (id: string) => void;
};

export function ClaimToast({ claims, onDismiss }: ClaimToastProps) {
  const [visible, setVisible] = useState<BalanceClaim[]>([]);
  const shownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (claims.length === 0) return;
    const newOnes = claims.filter((c) => !shownIds.current.has(c.id));
    if (newOnes.length === 0) return;
    for (const c of newOnes) shownIds.current.add(c.id);
    setVisible((prev) => [...newOnes.slice(0, 3), ...prev].slice(0, 5));
  }, [claims]);

  useEffect(() => {
    if (visible.length === 0) return;
    const timer = setInterval(() => {
      setVisible((prev) => prev.slice(0, -1));
    }, 8000);
    return () => clearInterval(timer);
  }, [visible]);

  const dismiss = (id: string) => {
    setVisible((prev) => prev.filter((c) => c.id !== id));
    onDismiss(id);
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-16 sm:top-20 right-3 sm:right-6 z-50 flex flex-col gap-2 max-w-xs sm:max-w-sm">
      {visible.map((claim) => (
        <div
          key={claim.id}
          className="glass-card border-emerald-500/30 p-4 shadow-lg shadow-emerald-900/50 animate-slide-in"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-emerald-300 tnum">
                  +{formatCurrency(claim.increase_amount ?? 0)} · <span className="text-slate-600">{formatInr(claim.increase_amount ?? 0)}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono truncate max-w-[180px]">
                  {claim.device_id}
                </div>
              </div>
            </div>
            <button
              onClick={() => dismiss(claim.id)}
              className="text-slate-500 hover:text-slate-300 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            Balance: {formatCurrency(claim.previous_balance ?? 0)} → {formatCurrency(claim.new_balance ?? 0)} · {formatInr(claim.previous_balance ?? 0)} → {formatInr(claim.new_balance ?? 0)} · {formatTimeAgo(claim.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}
