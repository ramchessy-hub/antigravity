import { useEffect, useState } from 'react';
import { History, X, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatInr, formatShortDate, formatTime, formatTimeAgo } from '@/lib/utils';

type BalanceReport = {
  id: string;
  device_id: string;
  balance: number;
  reported_at: string;
};

type DeviceHistoryDrawerProps = {
  deviceId: string;
  displayName: string | null;
  open: boolean;
  onClose: () => void;
};

export function DeviceHistoryDrawer({ deviceId, displayName, open, onClose }: DeviceHistoryDrawerProps) {
  const [reports, setReports] = useState<BalanceReport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('balance_reports')
      .select('*')
      .eq('device_id', deviceId)
      .order('reported_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load history:', error);
        } else if (data) {
          setReports(data as BalanceReport[]);
        }
        setLoading(false);
      });
  }, [open, deviceId]);

  if (!open) return null;

  const previousBalance = (idx: number): number | null => {
    if (idx + 1 >= reports.length) return null;
    return reports[idx + 1].balance;
  };

  const delta = (idx: number): number => {
    const prev = previousBalance(idx);
    if (prev === null) return 0;
    return Math.round((reports[idx].balance - prev) * 100) / 100;
  };

  const changedReports = reports
    .map((report, idx) => ({ report, idx, d: delta(idx) }))
    .filter((entry) => entry.d !== 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-700/60 overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md border-b border-slate-700/40 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 truncate">
                {displayName || deviceId}
              </h3>
              <p className="text-xs text-slate-500 font-mono truncate">Balance history · {deviceId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-800/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : changedReports.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-10 h-10 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No balance changes recorded yet for this device.</p>
            </div>
          ) : (
            changedReports.map(({ report, d }) => {
              const up = d > 0;
              const down = d < 0;
              return (
                <div
                  key={report.id}
                  className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      up
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-200">
                        {formatCurrency(report.balance)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatInr(report.balance)}
                      </span>
                      <span className={`text-xs font-semibold ${up ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {up ? '+' : ''}{formatCurrency(d)} · {up ? '+' : ''}{formatInr(d)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatShortDate(report.reported_at)} · {formatTime(report.reported_at)}
                      <span className="text-slate-600"> · {formatTimeAgo(report.reported_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
