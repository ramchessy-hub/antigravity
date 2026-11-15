import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarRange,
} from 'lucide-react';
import type { EarningsSummary } from '@/types';
import { formatCurrency, formatInr, istDateString, istDayStart } from '@/lib/utils';

type EarningsHistoryProps = {
  summary: EarningsSummary;
};

type PeriodKey =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'lastMonth'
  | 'm2'
  | 'm3'
  | 'm4'
  | 'm6'
  | 'm8'
  | 'm10'
  | 'm12';

type PeriodDef = {
  key: PeriodKey;
  label: string;
  days: number;
};

const PERIODS: PeriodDef[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'yesterday', label: 'Yesterday', days: 1 },
  { key: 'week', label: '7-Day Week', days: 7 },
  { key: 'month', label: '30-Day Month', days: 30 },
  { key: 'lastMonth', label: 'Last Month', days: 30 },
  { key: 'm2', label: '2 Months', days: 60 },
  { key: 'm3', label: '3 Months', days: 90 },
  { key: 'm4', label: '4 Months', days: 120 },
  { key: 'm6', label: '6 Months', days: 180 },
  { key: 'm8', label: '8 Months', days: 240 },
  { key: 'm10', label: '10 Months', days: 300 },
  { key: 'm12', label: '12 Months', days: 365 },
];

function sumInRange(perDay: { day: string; earnings: number }[], fromStr: string, toStr: string): number {
  let total = 0;
  for (const row of perDay) {
    if (row.day >= fromStr && row.day <= toStr) total += row.earnings;
  }
  return Math.round(total * 100) / 100;
}

function hasDataInRange(
  perDay: { day: string; earnings: number }[],
  fromStr: string,
  toStr: string,
): boolean {
  return perDay.some((row) => row.day >= fromStr && row.day <= toStr);
}

export function EarningsHistory({ summary }: EarningsHistoryProps) {
  const cards = useMemo(() => {
    const todayStr = istDateString();
    const todayDate = new Date(todayStr + 'T00:00:00+05:30');

    return PERIODS.map((p) => {
      let fromStr: string;
      let toStr: string;
      if (p.key === 'lastMonth') {
        const prevMonth = new Date(todayDate);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        prevMonth.setDate(1);
        const lastDayOfPrev = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0);
        fromStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
        toStr = `${lastDayOfPrev.getFullYear()}-${String(lastDayOfPrev.getMonth() + 1).padStart(2, '0')}-${String(lastDayOfPrev.getDate()).padStart(2, '0')}`;
      } else if (p.key === 'today') {
        fromStr = todayStr;
        toStr = todayStr;
      } else if (p.key === 'yesterday') {
        const y = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
        const yStr = istDateString(y);
        fromStr = yStr;
        toStr = yStr;
      } else {
        toStr = todayStr;
        const from = new Date(todayDate.getTime() - (p.days - 1) * 24 * 60 * 60 * 1000);
        fromStr = istDateString(from);
      }

      const current = sumInRange(summary.perDay, fromStr, toStr);
      const hasCurrent = hasDataInRange(summary.perDay, fromStr, toStr);

      // Previous equivalent period for change comparison
      const fromDate = new Date(fromStr + 'T00:00:00+05:30');
      const toDate = new Date(toStr + 'T00:00:00+05:30');
      const spanMs = toDate.getTime() - fromDate.getTime();
      const prevToDate = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
      const prevFromDate = new Date(prevToDate.getTime() - spanMs);
      const prevFromStr = istDateString(prevFromDate);
      const prevToStr = istDateString(prevToDate);
      const previous = sumInRange(summary.perDay, prevFromStr, prevToStr);
      const hasPrevious = hasDataInRange(summary.perDay, prevFromStr, prevToStr);

      let change: number | null = null;
      if (hasCurrent && hasPrevious && previous > 0) {
        change = Math.round(((current - previous) / previous) * 1000) / 10;
      }

      return {
        key: p.key,
        label: p.label,
        current,
        hasCurrent,
        hasPrevious,
        change,
      };
    });
  }, [summary.perDay]);

  const totalAllTime = useMemo(
    () => Math.round(summary.perDay.reduce((s, r) => s + r.earnings, 0) * 100) / 100,
    [summary.perDay],
  );

  return (
    <section className="glass-card p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500/80 to-teal-600/80 rounded-lg flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-100">Earnings History</h2>
            <p className="text-[11px] text-slate-500 truncate">
              {summary.daysEarning} day{summary.daysEarning === 1 ? '' : 's'} of data · All-time <span className="tnum text-slate-400 font-medium">{formatCurrency(totalAllTime)}</span><span className="hidden sm:inline tnum text-slate-600"> · {formatInr(totalAllTime)}</span>
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 shrink-0">
          <CalendarRange className="w-3.5 h-3.5" />
          <span>Period-over-period change</span>
        </div>
      </div>

      {/* Period grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {cards.map((c) => {
          const hasData = c.hasCurrent;
          const changeUp = c.change !== null && c.change > 0;
          const changeDown = c.change !== null && c.change < 0;
          const changeFlat = c.change !== null && c.change === 0;
          const isHighlight = c.key === 'today' || c.key === 'yesterday';
          return (
            <div
              key={c.key}
              className={`relative rounded-xl border p-3 sm:p-3.5 transition-all overflow-hidden ${
                !hasData
                  ? 'bg-black/20 border-white/[0.04]'
                  : isHighlight
                  ? 'bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20 hover:border-emerald-400/30'
                  : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wide truncate">
                  {c.label}
                </span>
                {hasData && c.change !== null && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      changeUp
                        ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-600/30'
                        : changeDown
                        ? 'text-rose-300 bg-rose-500/10 border border-rose-600/30'
                        : 'text-slate-400 bg-slate-700/30 border border-slate-600/30'
                    }`}
                    title={`vs previous ${c.label.toLowerCase()}: ${c.change > 0 ? '+' : ''}${c.change}%`}
                  >
                    {changeUp && <TrendingUp className="w-2.5 h-2.5" />}
                    {changeDown && <TrendingDown className="w-2.5 h-2.5" />}
                    {changeFlat && <Minus className="w-2.5 h-2.5" />}
                    {c.change > 0 ? '+' : ''}{c.change}%
                  </span>
                )}
              </div>
              {hasData ? (
                <>
                  <div className="text-lg sm:text-xl font-bold text-slate-100 tnum">
                    {formatCurrency(c.current)}
                  </div>
                  <div className="text-[10px] text-slate-500 tnum">
                    {formatInr(c.current)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 truncate">
                    {c.hasPrevious ? 'vs prior period' : 'no prior comparison'}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-start justify-center h-[calc(100%-1.5rem)]">
                  <div className="text-sm sm:text-base font-semibold text-slate-600 italic">No Data</div>
                  <div className="text-[10px] text-slate-700 mt-0.5">nothing tracked yet</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
