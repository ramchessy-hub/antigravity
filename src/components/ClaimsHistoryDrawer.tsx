import { useEffect, useState } from 'react';
import { X, Bell, TrendingUp, Calendar, Clock, ChevronLeft, CheckCircle2, Circle, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { BalanceClaim } from '@/lib/supabase';
import { formatCurrency, formatInr, formatTime, formatTimeAgo, istDateString } from '@/lib/utils';

type DailySummary = {
  day: string;
  total_claims: number;
  claimed_count: number;
  unclaimed_count: number;
  total_increase: string | number;
  avg_increase: string | number;
  device_count: number;
  first_claim: string;
  last_claim: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  deviceNameMap?: Map<string, string>;
};

function formatDayLabel(dayStr: string): string {
  const datePart = dayStr.slice(0, 10);
  const d = new Date(datePart + 'T00:00:00+05:30');
  const todayStr = istDateString();
  const todayDate = new Date(todayStr + 'T00:00:00+05:30');
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = istDateString(yesterdayDate);
  if (datePart === todayStr) return 'Today';
  if (datePart === yesterdayStr) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' });
}

function toNumber(val: string | number | null): number {
  if (val === null) return 0;
  return typeof val === 'string' ? parseFloat(val) : val;
}

export function ClaimsHistoryDrawer({ open, onClose, deviceNameMap }: Props) {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayClaims, setDayClaims] = useState<BalanceClaim[]>([]);
  const [dayClaimsLoading, setDayClaimsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('claims_daily_summary')
      .select('*')
      .order('day', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setSummaries(data as DailySummary[]);
        }
        setLoading(false);
      });
  }, [open]);

  useEffect(() => {
    if (!selectedDay) return;
    setDayClaimsLoading(true);
    const datePart = selectedDay.slice(0, 10);
    const dayStartIso = new Date(datePart + 'T00:00:00+05:30').toISOString();
    const dayEndIso = new Date(new Date(datePart + 'T00:00:00+05:30').getTime() + 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('balance_claims')
      .select('*')
      .gte('created_at', dayStartIso)
      .lt('created_at', dayEndIso)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!error && data) {
          setDayClaims(data as BalanceClaim[]);
        }
        setDayClaimsLoading(false);
      });
  }, [selectedDay]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md h-full bg-[#0b0f18] border-l border-white/[0.08] overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 z-10 bg-[#0b0f18]/95 backdrop-blur-xl border-b border-white/[0.06] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {selectedDay ? (
              <button
                onClick={() => setSelectedDay(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500/80 to-orange-600/80 rounded-lg flex items-center justify-center">
                <Bell className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {selectedDay ? formatDayLabel(selectedDay) : 'Claims History'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {selectedDay ? 'All claims this day' : 'Every claim since launch'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {selectedDay ? (
          <DayDetailView
            day={selectedDay}
            claims={dayClaims}
            loading={dayClaimsLoading}
            deviceNameMap={deviceNameMap}
          />
        ) : (
          <div className="px-5 py-3">
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />
                ))}
              </div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No claims data yet</p>
                <p className="text-xs text-slate-600 mt-1">Daily summaries will appear here once claims start coming in.</p>
              </div>
            ) : (
              <DailyTab summaries={summaries} onSelectDay={setSelectedDay} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DailyTab({ summaries, onSelectDay }: { summaries: DailySummary[]; onSelectDay: (day: string) => void }) {
  const totalDays = summaries.length;
  const totalClaims = summaries.reduce((s, d) => s + d.total_claims, 0);
  const totalIncrease = summaries.reduce((s, d) => s + toNumber(d.total_increase), 0);
  const totalClaimed = summaries.reduce((s, d) => s + d.claimed_count, 0);
  const totalUnclaimed = summaries.reduce((s, d) => s + d.unclaimed_count, 0);
  const bestDay = summaries.reduce((best, d) =>
    toNumber(d.total_increase) > toNumber(best?.total_increase ?? 0) ? d : best,
    summaries[0]
  );
  const claimRate = totalClaims > 0 ? Math.round((totalClaimed / totalClaims) * 100) : 0;

  // Simple trend: last 7 days vs previous 7 days
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const twoWeeksAgo = now - 14 * 86400000;
  const recentIncrease = summaries
    .filter((d) => new Date(d.day.slice(0, 10) + 'T00:00:00+05:30').getTime() >= weekAgo)
    .reduce((s, d) => s + toNumber(d.total_increase), 0);
  const previousIncrease = summaries
    .filter((d) => {
      const t = new Date(d.day.slice(0, 10) + 'T00:00:00+05:30').getTime();
      return t >= twoWeeksAgo && t < weekAgo;
    })
    .reduce((s, d) => s + toNumber(d.total_increase), 0);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total Earnings</span>
          </div>
          <div className="text-xl font-extrabold text-emerald-400 tnum">{formatCurrency(totalIncrease)}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {formatInr(totalIncrease)} · {totalClaims.toLocaleString()} claims
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Days Tracked</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{totalDays}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">Since Oct 10, 2026</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Claim Rate</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{claimRate}%</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {totalClaimed.toLocaleString()} claimed · {totalUnclaimed.toLocaleString()} missed
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Best Day</span>
          </div>
          <div className="text-xl font-extrabold text-amber-300 tnum">{formatCurrency(toNumber(bestDay?.total_increase))}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">{bestDay ? formatDayLabel(bestDay.day) : '--'}</div>
        </div>
      </div>

      {/* Trend insight */}
      {previousIncrease > 0 && (
        <div className={`rounded-lg p-3 border ${
          recentIncrease >= previousIncrease
            ? 'bg-emerald-500/[0.06] border-emerald-500/20'
            : 'bg-rose-500/[0.06] border-rose-500/20'
        }`}>
          <div className="text-[11px] leading-relaxed">
            <span className={`font-bold ${recentIncrease >= previousIncrease ? 'text-emerald-300' : 'text-rose-300'}`}>
              {recentIncrease >= previousIncrease ? '↑ Up' : '↓ Down'} {Math.abs(((recentIncrease - previousIncrease) / previousIncrease) * 100).toFixed(0)}%
            </span>
            <span className="text-slate-500"> vs last week — </span>
            <span className="text-slate-300 tnum">{formatCurrency(recentIncrease)}</span>
            <span className="text-slate-500"> this week, </span>
            <span className="text-slate-300 tnum">{formatCurrency(previousIncrease)}</span>
            <span className="text-slate-500"> last week</span>
          </div>
        </div>
      )}

      {/* Daily list */}
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">All Days</div>
        <div className="space-y-1.5">
          {summaries.map((d) => {
            const increase = toNumber(d.total_increase);
            const claimRate = d.total_claims > 0 ? Math.round((d.claimed_count / d.total_claims) * 100) : 0;
            const isToday = formatDayLabel(d.day) === 'Today';

            return (
              <button
                key={d.day}
                onClick={() => onSelectDay(d.day)}
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isToday
                        ? 'bg-emerald-500/15 border border-emerald-500/30'
                        : 'bg-white/[0.04] border border-white/[0.06]'
                    }`}>
                      <TrendingUp className={`w-4 h-4 ${isToday ? 'text-emerald-400' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">{formatDayLabel(d.day)}</div>
                      <div className="text-[11px] text-slate-500 tnum">
                        {d.total_claims.toLocaleString()} claims · {d.device_count} devices
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-400 tnum">
                      +{formatCurrency(increase)}
                    </div>
                    <div className="text-[10px] text-slate-600 tnum">{claimRate}% claimed</div>
                  </div>
                </div>
                {/* Visual claim rate bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500/50 rounded-l-full"
                      style={{ width: `${claimRate}%` }}
                    />
                    <div
                      className="h-full bg-slate-600/40"
                      style={{ width: `${100 - claimRate}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-600 tnum whitespace-nowrap">
                    {d.claimed_count} / {d.total_claims}
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300 transition-colors whitespace-nowrap">→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayDetailView({ day, claims, loading, deviceNameMap }: {
  day: string;
  claims: BalanceClaim[];
  loading: boolean;
  deviceNameMap?: Map<string, string>;
}) {
  if (loading) {
    return (
      <div className="px-5 py-3 space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="text-center py-12">
        <Bell className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No claims for this day</p>
      </div>
    );
  }

  const totalIncrease = claims.reduce((s, c) => s + (c.increase_amount ?? 0), 0);
  const claimedCount = claims.filter((c) => c.claimed).length;
  const unclaimedCount = claims.length - claimedCount;

  // Group by device
  const byDevice = new Map<string, BalanceClaim[]>();
  for (const c of claims) {
    const list = byDevice.get(c.device_id) ?? [];
    list.push(c);
    byDevice.set(c.device_id, list);
  }
  const deviceEntries = Array.from(byDevice.entries()).sort((a, b) => {
    const aTotal = a[1].reduce((s, c) => s + (c.increase_amount ?? 0), 0);
    const bTotal = b[1].reduce((s, c) => s + (c.increase_amount ?? 0), 0);
    return bTotal - aTotal;
  });

  return (
    <div className="px-5 py-3 space-y-4">
      {/* Day summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
          <div className="text-lg font-extrabold text-emerald-400 tnum">{formatCurrency(totalIncrease)}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">Total earned</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
          <div className="text-lg font-extrabold text-slate-100 tnum">{claims.length}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">Total claims</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 text-center">
          <div className="text-lg font-extrabold text-slate-100 tnum">{byDevice.size}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">Devices</div>
        </div>
      </div>

      {/* Claimed vs unclaimed split */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          <span className="tnum font-semibold">{claimedCount}</span> claimed
        </span>
        <span className="flex items-center gap-1 text-slate-500">
          <Circle className="w-3 h-3" />
          <span className="tnum font-semibold">{unclaimedCount}</span> unclaimed
        </span>
      </div>

      {/* Per-device groups */}
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">By Device</div>
        <div className="space-y-3">
          {deviceEntries.map(([deviceId, deviceClaims]) => {
            const name = deviceNameMap?.get(deviceId) ?? deviceId;
            const deviceTotal = deviceClaims.reduce((s, c) => s + (c.increase_amount ?? 0), 0);
            return (
              <div key={deviceId}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-bold text-slate-300">{name}</span>
                  <span className="text-[11px] text-emerald-400 font-semibold tnum">+{formatCurrency(deviceTotal)}</span>
                  <span className="text-[10px] text-slate-600 tnum">{deviceClaims.length} claims</span>
                </div>
                <div className="space-y-1 pl-5">
                  {deviceClaims.slice(0, 15).map((claim) => (
                    <div
                      key={claim.id}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-all ${
                        claim.claimed
                          ? 'bg-black/20 opacity-50'
                          : 'bg-emerald-500/[0.07] border border-emerald-500/15'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                        claim.claimed ? 'bg-white/5' : 'bg-emerald-500/15'
                      }`}>
                        {claim.claimed ? (
                          <CheckCircle2 className="w-3 h-3 text-slate-600" />
                        ) : (
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-semibold tnum ${claim.claimed ? 'text-slate-500' : 'text-emerald-400'}`}>
                          +{formatCurrency(claim.increase_amount ?? 0)}
                        </span>
                        <span className="text-[11px] text-slate-600 tnum ml-2">
                          {formatCurrency(claim.previous_balance ?? 0)} → {formatCurrency(claim.new_balance ?? 0)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-600 tnum shrink-0 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTime(claim.created_at)}
                      </span>
                    </div>
                  ))}
                  {deviceClaims.length > 15 && (
                    <p className="text-[10px] text-slate-600 pl-2 pt-1">
                      +{deviceClaims.length - 15} more claims
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
