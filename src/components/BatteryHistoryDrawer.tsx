import { useEffect, useState, useMemo } from 'react';
import { X, Battery, BatteryCharging, Clock, Zap, TrendingDown, TrendingUp, Activity, AlertTriangle, Calendar, ChevronLeft, Plug, PlugZap, Thermometer, Snowflake, Flame } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatTime, formatShortDate, istDateString } from '@/lib/utils';

type BatteryReport = {
  id: string;
  device_id: string;
  battery_percent: number;
  is_charging: boolean;
  temperature_c: number | null;
  heat_status: string | null;
  reported_at: string;
};

type HeatChip = { icon: typeof Thermometer; color: string; label: string };

function heatChip(heat: string | null | undefined): HeatChip {
  const h = (heat ?? 'cool').toLowerCase();
  if (h === 'boiling') return { icon: Flame, color: 'text-red-400', label: 'Boiling' };
  if (h === 'hot') return { icon: Thermometer, color: 'text-amber-400', label: 'Hot' };
  return { icon: Snowflake, color: 'text-sky-400', label: 'Cool' };
}

type DailySummary = {
  device_id: string;
  day: string;
  min_pct: number;
  max_pct: number;
  avg_pct: string | number;
  report_count: number;
  charging_count: number;
  charging_pct: string | number;
  first_report: string;
  last_report: string;
};

type PowerCutEvent = {
  device_id: string;
  battery_at_disconnect: number;
  disconnected_at: string;
  reconnected_at: string | null;
  duration_ms: number | null;
  battery_at_reconnect: number | null;
  min_battery: number | null;
  battery_drop: number;
};

type ChargeCycle = {
  id: string;
  droppedFrom: number;
  droppedTo: number;
  dropAmount: number;
  disconnectedAt: string;
  reconnectedAt: string;
  durationMs: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = 'daily' | 'cycles' | 'powercuts';

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ${mins % 60}m`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  const secs = Math.floor(ms / 1000);
  return `${secs}s`;
}

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

export function BatteryHistoryDrawer({ open, onClose }: Props) {
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [powerCuts, setPowerCuts] = useState<PowerCutEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('daily');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayReports, setDayReports] = useState<BatteryReport[]>([]);
  const [dayReportsLoading, setDayReportsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      supabase
        .from('battery_daily_summary')
        .select('*')
        .eq('device_id', 'laptop')
        .order('day', { ascending: false }),
      supabase
        .from('battery_power_cut_transitions')
        .select('*')
        .eq('device_id', 'laptop')
        .order('disconnected_at', { ascending: false }),
    ]).then(([dailyRes, cutsRes]) => {
      if (!dailyRes.error && dailyRes.data) {
        setDailySummaries(dailyRes.data as DailySummary[]);
      }
      if (!cutsRes.error && cutsRes.data) {
        setPowerCuts(cutsRes.data as PowerCutEvent[]);
      }
      setLoading(false);
    });
  }, [open]);

  // Load detailed reports when a specific day is selected
  useEffect(() => {
    if (!selectedDay) return;
    setDayReportsLoading(true);
    const datePart = selectedDay.slice(0, 10);
    const dayStartIso = new Date(datePart + 'T00:00:00+05:30').toISOString();
    const dayEndIso = new Date(new Date(datePart + 'T00:00:00+05:30').getTime() + 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('battery_reports')
      .select('*')
      .eq('device_id', 'laptop')
      .gte('reported_at', dayStartIso)
      .lt('reported_at', dayEndIso)
      .order('reported_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!error && data) {
          setDayReports(data as BatteryReport[]);
        }
        setDayReportsLoading(false);
      });
  }, [selectedDay]);

  const cycles = useMemo<ChargeCycle[]>(() => {
    return powerCuts
      .filter((c) => c.reconnected_at !== null && c.duration_ms !== null && c.battery_drop > 0)
      .map((c) => ({
        id: `${c.disconnected_at}`,
        droppedFrom: c.battery_at_disconnect,
        droppedTo: c.min_battery ?? c.battery_at_disconnect,
        dropAmount: c.battery_drop,
        disconnectedAt: c.disconnected_at,
        reconnectedAt: c.reconnected_at!,
        durationMs: c.duration_ms!,
      }));
  }, [powerCuts]);

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
              <div className="w-8 h-8 bg-gradient-to-br from-sky-500/80 to-blue-600/80 rounded-lg flex items-center justify-center">
                <Battery className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {selectedDay ? formatDayLabel(selectedDay) : 'Battery History'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {selectedDay ? 'Detailed report timeline' : 'Your laptop battery over time'}
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

        {/* Day detail view — replaces tabs when a day is selected */}
        {selectedDay ? (
          <DayDetailView
            day={selectedDay}
            reports={dayReports}
            loading={dayReportsLoading}
          />
        ) : (
          <>
            {/* Tab switcher */}
            <div className="flex gap-1 px-5 pt-3 pb-2 sticky top-[60px] bg-[#0b0f18]/95 backdrop-blur-xl z-[5]">
              <button
                onClick={() => setTab('daily')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'daily'
                    ? 'bg-sky-500/15 border border-sky-500/30 text-sky-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Daily
                {dailySummaries.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-slate-400 tnum">{dailySummaries.length}</span>
                )}
              </button>
              <button
                onClick={() => setTab('cycles')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'cycles'
                    ? 'bg-sky-500/15 border border-sky-500/30 text-sky-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Cycles
                {cycles.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-slate-400 tnum">{cycles.length}</span>
                )}
              </button>
              <button
                onClick={() => setTab('powercuts')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'powercuts'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Cuts
                {powerCuts.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-slate-400 tnum">{powerCuts.length}</span>
                )}
              </button>
            </div>

            <div className="px-5 py-3">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : tab === 'daily' ? (
                <DailyTab summaries={dailySummaries} onSelectDay={setSelectedDay} />
              ) : tab === 'cycles' ? (
                <CyclesTab cycles={cycles} />
              ) : (
                <PowerCutsTab powerCuts={powerCuts} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DayDetailView({ day, reports, loading }: { day: string; reports: BatteryReport[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-5 py-3 space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Battery className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No reports for this day</p>
      </div>
    );
  }

  // Filter to show only entries where battery %, charging state, or temperature changed
  const tempOf = (r: BatteryReport) => r.temperature_c ?? null;
  const significant = reports.filter((r, i) => {
    if (i === 0) return true;
    const prev = reports[i - 1];
    return (
      r.battery_percent !== prev.battery_percent
      || r.is_charging !== prev.is_charging
      || tempOf(r) !== tempOf(prev)
    );
  });

  return (
    <div className="px-5 py-3 space-y-1.5">
      <p className="text-[11px] text-slate-500 mb-3 px-1">
        Showing {significant.length} significant changes out of {reports.length} total reports.
      </p>
      {significant.map((r, i) => {
        const prev = significant[i + 1];
        const changed = prev && prev.battery_percent !== r.battery_percent;
        const chargingChanged = prev && prev.is_charging !== r.is_charging;
        const tempChanged = prev && tempOf(r) !== tempOf(prev);
        const chip = heatChip(r.heat_status);
        const HeatIcon = chip.icon;

        return (
          <div key={r.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
            changed || chargingChanged || tempChanged || i === 0
              ? 'bg-white/[0.04] border border-white/[0.06]'
              : 'bg-transparent'
          }`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              r.is_charging
                ? 'bg-emerald-500/10 border border-emerald-500/20'
                : 'bg-slate-500/10 border border-slate-500/15'
            }`}>
              {r.is_charging ? (
                <BatteryCharging className="w-4 h-4 text-emerald-400" />
              ) : (
                <Battery className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-200 tnum">{r.battery_percent}%</span>
                {r.is_charging ? (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Charging</span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded">Power Cut</span>
                )}
                {r.temperature_c !== null && r.temperature_c !== undefined && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${chip.color} bg-white/[0.04] px-1.5 py-0.5 rounded tnum`}>
                    <HeatIcon className="w-2.5 h-2.5" />
                    {Math.round(r.temperature_c)}°C
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                <Clock className="w-3 h-3" />
                <span>{formatTime(r.reported_at)}</span>
              </div>
            </div>
            {changed && prev && (
              <div className={`text-[11px] font-semibold tnum ${r.battery_percent > prev.battery_percent ? 'text-emerald-400' : 'text-rose-400'}`}>
                {r.battery_percent > prev.battery_percent ? '+' : ''}{r.battery_percent - prev.battery_percent}%
              </div>
            )}
            {tempChanged && prev && r.temperature_c !== null && prev.temperature_c !== null && (
              <div className={`text-[11px] font-semibold tnum ${chip.color}`}>
                {r.temperature_c > prev.temperature_c ? '+' : ''}{Math.round(r.temperature_c - prev.temperature_c)}°C
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DailyTab({ summaries, onSelectDay }: { summaries: DailySummary[]; onSelectDay: (day: string) => void }) {
  if (summaries.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No battery data yet</p>
        <p className="text-xs text-slate-600 mt-1">Daily summaries will appear here once the battery sync starts.</p>
      </div>
    );
  }

  const totalDays = summaries.length;
  const totalReports = summaries.reduce((s, d) => s + d.report_count, 0);
  const daysWithCuts = summaries.filter((d) => Number(d.charging_pct) < 100).length;
  const lowestEver = Math.min(...summaries.map((d) => d.min_pct));

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Days Tracked</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{totalDays}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">{totalReports.toLocaleString()} total reports</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Days w/ Cuts</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{daysWithCuts}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">Charging was interrupted</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 col-span-2">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Lowest Battery Ever</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{lowestEver}%</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {summaries.find((d) => d.min_pct === lowestEver)
              ? formatDayLabel(summaries.find((d) => d.min_pct === lowestEver)!.day)
              : ''}
          </div>
        </div>
      </div>

      {/* Daily list */}
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">All Days Since Launch</div>
        <div className="space-y-1.5">
          {summaries.map((d) => {
            const chargingPct = Number(d.charging_pct);
            const hadCuts = chargingPct < 100;
            const drainAmount = d.max_pct - d.min_pct;

            return (
              <button
                key={d.day}
                onClick={() => onSelectDay(d.day)}
                className="w-full rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      hadCuts
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : 'bg-emerald-500/10 border border-emerald-500/20'
                    }`}>
                      {hadCuts ? (
                        <Zap className="w-4 h-4 text-amber-400" />
                      ) : (
                        <PlugZap className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">{formatDayLabel(d.day)}</div>
                      <div className="text-[11px] text-slate-500 tnum">{d.report_count.toLocaleString()} reports</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-200 tnum">
                      {d.min_pct}% – {d.max_pct}%
                    </div>
                    <div className="flex items-center gap-1 text-[10px] mt-0.5">
                      {chargingPct >= 99.9 ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Plug className="w-2.5 h-2.5" />Plugged {chargingPct}%
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />{chargingPct}% plugged
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Visual battery range bar */}
                <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`absolute h-full rounded-full ${
                      hadCuts
                        ? 'bg-gradient-to-r from-amber-500/60 to-rose-500/60'
                        : 'bg-gradient-to-r from-emerald-500/40 to-teal-500/40'
                    }`}
                    style={{
                      left: `${d.min_pct}%`,
                      width: `${Math.max(2, d.max_pct - d.min_pct)}%`,
                    }}
                  />
                </div>
                {drainAmount > 0 && (
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-600">
                    <span className="tnum">Drain: {drainAmount}%</span>
                    <span className="text-slate-500 group-hover:text-slate-300 transition-colors">Tap to view details →</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CyclesTab({ cycles }: { cycles: ChargeCycle[] }) {
  if (cycles.length === 0) {
    return (
      <div className="text-center py-12">
        <TrendingDown className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No discharge cycles yet</p>
        <p className="text-xs text-slate-600 mt-1">Cycles appear when battery drops while unplugged, then charges back up.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500 mb-3 px-1">
        Showing only discharge-then-recharge cycles — when battery dropped and recovered.
      </p>
      {cycles.map((c) => (
        <div key={c.id} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-200 tnum">
                  {c.droppedFrom}% → {c.droppedTo}%
                </div>
                <div className="text-[11px] text-slate-500">
                  {formatShortDate(c.disconnectedAt)} · {formatTime(c.disconnectedAt)}
                </div>
              </div>
            </div>
            {c.dropAmount > 0 && (
              <span className="text-sm font-bold text-rose-400 tnum">-{c.dropAmount}%</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 pl-10">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(c.durationMs)}
            </span>
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              Recharged {formatShortDate(c.reconnectedAt)} · {formatTime(c.reconnectedAt)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 pl-10">
            <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500/60 to-rose-500/60 rounded-full"
                style={{ width: `${Math.min(100, (c.dropAmount / Math.max(1, c.droppedFrom)) * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-600 tnum">{Math.round((c.dropAmount / Math.max(1, c.droppedFrom)) * 100)}% drain</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PowerCutsTab({ powerCuts }: { powerCuts: PowerCutEvent[] }) {
  if (powerCuts.length === 0) {
    return (
      <div className="text-center py-12">
        <Zap className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No power cuts detected</p>
        <p className="text-xs text-slate-600 mt-1">Power cuts appear when charging disconnects and battery starts draining.</p>
      </div>
    );
  }

  const totalCuts = powerCuts.length;
  const resolvedCuts = powerCuts.filter((c) => c.duration_ms !== null);
  const avgDuration = resolvedCuts.length > 0
    ? resolvedCuts.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0) / resolvedCuts.length
    : 0;
  const longestCut = resolvedCuts.reduce((max, c) => Math.max(max, c.duration_ms ?? 0), 0);
  const avgDrop = powerCuts.reduce((sum, c) => sum + c.battery_drop, 0) / powerCuts.length;

  const hourBuckets: Record<number, number> = {};
  for (const cut of powerCuts) {
    const h = parseInt(new Date(cut.disconnected_at).toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
    hourBuckets[h] = (hourBuckets[h] || 0) + 1;
  }
  const peakHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0];
  const peakHourLabel = peakHour ? `${peakHour[0]}:00` : null;

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const twoWeeksAgo = now - 14 * 86400000;
  const recentCuts = powerCuts.filter((c) => new Date(c.disconnected_at).getTime() >= weekAgo).length;
  const previousCuts = powerCuts.filter((c) => {
    const t = new Date(c.disconnected_at).getTime();
    return t >= twoWeeksAgo && t < weekAgo;
  }).length;

  const lastCut = powerCuts[0];
  const sinceLastCutMs = Date.now() - new Date(lastCut.disconnected_at).getTime();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total Cuts</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{totalCuts}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {recentCuts} in last 7 days
            {previousCuts > 0 && (
              <span className={recentCuts > previousCuts ? 'text-rose-400' : 'text-emerald-400'}>
                {' '}({recentCuts > previousCuts ? '↑' : '↓'} vs prev week)
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Avg Duration</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">
            {avgDuration > 0 ? formatDuration(avgDuration) : '--'}
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            Longest: {longestCut > 0 ? formatDuration(longestCut) : '--'}
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Avg Battery Drop</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">
            {avgDrop > 0 ? `-${Math.round(avgDrop)}%` : '--'}
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">Per power cut event</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Peak Hour</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">
            {peakHourLabel ?? '--'}
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5">
            {peakHour ? `${peakHour[1]} cuts at this hour` : 'No pattern yet'}
          </div>
        </div>
      </div>

      {totalCuts >= 3 && (
        <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-bold text-amber-300 mb-1">Power Cut Prediction</div>
              <div className="text-[11px] text-amber-200/70 leading-relaxed space-y-1">
                {peakHourLabel && (
                  <p>Most power cuts happen around <span className="font-semibold text-amber-200">{peakHourLabel}</span>. Be prepared around this time.</p>
                )}
                {recentCuts > previousCuts && previousCuts > 0 && (
                  <p>Power cuts are <span className="font-semibold text-rose-300">increasing</span> — {recentCuts} in the last week vs {previousCuts} the week before.</p>
                )}
                {recentCuts < previousCuts && previousCuts > 0 && (
                  <p>Power cuts are <span className="font-semibold text-emerald-300">decreasing</span> — {recentCuts} in the last week vs {previousCuts} the week before.</p>
                )}
                <p>Last cut was <span className="font-semibold text-amber-200">{formatDuration(sinceLastCutMs)}</span> ago{avgDuration > 0 ? ` · average duration is ${formatDuration(avgDuration)}` : ''}.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">Power Cut History</div>
        <div className="space-y-1.5">
          {powerCuts.map((cut, idx) => {
            const prevDayStr = idx > 0 ? new Date(powerCuts[idx - 1].disconnected_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '';
            const curDayStr = new Date(cut.disconnected_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const showDivider = idx === 0 || prevDayStr !== curDayStr;
            const isOngoing = cut.reconnected_at === null;

            return (
              <div key={`${cut.disconnected_at}`}>
                {showDivider && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                      {formatShortDate(cut.disconnected_at)}
                    </div>
                    <div className="flex-1 h-px bg-white/[0.04]" />
                  </div>
                )}
                <div className={`rounded-lg border p-3 transition-all ${
                  isOngoing
                    ? 'bg-rose-500/[0.06] border-rose-500/20'
                    : 'bg-white/[0.03] border-white/[0.06]'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isOngoing
                          ? 'bg-rose-500/15 border border-rose-500/30'
                          : 'bg-amber-500/10 border border-amber-500/20'
                      }`}>
                        <Zap className={`w-4 h-4 ${isOngoing ? 'text-rose-400' : 'text-amber-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-200">
                            {isOngoing ? 'Power Cut Ongoing' : 'Power Cut'}
                          </span>
                          {isOngoing && (
                            <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded animate-pulse-soft">LIVE</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(cut.disconnected_at)}</span>
                          {cut.reconnected_at && (
                            <>
                              <span className="text-slate-700">→</span>
                              <span>{formatTime(cut.reconnected_at)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {cut.duration_ms !== null ? (
                        <div className="text-sm font-bold text-amber-300 tnum">{formatDuration(cut.duration_ms)}</div>
                      ) : (
                        <div className="text-sm font-bold text-rose-400 tnum">Ongoing</div>
                      )}
                      <div className="text-[10px] text-slate-600">duration</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] pl-10 flex-wrap">
                    <span className="text-slate-500">
                      Started at <span className="font-semibold text-slate-300 tnum">{cut.battery_at_disconnect}%</span>
                    </span>
                    {cut.min_battery !== null && cut.min_battery !== cut.battery_at_disconnect && (
                      <span className="text-slate-500">
                        Dropped to <span className="font-semibold text-rose-400 tnum">{cut.min_battery}%</span>
                      </span>
                    )}
                    {cut.battery_at_reconnect !== null && (
                      <span className="text-slate-500">
                        Recovered to <span className="font-semibold text-emerald-400 tnum">{cut.battery_at_reconnect}%</span>
                      </span>
                    )}
                    {cut.battery_drop > 0 && (
                      <span className="text-rose-400 font-semibold tnum">-{cut.battery_drop}%</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
