import { useEffect, useState, useMemo } from 'react';
import {
  X, Thermometer, Snowflake, Flame, Clock, TrendingUp, TrendingDown,
  Activity, Calendar, ChevronLeft, Cpu, Zap, Battery, BatteryCharging, Monitor,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatTime, istDateString } from '@/lib/utils';

type BatteryReport = {
  id: string;
  device_id: string;
  battery_percent: number;
  is_charging: boolean;
  temperature_c: number | null;      // GPU temperature
  cpu_temperature_c: number | null;  // CPU temperature
  heat_status: string | null;
  reported_at: string;
  temperature_reported_at?: string | null;
};

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
  min_temp_c: number | null;
  max_temp_c: number | null;
  avg_temp_c: number | null;
  temp_report_count: number | null;
  last_temp_c: number | null;
  last_heat_status: string | null;
  min_cpu_temp_c: number | null;
  max_cpu_temp_c: number | null;
  avg_cpu_temp_c: number | null;
  cpu_temp_report_count: number | null;
  last_cpu_temp_c: number | null;
};

type HeatLevel = 'boiling' | 'hot' | 'cool';
type HeatChip = { icon: typeof Thermometer; color: string; bg: string; label: string };

function heatChip(heat: string | null | undefined): HeatChip {
  const h = (heat ?? 'cool').toLowerCase() as HeatLevel;
  if (h === 'boiling') return { icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Boiling' };
  if (h === 'hot') return { icon: Thermometer, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Hot' };
  return { icon: Snowflake, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', label: 'Cool' };
}

function heatLevelFromTemp(temp: number): HeatLevel {
  if (temp >= 75) return 'boiling';
  if (temp >= 55) return 'hot';
  return 'cool';
}

function classifyTemp(temp: number): { level: HeatLevel; label: string; color: string; icon: typeof Thermometer } {
  const level = heatLevelFromTemp(temp);
  if (level === 'boiling') return { level, label: 'Boiling', color: 'text-red-400', icon: Flame };
  if (level === 'hot') return { level, label: 'Hot', color: 'text-amber-400', icon: Thermometer };
  return { level, label: 'Cool', color: 'text-sky-400', icon: Snowflake };
}

type Props = {
  open: boolean;
  onClose: () => void;
  liveBattery: BatteryReport | null;
};

type Tab = 'overview' | 'daily';

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

export function TemperatureDrawer({ open, onClose, liveBattery }: Props) {
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayReports, setDayReports] = useState<BatteryReport[]>([]);
  const [dayReportsLoading, setDayReportsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from('battery_daily_summary')
      .select('*')
      .eq('device_id', 'laptop')
      .order('day', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setDailySummaries(data as DailySummary[]);
        setLoading(false);
      });
  }, [open]);

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
        if (!error && data) setDayReports(data as BatteryReport[]);
        setDayReportsLoading(false);
      });
  }, [selectedDay]);

  const tempDays = useMemo(
    () => dailySummaries.filter((d) => (d.temp_report_count && d.temp_report_count > 0) || (d.cpu_temp_report_count && d.cpu_temp_report_count > 0)),
    [dailySummaries],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[#0b0f18] border-l border-white/[0.08] overflow-y-auto animate-slide-in-right">
        {/* Header */}
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
                <Thermometer className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {selectedDay ? formatDayLabel(selectedDay) : 'Temperatures'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {selectedDay ? 'GPU & CPU changes timeline' : 'GPU & CPU monitoring'}
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
          <DayTempView day={selectedDay} reports={dayReports} loading={dayReportsLoading} />
        ) : (
          <>
            <div className="flex gap-1 px-5 pt-3 pb-2 sticky top-[60px] bg-[#0b0f18]/95 backdrop-blur-xl z-[5]">
              <button
                onClick={() => setTab('overview')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'overview'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Live
              </button>
              <button
                onClick={() => setTab('daily')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  tab === 'daily'
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                History
                {tempDays.length > 0 && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/[0.08] text-slate-400 tnum">{tempDays.length}</span>
                )}
              </button>
            </div>

            <div className="px-5 py-3">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-white/[0.03] rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : tab === 'overview' ? (
                <OverviewTab liveBattery={liveBattery} dailySummaries={dailySummaries} />
              ) : (
                <DailyTempTab summaries={dailySummaries} onSelectDay={setSelectedDay} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Live tile for one sensor ── */
function TempTile({
  label, icon: Icon, temp, heatLevel, reportedAt, isStale,
}: {
  label: string;
  icon: typeof Thermometer;
  temp: number | null;
  heatLevel: HeatLevel | null;
  reportedAt: string | null;
  isStale: boolean;
}) {
  const classified = temp !== null ? classifyTemp(temp) : null;
  const TempIcon = classified?.icon ?? Snowflake;
  const bg = classified?.level === 'boiling' ? 'bg-red-500/[0.08] border-red-500/25'
    : classified?.level === 'hot' ? 'bg-amber-500/[0.08] border-amber-500/25'
    : 'bg-sky-500/[0.08] border-sky-500/25';

  if (temp === null) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-[10px] font-semibold text-slate-600 uppercase">{label}</span>
        </div>
        <div className="text-lg font-extrabold text-slate-600">--</div>
        <div className="text-[10px] text-slate-700">No data</div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span>
        </div>
        {isStale ? (
          <span className="text-[9px] font-semibold text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">Stale</span>
        ) : (
          <span className="flex items-center gap-0.5 text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            <span className="relative flex w-1 h-1 mr-0.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1 w-1 bg-emerald-400" />
            </span>
            Live
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <TempIcon className={`w-5 h-5 ${classified?.color}`} />
        <span className={`text-2xl font-extrabold tnum ${classified?.color}`}>{Math.round(temp)}°C</span>
        <span className={`text-[11px] font-semibold mb-0.5 ${classified?.color}`}>{classified?.label}</span>
      </div>
      {reportedAt && (
        <div className="text-[10px] text-slate-500 mt-1 tnum">{formatTime(reportedAt)}</div>
      )}
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({ liveBattery, dailySummaries }: { liveBattery: BatteryReport | null; dailySummaries: DailySummary[] }) {
  const now = Date.now();
  const tempDays = dailySummaries.filter((d) => (d.temp_report_count && d.temp_report_count > 0) || (d.cpu_temp_report_count && d.cpu_temp_report_count > 0));

  const gpuTemp = liveBattery?.temperature_c ?? null;
  const cpuTemp = liveBattery?.cpu_temperature_c ?? null;
  const liveReportedAt = liveBattery?.temperature_reported_at ?? liveBattery?.reported_at ?? null;
  const isCharging = liveBattery?.is_charging ?? false;
  const reportAgeMs = liveReportedAt ? now - new Date(liveReportedAt).getTime() : null;
  const isDataStale = reportAgeMs !== null && reportAgeMs > 5 * 60 * 1000;

  const todaySummary = tempDays.length > 0 ? tempDays[0] : null;
  const yesterdaySummary = tempDays.length > 1 ? tempDays[1] : null;

  // GPU trend
  const gpuTodayAvg = todaySummary?.avg_temp_c ?? null;
  const gpuYestAvg = yesterdaySummary?.avg_temp_c ?? null;
  const gpuTrend: 'up' | 'down' | 'stable' | null =
    gpuTodayAvg !== null && gpuYestAvg !== null
      ? Math.abs(gpuTodayAvg - gpuYestAvg) < 1 ? 'stable' : gpuTodayAvg > gpuYestAvg ? 'up' : 'down'
      : null;

  // CPU trend
  const cpuTodayAvg = todaySummary?.avg_cpu_temp_c ?? null;
  const cpuYestAvg = yesterdaySummary?.avg_cpu_temp_c ?? null;
  const cpuTrend: 'up' | 'down' | 'stable' | null =
    cpuTodayAvg !== null && cpuYestAvg !== null
      ? Math.abs(cpuTodayAvg - cpuYestAvg) < 1 ? 'stable' : cpuTodayAvg > cpuYestAvg ? 'up' : 'down'
      : null;

  const gpuAllMax = Math.max(...tempDays.map((d) => d.max_temp_c ?? 0).filter(Boolean));
  const cpuAllMax = Math.max(...tempDays.map((d) => d.max_cpu_temp_c ?? 0).filter(Boolean));

  const predictionText = useMemo(() => {
    const parts: string[] = [];
    if (gpuTemp !== null) {
      if (gpuTemp >= 75) parts.push(`GPU at ${Math.round(gpuTemp)}°C is critically hot — reduce load or check ventilation.`);
      else if (gpuTemp >= 55) parts.push(`GPU at ${Math.round(gpuTemp)}°C is elevated. Normal under heavy load.`);
      else parts.push(`GPU at ${Math.round(gpuTemp)}°C is running cool.`);
    }
    if (cpuTemp !== null) {
      if (cpuTemp >= 90) parts.push(`CPU at ${Math.round(cpuTemp)}°C is dangerously hot — check cooling immediately.`);
      else if (cpuTemp >= 70) parts.push(`CPU at ${Math.round(cpuTemp)}°C is high — expected under full load.`);
      else parts.push(`CPU at ${Math.round(cpuTemp)}°C is in a healthy range.`);
    }
    if (gpuTrend === 'up') parts.push(`GPU avg is rising vs yesterday (${gpuYestAvg?.toFixed(1)}°C → ${gpuTodayAvg?.toFixed(1)}°C).`);
    if (gpuTrend === 'down') parts.push(`GPU avg is cooling vs yesterday (${gpuYestAvg?.toFixed(1)}°C → ${gpuTodayAvg?.toFixed(1)}°C).`);
    if (cpuTrend === 'up') parts.push(`CPU avg is rising vs yesterday (${cpuYestAvg?.toFixed(1)}°C → ${cpuTodayAvg?.toFixed(1)}°C).`);
    if (cpuTrend === 'down') parts.push(`CPU avg is cooling vs yesterday (${cpuYestAvg?.toFixed(1)}°C → ${cpuTodayAvg?.toFixed(1)}°C).`);
    return parts;
  }, [gpuTemp, cpuTemp, gpuTrend, cpuTrend, gpuTodayAvg, cpuTodayAvg, gpuYestAvg, cpuYestAvg]);

  const dominantLevel: HeatLevel =
    (gpuTemp !== null && gpuTemp >= 75) || (cpuTemp !== null && cpuTemp >= 90) ? 'boiling' :
    (gpuTemp !== null && gpuTemp >= 55) || (cpuTemp !== null && cpuTemp >= 70) ? 'hot' : 'cool';

  const hasAnyTemp = gpuTemp !== null || cpuTemp !== null;

  return (
    <div className="space-y-4">
      {/* Live sensor tiles */}
      {hasAnyTemp ? (
        <div className="grid grid-cols-2 gap-2">
          <TempTile
            label="GPU"
            icon={Monitor}
            temp={gpuTemp}
            heatLevel={gpuTemp !== null ? heatLevelFromTemp(gpuTemp) : null}
            reportedAt={liveReportedAt}
            isStale={isDataStale}
          />
          <TempTile
            label="CPU"
            icon={Cpu}
            temp={cpuTemp}
            heatLevel={cpuTemp !== null ? heatLevelFromTemp(cpuTemp) : null}
            reportedAt={liveReportedAt}
            isStale={isDataStale}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
          <Thermometer className="w-10 h-10 text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No temperature data yet</p>
          <p className="text-xs text-slate-600 mt-1">Will appear once the script starts sending temperature.</p>
        </div>
      )}

      {/* Mumu / power status */}
      {liveBattery && (
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-lg p-2.5 border ${isCharging ? 'bg-emerald-500/[0.06] border-emerald-500/15' : 'bg-slate-500/[0.06] border-slate-500/15'}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <Cpu className={`w-3 h-3 ${isCharging ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Mumu</span>
            </div>
            <div className={`text-xs font-bold ${isCharging ? 'text-emerald-300' : 'text-slate-400'}`}>
              {isCharging ? 'Running' : 'Stopped'}
            </div>
          </div>
          <div className={`rounded-lg p-2.5 border ${!isCharging ? 'bg-rose-500/[0.06] border-rose-500/15' : 'bg-emerald-500/[0.06] border-emerald-500/15'}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              {!isCharging ? <Zap className="w-3 h-3 text-rose-400" /> : <BatteryCharging className="w-3 h-3 text-emerald-400" />}
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Power</span>
            </div>
            <div className={`text-xs font-bold ${!isCharging ? 'text-rose-300' : 'text-emerald-300'}`}>
              {!isCharging ? 'Cut' : 'Plugged'}
            </div>
          </div>
        </div>
      )}

      {/* Prediction */}
      {predictionText.length > 0 && (
        <div className={`rounded-lg border p-3.5 ${
          dominantLevel === 'boiling' ? 'bg-red-500/[0.06] border-red-500/20'
          : dominantLevel === 'hot' ? 'bg-amber-500/[0.06] border-amber-500/20'
          : 'bg-sky-500/[0.06] border-sky-500/20'
        }`}>
          <div className="flex items-start gap-2.5">
            <Activity className={`w-4 h-4 shrink-0 mt-0.5 ${dominantLevel === 'boiling' ? 'text-red-400' : dominantLevel === 'hot' ? 'text-amber-400' : 'text-sky-400'}`} />
            <div className="flex-1">
              <div className="text-xs font-bold text-slate-200 mb-1.5">Status & Trend</div>
              <div className="text-[11px] text-slate-400 leading-relaxed space-y-1.5">
                {predictionText.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All-time records */}
      {tempDays.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {gpuAllMax > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Monitor className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">GPU Peak</span>
              </div>
              <div className="text-xl font-extrabold text-slate-100 tnum">{Math.round(gpuAllMax)}°C</div>
              <div className="text-[10px] text-slate-600 mt-0.5">
                {todaySummary?.max_temp_c ? `Today: ${Math.round(todaySummary.max_temp_c)}°C` : 'all time'}
              </div>
            </div>
          )}
          {cpuAllMax > 0 && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">CPU Peak</span>
              </div>
              <div className="text-xl font-extrabold text-slate-100 tnum">{Math.round(cpuAllMax)}°C</div>
              <div className="text-[10px] text-slate-600 mt-0.5">
                {todaySummary?.max_cpu_temp_c ? `Today: ${Math.round(todaySummary.max_cpu_temp_c)}°C` : 'all time'}
              </div>
            </div>
          )}
          {todaySummary && (todaySummary.avg_temp_c !== null || todaySummary.avg_cpu_temp_c !== null) && (
            <div className="col-span-2 rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Today's Range</span>
                <div className="flex items-center gap-2 text-[10px]">
                  {gpuTrend === 'up' && <span className="flex items-center gap-0.5 text-rose-400"><TrendingUp className="w-3 h-3" /> GPU</span>}
                  {gpuTrend === 'down' && <span className="flex items-center gap-0.5 text-emerald-400"><TrendingDown className="w-3 h-3" /> GPU</span>}
                  {cpuTrend === 'up' && <span className="flex items-center gap-0.5 text-rose-400"><TrendingUp className="w-3 h-3" /> CPU</span>}
                  {cpuTrend === 'down' && <span className="flex items-center gap-0.5 text-emerald-400"><TrendingDown className="w-3 h-3" /> CPU</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {todaySummary.avg_temp_c !== null && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <Monitor className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-slate-500">GPU</span>
                    </div>
                    <div className="text-sm font-bold text-slate-200 tnum">
                      {todaySummary.min_temp_c !== null ? Math.round(todaySummary.min_temp_c) : '--'}° – {todaySummary.max_temp_c !== null ? Math.round(todaySummary.max_temp_c) : '--'}°
                    </div>
                    <div className="text-[10px] text-slate-600 tnum">avg {todaySummary.avg_temp_c.toFixed(1)}°C</div>
                  </div>
                )}
                {todaySummary.avg_cpu_temp_c !== null && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <Cpu className="w-3 h-3 text-sky-400" />
                      <span className="text-[10px] text-slate-500">CPU</span>
                    </div>
                    <div className="text-sm font-bold text-slate-200 tnum">
                      {todaySummary.min_cpu_temp_c !== null ? Math.round(todaySummary.min_cpu_temp_c) : '--'}° – {todaySummary.max_cpu_temp_c !== null ? Math.round(todaySummary.max_cpu_temp_c) : '--'}°
                    </div>
                    <div className="text-[10px] text-slate-600 tnum">avg {todaySummary.avg_cpu_temp_c.toFixed(1)}°C</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Daily History Tab ── */
function DailyTempTab({ summaries, onSelectDay }: { summaries: DailySummary[]; onSelectDay: (day: string) => void }) {
  const tempDays = summaries.filter((d) => (d.temp_report_count && d.temp_report_count > 0) || (d.cpu_temp_report_count && d.cpu_temp_report_count > 0));

  if (tempDays.length === 0) {
    return (
      <div className="text-center py-12">
        <Thermometer className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No temperature data yet</p>
      </div>
    );
  }

  const allGpuMaxes = tempDays.map((d) => d.max_temp_c ?? 0);
  const allCpuMaxes = tempDays.map((d) => d.max_cpu_temp_c ?? 0);
  const overallMax = Math.max(...allGpuMaxes, ...allCpuMaxes, 0);
  const overallMin = Math.min(...tempDays.flatMap((d) => [d.min_temp_c ?? 999, d.min_cpu_temp_c ?? 999]).filter((v) => v < 999), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Days</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{tempDays.length}</div>
          <div className="text-[10px] text-slate-600 mt-0.5">with data</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Peak</span>
          </div>
          <div className="text-xl font-extrabold text-slate-100 tnum">{Math.round(overallMax)}°C</div>
          <div className="text-[10px] text-slate-600 mt-0.5">any sensor</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {tempDays.map((d) => {
          const gpuMax = d.max_temp_c;
          const cpuMax = d.max_cpu_temp_c;
          const dominantMax = Math.max(gpuMax ?? 0, cpuMax ?? 0);
          const dayChip = dominantMax > 0 ? classifyTemp(dominantMax) : null;

          return (
            <button
              key={d.day}
              onClick={() => onSelectDay(d.day)}
              className="w-full rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    dayChip?.level === 'boiling' ? 'bg-red-500/10 border-red-500/20'
                    : dayChip?.level === 'hot' ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-sky-500/10 border-sky-500/20'
                  }`}>
                    {dayChip ? <dayChip.icon className={`w-4 h-4 ${dayChip.color}`} /> : <Thermometer className="w-4 h-4 text-slate-500" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-200">{formatDayLabel(d.day)}</div>
                    <div className="text-[11px] text-slate-500 tnum">
                      {(d.temp_report_count ?? 0) + (d.cpu_temp_report_count ?? 0)} readings
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  {gpuMax !== null && (
                    <div className="flex items-center justify-end gap-1 text-[11px] text-slate-300 tnum">
                      <Monitor className="w-3 h-3 text-amber-400" />
                      <span>{d.min_temp_c !== null ? Math.round(d.min_temp_c) : '--'}° – {Math.round(gpuMax)}°</span>
                    </div>
                  )}
                  {cpuMax !== null && (
                    <div className="flex items-center justify-end gap-1 text-[11px] text-slate-300 tnum">
                      <Cpu className="w-3 h-3 text-sky-400" />
                      <span>{d.min_cpu_temp_c !== null ? Math.round(d.min_cpu_temp_c) : '--'}° – {Math.round(cpuMax)}°</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Dual range bar */}
              {overallMax > overallMin && (
                <div className="space-y-1">
                  {gpuMax !== null && d.min_temp_c !== null && (
                    <div className="relative h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="absolute h-full rounded-full bg-gradient-to-r from-sky-500/40 to-amber-500/60"
                        style={{
                          left: `${Math.max(0, ((d.min_temp_c - overallMin) / (overallMax - overallMin)) * 100)}%`,
                          width: `${Math.max(2, ((gpuMax - d.min_temp_c) / (overallMax - overallMin)) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  {cpuMax !== null && d.min_cpu_temp_c !== null && (
                    <div className="relative h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="absolute h-full rounded-full bg-gradient-to-r from-sky-500/40 to-sky-400/60"
                        style={{
                          left: `${Math.max(0, ((d.min_cpu_temp_c - overallMin) / (overallMax - overallMin)) * 100)}%`,
                          width: `${Math.max(2, ((cpuMax - d.min_cpu_temp_c) / (overallMax - overallMin)) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end mt-1 text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">Tap for details →</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Day Detail: temperature changes only ── */
function DayTempView({ day, reports, loading }: { day: string; reports: BatteryReport[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="px-5 py-3 space-y-2">
        {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-white/[0.03] rounded-lg animate-pulse" />)}
      </div>
    );
  }
  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Thermometer className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No reports for this day</p>
      </div>
    );
  }

  const tempReports = reports.filter((r) => r.temperature_c !== null || r.cpu_temperature_c !== null);
  if (tempReports.length === 0) {
    return (
      <div className="text-center py-12">
        <Snowflake className="w-10 h-10 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No temperature data this day</p>
      </div>
    );
  }

  // Chronological order for change detection
  const chrono = [...tempReports].reverse();
  const roundGpu = (r: BatteryReport) => r.temperature_c !== null ? Math.round(r.temperature_c) : null;
  const roundCpu = (r: BatteryReport) => r.cpu_temperature_c !== null ? Math.round(r.cpu_temperature_c) : null;

  // Keep only rows where GPU or CPU temp changed from the previous
  const significant = chrono.filter((r, i) => {
    if (i === 0) return true;
    const prev = chrono[i - 1];
    return roundGpu(r) !== roundGpu(prev) || roundCpu(r) !== roundCpu(prev);
  }).reverse(); // back to newest-first for display

  const gpuTemps = tempReports.map((r) => r.temperature_c).filter((t): t is number => t !== null);
  const cpuTemps = tempReports.map((r) => r.cpu_temperature_c).filter((t): t is number => t !== null);

  return (
    <div className="px-5 py-3 space-y-3">
      {/* Day summary stats */}
      <div className="grid grid-cols-2 gap-2">
        {gpuTemps.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Monitor className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">GPU</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-sm font-bold text-sky-400 tnum">{Math.min(...gpuTemps)}°</div>
                <div className="text-[9px] text-slate-600">Low</div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-200 tnum">{Math.round(gpuTemps.reduce((a, b) => a + b, 0) / gpuTemps.length)}°</div>
                <div className="text-[9px] text-slate-600">Avg</div>
              </div>
              <div>
                <div className="text-sm font-bold text-red-400 tnum">{Math.max(...gpuTemps)}°</div>
                <div className="text-[9px] text-slate-600">High</div>
              </div>
            </div>
          </div>
        )}
        {cpuTemps.length > 0 && (
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase">CPU</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-sm font-bold text-sky-400 tnum">{Math.min(...cpuTemps)}°</div>
                <div className="text-[9px] text-slate-600">Low</div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-200 tnum">{Math.round(cpuTemps.reduce((a, b) => a + b, 0) / cpuTemps.length)}°</div>
                <div className="text-[9px] text-slate-600">Avg</div>
              </div>
              <div>
                <div className="text-sm font-bold text-red-400 tnum">{Math.max(...cpuTemps)}°</div>
                <div className="text-[9px] text-slate-600">High</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500 px-1">
        {significant.length} temperature changes from {tempReports.length} readings.
      </p>

      {/* Timeline */}
      <div className="space-y-1.5">
        {significant.map((r, i) => {
          const prev = significant[i + 1];
          const gpuDelta = prev && r.temperature_c !== null && prev.temperature_c !== null ? Math.round(r.temperature_c - prev.temperature_c) : null;
          const cpuDelta = prev && r.cpu_temperature_c !== null && prev.cpu_temperature_c !== null ? Math.round(r.cpu_temperature_c - prev.cpu_temperature_c) : null;
          const gpuClass = r.temperature_c !== null ? classifyTemp(r.temperature_c) : null;
          const cpuClass = r.cpu_temperature_c !== null ? classifyTemp(r.cpu_temperature_c) : null;
          const dominantClass = gpuClass ?? cpuClass;

          return (
            <div key={r.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 bg-white/[0.04] border border-white/[0.06]">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                dominantClass?.level === 'boiling' ? 'bg-red-500/10 border-red-500/20'
                : dominantClass?.level === 'hot' ? 'bg-amber-500/10 border-amber-500/20'
                : 'bg-sky-500/10 border-sky-500/20'
              }`}>
                {dominantClass ? <dominantClass.icon className={`w-4 h-4 ${dominantClass.color}`} /> : <Thermometer className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                {/* GPU row */}
                {r.temperature_c !== null && gpuClass && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Monitor className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className={`text-sm font-bold tnum ${gpuClass.color}`}>{Math.round(r.temperature_c)}°C</span>
                    <span className={`text-[10px] font-semibold ${gpuClass.color} bg-white/[0.04] px-1.5 py-0.5 rounded`}>{gpuClass.label}</span>
                    {gpuDelta !== null && gpuDelta !== 0 && (
                      <span className={`text-[10px] font-bold tnum ${gpuDelta > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {gpuDelta > 0 ? '+' : ''}{gpuDelta}°
                      </span>
                    )}
                  </div>
                )}
                {/* CPU row */}
                {r.cpu_temperature_c !== null && cpuClass && (
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <Cpu className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className={`text-sm font-bold tnum ${cpuClass.color}`}>{Math.round(r.cpu_temperature_c)}°C</span>
                    <span className={`text-[10px] font-semibold ${cpuClass.color} bg-white/[0.04] px-1.5 py-0.5 rounded`}>{cpuClass.label}</span>
                    {cpuDelta !== null && cpuDelta !== 0 && (
                      <span className={`text-[10px] font-bold tnum ${cpuDelta > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {cpuDelta > 0 ? '+' : ''}{cpuDelta}°
                      </span>
                    )}
                  </div>
                )}
                {/* Time + battery */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(r.reported_at)}</span>
                  <span className="text-slate-700">·</span>
                  {r.is_charging ? (
                    <><BatteryCharging className="w-3 h-3 text-emerald-400" /><span className="tnum">{r.battery_percent}%</span></>
                  ) : (
                    <><Zap className="w-3 h-3 text-rose-400" /><span className="tnum">{r.battery_percent}%</span></>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
