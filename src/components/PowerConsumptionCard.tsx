import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, TrendingUp, Calendar, CalendarDays, Settings, X, Clock, Plug, PlugZap, Cpu, Monitor, RefreshCw, Smartphone, Wifi, WifiOff, Cpu as CpuIcon, Battery, Hourglass, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { istDateString, istDayStart } from '@/lib/utils';

type Props = {
  batteryPercent: number | null;
  isCharging: boolean;
  siteUptimeMs: number;
};

type CycleRow = {
  cycle_number: number;
  batch: string;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
};

// Auto-detect device capability for page optimization
const DEVICE_TIER = (() => {
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
  if (cores >= 8 && mem >= 8) return 'high';
  if (cores >= 4 && mem >= 4) return 'mid';
  return 'low';
})();

// Animation interval — slower on low-end devices
const REFRESH_MS = DEVICE_TIER === 'low' ? 30000 : 10000;

const EFFICIENCY_FACTOR = 1.15;
const SLAB_THRESHOLD = 200;
const SLAB_WARNING = 225;

// 22.9W measured baseline for HP Victus i5-13420H + RTX 2050
const BASELINE_WATTS = 22.9;
// Additional draw when MuMu emulator is actively running
const EMULATOR_EXTRA_LOW = 38;   // 55W total
const EMULATOR_EXTRA_HIGH = 73;  // 90W total

const RATE_PRESETS = [
  { label: '₹5.13', value: 5.13, tag: 'Actual' },
  { label: '₹5.50', value: 5.5, tag: 'Avg' },
  { label: '₹6.00', value: 6.0, tag: 'Buffer' },
];

function formatInr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wallWatts(watts: number): number {
  return watts * EFFICIENCY_FACTOR;
}

// Total watts: baseline + emulator extra when active
function activeWattsLow(): number { return wallWatts(BASELINE_WATTS + EMULATOR_EXTRA_LOW); }
function activeWattsHigh(): number { return wallWatts(BASELINE_WATTS + EMULATOR_EXTRA_HIGH); }
function idleWatts(): number { return wallWatts(BASELINE_WATTS); }

type DeviceStatus = {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  activeBatch: string | null;
  activeBatchDevices: number;
};

type MonthRecord = {
  month: string;       // "2026-10"
  label: string;       // "Oct 2026"
  unitsLow: number;
  unitsHigh: number;
  costLow: number;
  costHigh: number;
  daysInMonth: number;
};

type PowerData = {
  activeHours: number;
  idleHours: number;
  powerCutHours: number;
  cycleCount: number;
  todayUnitsLow: number;
  todayUnitsHigh: number;
  projectedDailyActiveHours: number;
  projectedDailyIdleHours: number;
  projectedDailyPowerCutHours: number;
  dailyUnitsLow: number;
  dailyUnitsHigh: number;
  monthlyUnitsLow: number;
  monthlyUnitsHigh: number;
  chargingHours: number;
  totalSpanHours: number;
  deviceStatus: DeviceStatus;
  offlineDeviceIds: string[];
  monthRecords: MonthRecord[];
  currentMonthRunningLow: number;
  currentMonthRunningHigh: number;
  daysElapsedInMonth: number;
};

async function fetchPowerData(rate: number): Promise<PowerData> {
  const todayStartIso = istDayStart();

  // Fetch cycle history for current month (for month-by-month breakdown)
  const todayIst = istDateString();
  const monthStartIso = `${todayIst.slice(0, 7)}-01T00:00:00+05:30`;

  const [cyclesTodayRes, cyclesMonthRes, batteryRes, devicesRes] = await Promise.all([
    supabase
      .from('cycle_history')
      .select('cycle_number,batch,duration_seconds,started_at,ended_at')
      .gte('started_at', todayStartIso)
      .order('started_at', { ascending: true }),
    supabase
      .from('cycle_history')
      .select('cycle_number,batch,duration_seconds,started_at,ended_at')
      .gte('started_at', monthStartIso)
      .order('started_at', { ascending: true }),
    supabase
      .from('battery_reports')
      .select('is_charging,reported_at')
      .eq('device_id', 'laptop')
      .gte('reported_at', todayStartIso)
      .order('reported_at', { ascending: true }),
    supabase
      .from('devices')
      .select('device_id,display_name,batch,is_online,batch_active,last_seen_at')
      .order('batch', { ascending: true }),
  ]);

  const cyclesToday = (cyclesTodayRes.data ?? []) as CycleRow[];
  const cyclesMonth = (cyclesMonthRes.data ?? []) as CycleRow[];
  const batteryReports = (batteryRes.data ?? []) as { is_charging: boolean; reported_at: string }[];
  const rawDeviceRows = (devicesRes.data ?? []) as { device_id: string; display_name: string; batch: string; is_online: boolean; batch_active: boolean; last_seen_at: string | null }[];

  // Recalculate is_online from last_seen_at — the DB column can be stale
  const ONLINE_THRESHOLD_MIN = 2;
  const nowMs = Date.now();
  const deviceRows = rawDeviceRows.map((d) => ({
    ...d,
    is_online:
      d.last_seen_at !== null &&
      nowMs - new Date(d.last_seen_at).getTime() < ONLINE_THRESHOLD_MIN * 60 * 1000,
  }));

  // Device status
  const totalDevices = deviceRows.length;
  const onlineDevices = deviceRows.filter((d) => d.is_online).length;
  const offlineDevices = deviceRows.filter((d) => !d.is_online).length;
  const activeBatchRows = deviceRows.filter((d) => d.batch_active);
  const activeBatch = activeBatchRows.length > 0 ? activeBatchRows[0].batch : null;
  const activeBatchDevices = activeBatchRows.length;
  const offlineDeviceIds = deviceRows.filter((d) => !d.is_online).map((d) => d.display_name || d.device_id);
  const deviceStatus: DeviceStatus = { totalDevices, onlineDevices, offlineDevices, activeBatch, activeBatchDevices };

  // Today's active rotation time
  const activeSeconds = cyclesToday.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
  const activeHours = activeSeconds / 3600;

  // Power-cut time from battery reports
  const now = Date.now();
  let powerCutMs = 0;
  let chargingMs = 0;
  let totalSpanMs = 0;

  if (batteryReports.length > 0) {
    for (let i = 0; i < batteryReports.length; i++) {
      const curr = batteryReports[i];
      const next = batteryReports[i + 1];
      const currMs = new Date(curr.reported_at).getTime();
      const nextMs = next ? new Date(next.reported_at).getTime() : now;
      const intervalMs = Math.min(nextMs - currMs, 10 * 60 * 1000);
      if (intervalMs <= 0) continue;
      if (curr.is_charging) chargingMs += intervalMs;
      else powerCutMs += intervalMs;
    }
    const firstMs = new Date(batteryReports[0].reported_at).getTime();
    totalSpanMs = now - firstMs;
  }

  const powerCutHours = powerCutMs / 3600000;
  const chargingHours = chargingMs / 3600000;
  const totalSpanHours = totalSpanMs / 3600000;
  const idleHours = Math.max(0, totalSpanHours - activeHours - powerCutHours);

  // Today's actual units
  const todayUnitsLow = (activeWattsLow() * activeHours + idleWatts() * idleHours) / 1000;
  const todayUnitsHigh = (activeWattsHigh() * activeHours + idleWatts() * idleHours) / 1000;

  // Project to 24h
  const scale = totalSpanHours > 0 && totalSpanHours < 23.5 ? 24 / totalSpanHours : 1;
  const projectedDailyActiveHours = activeHours * scale;
  const projectedDailyIdleHours = Math.max(0, 24 - projectedDailyActiveHours - powerCutHours * scale);
  const projectedDailyPowerCutHours = powerCutHours * scale;

  const dailyUnitsLow = (activeWattsLow() * projectedDailyActiveHours + idleWatts() * projectedDailyIdleHours) / 1000;
  const dailyUnitsHigh = (activeWattsHigh() * projectedDailyActiveHours + idleWatts() * projectedDailyIdleHours) / 1000;

  const monthlyUnitsLow = dailyUnitsLow * 30;
  const monthlyUnitsHigh = dailyUnitsHigh * 30;

  // Build month-by-month records from cycle history
  // Group cycles by month, estimate active/idle per month
  const monthMap = new Map<string, { activeSeconds: number }>();
  for (const c of cyclesMonth) {
    const d = new Date(c.started_at);
    const key = d.toLocaleString('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Kolkata' }).replace('-', '-');
    const existing = monthMap.get(key) || { activeSeconds: 0 };
    existing.activeSeconds += c.duration_seconds || 0;
    monthMap.set(key, existing);
  }

  const monthLabels: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };

  const monthRecords: MonthRecord[] = [];
  let currentMonthRunningLow = 0;
  let currentMonthRunningHigh = 0;
  let daysElapsedInMonth = new Date().toLocaleString('en-US', { day: 'numeric', timeZone: 'Asia/Kolkata' }) as unknown as number;
  daysElapsedInMonth = parseInt(String(daysElapsedInMonth));

  const currentMonthKey = istDateString().slice(0, 7);

  for (const [key, data] of monthMap) {
    const [yearStr, monthStr] = key.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const label = `${monthLabels[monthStr] || monthStr} ${year}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrentMonth = key === currentMonthKey;
    const days = isCurrentMonth ? daysElapsedInMonth : daysInMonth;

    const mActiveHours = data.activeSeconds / 3600;
    // Estimate idle: total hours in period - active - 5% power cut allowance
    const totalHours = days * 24;
    const mPowerCutHours = totalHours * 0.03; // ~3% power cut estimate for past months
    const mIdleHours = Math.max(0, totalHours - mActiveHours - mPowerCutHours);

    const mUnitsLow = (activeWattsLow() * mActiveHours + idleWatts() * mIdleHours) / 1000;
    const mUnitsHigh = (activeWattsHigh() * mActiveHours + idleWatts() * mIdleHours) / 1000;

    monthRecords.push({
      month: key,
      label,
      unitsLow: mUnitsLow,
      unitsHigh: mUnitsHigh,
      costLow: mUnitsLow * rate,
      costHigh: mUnitsHigh * rate,
      daysInMonth: days,
    });

    if (isCurrentMonth) {
      currentMonthRunningLow = mUnitsLow;
      currentMonthRunningHigh = mUnitsHigh;
    }
  }

  // Sort month records newest first
  monthRecords.sort((a, b) => b.month.localeCompare(a.month));

  // If no cycles this month but we have today's data, use today's as current month running
  if (currentMonthRunningLow === 0 && todayUnitsLow > 0) {
    currentMonthRunningLow = todayUnitsLow;
    currentMonthRunningHigh = todayUnitsHigh;
  }

  return {
    activeHours,
    idleHours,
    powerCutHours,
    cycleCount: cyclesToday.length,
    todayUnitsLow,
    todayUnitsHigh,
    projectedDailyActiveHours,
    projectedDailyIdleHours,
    projectedDailyPowerCutHours,
    dailyUnitsLow,
    dailyUnitsHigh,
    monthlyUnitsLow,
    monthlyUnitsHigh,
    chargingHours,
    totalSpanHours,
    deviceStatus,
    offlineDeviceIds,
    monthRecords,
    currentMonthRunningLow,
    currentMonthRunningHigh,
    daysElapsedInMonth,
  };
}

function currentWattageEstimate(charging: boolean, percent: number | null): number {
  if (!charging) return 0;
  if (percent === null) return wallWatts(45);
  if (percent < 50) return wallWatts(80);
  if (percent < 80) return wallWatts(35);
  return wallWatts(BASELINE_WATTS);
}

type BatteryReportRow = {
  battery_percent: number;
  is_charging: boolean;
  reported_at: string;
};

type DrainRates = {
  activeRate: number | null;
  idleRate: number | null;
  blendedRate: number | null;
};

const FALLBACK_ACTIVE_RATE = 28; // %/hr — emulator running (90W draw on 70Wh battery ~ 28%/hr)
const FALLBACK_IDLE_RATE = 8;   // %/hr — baseline only (26W draw on 70Wh battery ~ 8%/hr)

function calculateDrainRates(reports: BatteryReportRow[], cycles: CycleRow[]): DrainRates {
  // reports are ordered DESC (newest first)
  // We analyze ALL on-battery (power-off) segments from history to get
  // the most accurate drain rate possible.
  type Segment = { rate: number; weight: number };
  const activeSegments: Segment[] = [];
  const idleSegments: Segment[] = [];

  // Pre-compute cycle time ranges as sorted array for binary search
  const cycleRanges = cycles
    .map(c => ({ start: new Date(c.started_at).getTime(), end: new Date(c.ended_at ?? c.started_at).getTime() + 60000 }))
    .sort((a, b) => a.start - b.start);

  function isDuringCycle(ms: number): boolean {
    // Binary search for efficiency with large cycle counts
    let lo = 0, hi = cycleRanges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ms > cycleRanges[mid].end) lo = mid + 1;
      else if (ms < cycleRanges[mid].start) hi = mid - 1;
      else return true;
    }
    return false;
  }

  // Walk through reports (DESC = newest first), group consecutive
  // non-charging reports into drain segments.
  // When we hit a charging report, the segment ends — compute its rate.
  let segStart: BatteryReportRow | null = null;
  let segEnd: BatteryReportRow | null = null;

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    if (r.is_charging) {
      // Close current segment if we have at least 2 data points
      if (segStart && segEnd && segStart !== segEnd) {
        const elapsedMs = new Date(segStart.reported_at).getTime() - new Date(segEnd.reported_at).getTime();
        const dropped = segEnd.battery_percent - segStart.battery_percent;
        if (elapsedMs > 30000 && dropped > 0) {
          const segRate = dropped / (elapsedMs / 3600000);
          const midMs = (new Date(segStart.reported_at).getTime() + new Date(segEnd.reported_at).getTime()) / 2;
          if (isDuringCycle(midMs)) {
            activeSegments.push({ rate: segRate, weight: elapsedMs });
          } else {
            idleSegments.push({ rate: segRate, weight: elapsedMs });
          }
        }
      }
      segStart = null;
      segEnd = null;
    } else {
      // On battery — build segment (segStart = newest, segEnd = oldest in this run)
      if (!segStart) segStart = r;
      segEnd = r;
    }
  }
  // Handle trailing segment (currently on battery)
  if (segStart && segEnd && segStart !== segEnd) {
    const elapsedMs = new Date(segStart.reported_at).getTime() - new Date(segEnd.reported_at).getTime();
    const dropped = segEnd.battery_percent - segStart.battery_percent;
    if (elapsedMs > 30000 && dropped > 0) {
      const segRate = dropped / (elapsedMs / 3600000);
      const midMs = (new Date(segStart.reported_at).getTime() + new Date(segEnd.reported_at).getTime()) / 2;
      if (isDuringCycle(midMs)) {
        activeSegments.push({ rate: segRate, weight: elapsedMs });
      } else {
        idleSegments.push({ rate: segRate, weight: elapsedMs });
      }
    }
  }

  function weightedAvg(segs: Segment[]): number | null {
    if (segs.length === 0) return null;
    const totalWeight = segs.reduce((s, seg) => s + seg.weight, 0);
    return segs.reduce((s, seg) => s + seg.rate * seg.weight, 0) / totalWeight;
  }

  const activeRate = weightedAvg(activeSegments);
  const idleRate = weightedAvg(idleSegments);
  const allSegs = [...activeSegments, ...idleSegments];
  const blendedRate = weightedAvg(allSegs);

  return { activeRate, idleRate, blendedRate };
}

function formatBackup(minutes: number): string {
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

export function PowerConsumptionCard({ batteryPercent, isCharging, siteUptimeMs }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [rate, setRate] = useState(() => {
    const stored = localStorage.getItem('electricity-rate');
    return stored ? parseFloat(stored) : 5.5;
  });
  const [customRate, setCustomRate] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [powerData, setPowerData] = useState<PowerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [batteryHistory, setBatteryHistory] = useState<BatteryReportRow[]>([]);
  const [drainRates, setDrainRates] = useState<DrainRates | null>(null);
  const [cycleHistoryForDrain, setCycleHistoryForDrain] = useState<CycleRow[]>([]);
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [backupEndTime, setBackupEndTime] = useState<number | null>(null);
  const [backupMinutes, setBackupMinutes] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastCalcPercentRef = useRef<number | null>(null);
  const lastCycleStateRef = useRef<boolean | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPowerData(rate);
      setPowerData(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [rate]);

  useEffect(() => {
    if (!expanded) return;
    fetchData();
    const interval = setInterval(fetchData, REFRESH_MS);
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      clearInterval(interval);
    };
  }, [expanded, fetchData]);

  // Fetch battery history + cycle history always — needed for drain rate even while charging
  useEffect(() => {
    let cancelled = false;
    const fetchBatteryAndCycles = async () => {
      const [batRes, cycRes, batchRes] = await Promise.all([
        supabase
          .from('battery_reports')
          .select('battery_percent,is_charging,reported_at')
          .eq('device_id', 'laptop')
          .order('reported_at', { ascending: false })
          .limit(5000),
        supabase
          .from('cycle_history')
          .select('cycle_number,batch,duration_seconds,started_at,ended_at')
          .order('started_at', { ascending: false })
          .limit(500),
        supabase
          .from('cycle_batches')
          .select('batch,started_at')
          .eq('is_current', true)
          .maybeSingle(),
      ]);
      if (!cancelled && batRes.data) {
        setBatteryHistory(batRes.data as BatteryReportRow[]);
      }
      if (!cancelled && cycRes.data) {
        setCycleHistoryForDrain(cycRes.data as CycleRow[]);
      }
      if (!cancelled && batchRes.data) {
        const startedAt = new Date(batchRes.data.started_at).getTime();
        // Cycle is considered running if current batch started within last 10 minutes
        setIsCycleRunning(Date.now() - startedAt < 10 * 60 * 1000);
      }
    };
    fetchBatteryAndCycles();
    const interval = setInterval(fetchBatteryAndCycles, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Calculate drain rates and set backup time
  useEffect(() => {
    if (batteryPercent === null) {
      setBackupEndTime(null);
      setBackupMinutes(null);
      setDrainRates(null);
      lastCalcPercentRef.current = null;
      lastCycleStateRef.current = null;
      return;
    }
    const rates = calculateDrainRates(batteryHistory, cycleHistoryForDrain);
    setDrainRates(rates);

    // Pick the right rate: if a cycle is running, use active drain; otherwise idle
    // Prefer measured rates from historical on-battery data.
    // Only fall back to spec estimates if no measured data exists at all.
    const measuredRate = isCycleRunning
      ? (rates.activeRate ?? rates.blendedRate)
      : (rates.idleRate ?? rates.blendedRate);
    const applicableRate = measuredRate ?? (isCycleRunning ? FALLBACK_ACTIVE_RATE : FALLBACK_IDLE_RATE);
    const isMeasured = measuredRate !== null;

    if (!applicableRate) {
      setBackupEndTime(null);
      setBackupMinutes(null);
      lastCalcPercentRef.current = null;
      lastCycleStateRef.current = null;
      return;
    }

    if (isCharging) {
      // While charging: static estimate based on the current drain rate (no countdown)
      setBackupEndTime(null);
      const minutes = (batteryPercent / applicableRate) * 60;
      setBackupMinutes(minutes);
      lastCalcPercentRef.current = null;
      lastCycleStateRef.current = null;
    } else {
      // On battery: recalculate when battery percent changes OR cycle state changes
      if (lastCalcPercentRef.current !== batteryPercent || lastCycleStateRef.current !== isCycleRunning) {
        lastCalcPercentRef.current = batteryPercent;
        lastCycleStateRef.current = isCycleRunning;
        const minutes = (batteryPercent / applicableRate) * 60;
        setBackupEndTime(Date.now() + minutes * 60 * 1000);
      }
    }
  }, [batteryPercent, batteryHistory, cycleHistoryForDrain, isCharging, isCycleRunning]);

  // Live countdown — tick every second (only when on battery)
  useEffect(() => {
    if (!backupEndTime) return;
    const tick = () => {
      const remaining = (backupEndTime - Date.now()) / 60000;
      setBackupMinutes(remaining > 0 ? remaining : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [backupEndTime]);

  const drainRatePerHour = isCycleRunning
    ? (drainRates?.activeRate ?? drainRates?.blendedRate ?? FALLBACK_ACTIVE_RATE)
    : (drainRates?.idleRate ?? drainRates?.blendedRate ?? FALLBACK_IDLE_RATE);
  const currentWatts = currentWattageEstimate(isCharging, batteryPercent);
  const sessionHours = siteUptimeMs / 3600000;
  const sessionUnits = (currentWatts * sessionHours) / 1000;
  const sessionCost = sessionUnits * rate;

  const pd = powerData;
  const todayCostLow = (pd?.todayUnitsLow ?? 0) * rate;
  const todayCostHigh = (pd?.todayUnitsHigh ?? 0) * rate;

  const dailyCostLow = (pd?.dailyUnitsLow ?? 0) * rate;
  const dailyCostHigh = (pd?.dailyUnitsHigh ?? 0) * rate;
  const dailyMidCost = (dailyCostLow + dailyCostHigh) / 2;

  const monthlyCostLow = (pd?.monthlyUnitsLow ?? 0) * rate;
  const monthlyCostHigh = (pd?.monthlyUnitsHigh ?? 0) * rate;
  const monthlyMidCost = (monthlyCostLow + monthlyCostHigh) / 2;
  const monthlyMidUnits = ((pd?.monthlyUnitsLow ?? 0) + (pd?.monthlyUnitsHigh ?? 0)) / 2;

  // Current month running cost (actual data so far this month)
  const currentMonthCostLow = (pd?.currentMonthRunningLow ?? 0) * rate;
  const currentMonthCostHigh = (pd?.currentMonthRunningHigh ?? 0) * rate;
  const currentMonthCostMid = (currentMonthCostLow + currentMonthCostHigh) / 2;
  const currentMonthUnitsMid = ((pd?.currentMonthRunningLow ?? 0) + (pd?.currentMonthRunningHigh ?? 0)) / 2;

  const slabPercent = Math.min(100, (monthlyMidUnits / SLAB_WARNING) * 100);
  const slabColor = monthlyMidUnits < SLAB_THRESHOLD
    ? 'from-emerald-500 to-teal-400'
    : monthlyMidUnits < SLAB_WARNING
      ? 'from-amber-500 to-orange-400'
      : 'from-rose-500 to-red-400';
  const slabTextColor = monthlyMidUnits < SLAB_THRESHOLD
    ? 'text-emerald-400'
    : monthlyMidUnits < SLAB_WARNING
      ? 'text-amber-400'
      : 'text-rose-400';
  const slabLabel = monthlyMidUnits < SLAB_THRESHOLD
    ? 'Below slab threshold'
    : monthlyMidUnits < SLAB_WARNING
      ? 'Approaching slab limit'
      : 'Above slab threshold';

  const handleRateSelect = (value: number) => {
    setRate(value);
    localStorage.setItem('electricity-rate', String(value));
    setCustomRate('');
  };

  const handleCustomRate = () => {
    const parsed = parseFloat(customRate);
    if (!isNaN(parsed) && parsed > 0 && parsed < 20) {
      setRate(parsed);
      localStorage.setItem('electricity-rate', String(parsed));
    }
  };

  const activeRatePreset = RATE_PRESETS.find((r) => r.value === rate);
  const isCustom = !activeRatePreset;

  return (
    <div className="relative" ref={cardRef}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] transition-all hover:bg-white/[0.08] hover:scale-105"
        title="Power consumption & cost"
      >
        <Zap className={`w-3 h-3 ${isCharging ? 'text-amber-400' : 'text-rose-400'}`} />
        <span className="text-[11px] font-semibold text-slate-100 tnum">
          {isCharging ? `${currentWatts.toFixed(1)}W` : (backupMinutes !== null ? formatBackup(backupMinutes) : '--')}
        </span>
        {isCharging && backupMinutes !== null && (
          <span className="text-[9px] sm:text-[10px] font-medium text-rose-300/70 tnum flex items-center gap-0.5">
            <Hourglass className="w-2.5 h-2.5" />
            {formatBackup(backupMinutes)}
          </span>
        )}
        <span className="text-[9px] sm:text-[10px] font-medium text-amber-300/70">
          {formatInr(dailyMidCost)}/day
        </span>
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[27rem] bg-[#0b0f18] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 z-40 animate-fade-in overflow-hidden max-h-[88vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] sticky top-0 bg-[#0b0f18] z-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/80 to-orange-600/80 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Power Consumption</h3>
                <p className="text-[10px] text-slate-500">
                  {DEVICE_TIER === 'high' ? 'HP Victus i5-13420H · RTX 2050' : 'Auto-detected'} · 22.9W baseline
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchData()}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
                title="Rate settings"
              >
                {showSettings ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Settings */}
          {showSettings && (
            <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-2">
                  Electricity Rate (₹/kWh)
                </label>
                <div className="flex gap-1.5">
                  {RATE_PRESETS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => handleRateSelect(r.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                        rate === r.value
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                      }`}
                    >
                      {r.label}
                      <span className="block text-[9px] font-normal opacity-60">{r.tag}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="20"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomRate()}
                  placeholder={isCustom ? `Custom: ₹${rate}` : 'Custom rate'}
                  className="flex-1 px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/30 tnum"
                />
                <button
                  onClick={handleCustomRate}
                  className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
                >
                  Set
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className="w-1 h-1 rounded-full bg-amber-400/60" />
                <span>Baseline: {BASELINE_WATTS}W · Efficiency: {EFFICIENCY_FACTOR}x · Device tier: {DEVICE_TIER}</span>
              </div>
            </div>
          )}

          {/* Power status pill */}
          <div className="px-4 pt-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
              isCharging
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-rose-500/10 border-rose-500/20'
            }`}>
              {isCharging ? <PlugZap className="w-4 h-4 text-emerald-400" /> : <Plug className="w-4 h-4 text-rose-400" />}
              <span className={`text-xs font-semibold ${isCharging ? 'text-emerald-300' : 'text-rose-300'}`}>
                {isCharging ? 'Charger connected — drawing wall power' : 'Power cut — running on battery'}
              </span>
              {backupMinutes !== null && (
                <span className={`ml-auto text-xs font-bold tnum flex items-center gap-1 ${isCharging ? 'text-amber-300/80' : 'text-rose-300'}`}>
                  <Hourglass className="w-3.5 h-3.5" />
                  {formatBackup(backupMinutes)}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 space-y-3">
            {loading && !pd && (
              <div className="text-center py-2 text-xs text-slate-500">Loading power data…</div>
            )}

            {/* Current draw / Battery backup */}
            <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                {isCharging
                  ? <Zap className="w-3.5 h-3.5 text-amber-400" />
                  : <Battery className="w-3.5 h-3.5 text-rose-400" />}
                <span className="text-xs font-medium text-slate-300">
                  {isCharging ? 'Current Draw' : 'Battery Backup'}
                </span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold tnum ${isCharging ? 'text-amber-300' : 'text-rose-300'}`}>
                  {isCharging
                    ? `${currentWatts.toFixed(1)}W`
                    : (backupMinutes !== null ? formatBackup(backupMinutes) : '--')}
                </span>
                <span className="text-[10px] text-slate-500 ml-1.5">
                  {isCharging ? 'wall' : 'left'}
                </span>
              </div>
            </div>

            {/* Battery Backup detail card — always shown when we have battery data */}
            {batteryPercent !== null && (
              <div className={`bg-gradient-to-br ${isCharging ? 'from-amber-500/10 to-orange-600/5 border-amber-500/15' : 'from-rose-500/10 to-orange-600/5 border-rose-500/15'} border rounded-xl px-4 py-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <Hourglass className={`w-4 h-4 ${isCharging ? 'text-amber-400' : 'text-rose-400'}`} />
                  <span className="text-xs font-medium text-slate-300">
                    {isCharging ? 'Backup if power cuts now' : 'Backup Estimate'}
                  </span>
                  {isCycleRunning && (
                    <span className="text-[9px] font-semibold text-orange-300 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full">
                      Cycle running
                    </span>
                  )}
                  {drainRatePerHour !== null && (
                    <span className="ml-auto text-[10px] text-slate-500 tnum flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-rose-400/70" />
                      {drainRatePerHour.toFixed(1)}%/hr
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold tnum ${isCharging ? 'text-amber-300' : 'text-rose-300'}`}>
                    {backupMinutes !== null ? formatBackup(backupMinutes) : 'Measuring...'}
                  </span>
                  <span className="text-[10px] text-slate-500 tnum">
                    {batteryPercent !== null ? `${batteryPercent}% remaining` : ''}
                  </span>
                </div>
                <div className="mt-2 w-full h-2 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${isCharging ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-orange-400'} rounded-full transition-all duration-1000 ease-linear`}
                    style={{ width: `${Math.min(100, Math.max(0, batteryPercent ?? 0))}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {drainRates && (drainRates.activeRate || drainRates.idleRate)
                    ? <span>{isCycleRunning ? 'Active drain' : 'Idle drain'}: {drainRatePerHour?.toFixed(1)}%/hr {isCycleRunning ? '(emulator running)' : '(between cycles)'} · measured from history</span>
                    : <span>{isCycleRunning ? 'Active drain' : 'Idle drain'}: {drainRatePerHour?.toFixed(1)}%/hr · {isCycleRunning ? '(emulator running)' : '(between cycles)'} · estimated from power draw</span>
                  }
                </div>
              </div>
            )}

            {/* Current month running total — the headline number */}
            {pd && (
              <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-amber-500/15 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-slate-300">This Month (running)</span>
                  <span className="ml-auto text-[10px] text-slate-500 tnum">Day {pd.daysElapsedInMonth}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-300 tnum">
                    {formatInr(currentMonthCostMid)}
                  </span>
                  <span className="text-[10px] text-slate-500 tnum">
                    ({currentMonthCostLow.toFixed(0)}–{currentMonthCostHigh.toFixed(0)})
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 tnum">
                  {currentMonthUnitsMid.toFixed(1)} kWh consumed · {currentMonthUnitsMid.toFixed(1)} / {SLAB_WARNING} units slab
                </div>
              </div>
            )}

            {/* Device status — live/offline */}
            {pd && pd.deviceStatus.totalDevices > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-xs font-medium text-slate-300">Device Status</span>
                  {pd.deviceStatus.activeBatch && (
                    <span className="ml-auto text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      Batch {pd.deviceStatus.activeBatch} active
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white/[0.03] border border-white/[0.05] rounded-lg px-2.5 py-2 text-center">
                    <div className="text-lg font-bold text-slate-200 tnum">{pd.deviceStatus.totalDevices}</div>
                    <div className="text-[9px] text-slate-500 uppercase tracking-wide">Total</div>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-2.5 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span className="text-lg font-bold text-emerald-300 tnum">{pd.deviceStatus.onlineDevices}</span>
                    </div>
                    <div className="text-[9px] text-emerald-400/60 uppercase tracking-wide">Online</div>
                  </div>
                  <div className={`bg-rose-500/5 border border-rose-500/15 rounded-lg px-2.5 py-2 text-center ${pd.deviceStatus.offlineDevices === 0 ? 'opacity-40' : ''}`}>
                    <div className="flex items-center justify-center gap-1">
                      <WifiOff className="w-3 h-3 text-rose-400" />
                      <span className="text-lg font-bold text-rose-300 tnum">{pd.deviceStatus.offlineDevices}</span>
                    </div>
                    <div className="text-[9px] text-rose-400/60 uppercase tracking-wide">Offline</div>
                  </div>
                </div>
                {pd.offlineDeviceIds.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/[0.05]">
                    <div className="text-[10px] text-slate-500 mb-1">Offline devices:</div>
                    <div className="flex flex-wrap gap-1">
                      {pd.offlineDeviceIds.slice(0, 8).map((name) => (
                        <span key={name} className="text-[10px] text-rose-300/80 bg-rose-500/5 border border-rose-500/10 px-1.5 py-0.5 rounded">
                          {name}
                        </span>
                      ))}
                      {pd.offlineDeviceIds.length > 8 && (
                        <span className="text-[10px] text-slate-500 px-1.5 py-0.5">
                          +{pd.offlineDeviceIds.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {pd.deviceStatus.activeBatch && (
                  <div className="mt-2 pt-2 border-t border-white/[0.05] flex items-center justify-between text-[10px] text-slate-500">
                    <span>Currently rotating</span>
                    <span className="text-emerald-400/80 tnum">Batch {pd.deviceStatus.activeBatch} · {pd.deviceStatus.activeBatchDevices} devices</span>
                  </div>
                )}
              </div>
            )}

            {/* Activity breakdown — ₹ focused */}
            {pd && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-slate-300">Today's Activity</span>
                  <span className="ml-auto text-[10px] text-slate-600 tnum">{pd.cycleCount} cycles</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                      <Cpu className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-300">MuMu Emulator (active)</div>
                      <div className="text-[10px] text-slate-500 tnum">
                        {pd.activeHours.toFixed(2)}h · {(BASELINE_WATTS + EMULATOR_EXTRA_LOW)}–{(BASELINE_WATTS + EMULATOR_EXTRA_HIGH)}W
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-amber-300 tnum">
                        {formatInr((activeWattsLow() * pd.activeHours / 1000) * rate)}–{formatInr((activeWattsHigh() * pd.activeHours / 1000) * rate)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0">
                      <Monitor className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-300">Idle (between cycles)</div>
                      <div className="text-[10px] text-slate-500 tnum">
                        {pd.idleHours.toFixed(2)}h · {BASELINE_WATTS}W
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-300 tnum">
                        {formatInr((idleWatts() * pd.idleHours / 1000) * rate)}
                      </div>
                    </div>
                  </div>
                  {pd.powerCutHours > 0.001 && (
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                        <Plug className="w-3.5 h-3.5 text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-300">Power cut (on battery)</div>
                        <div className="text-[10px] text-slate-500 tnum">
                          {pd.powerCutHours.toFixed(2)}h · 0W wall
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-slate-500 tnum">₹0.00</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.05] flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Today total</span>
                  <div className="text-right">
                    <span className="text-xs font-bold text-amber-300 tnum">
                      {formatInr(todayCostLow)}–{formatInr(todayCostHigh)}
                    </span>
                  </div>
                </div>
                {pd.totalSpanHours > 0 && (
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-600">
                    <span>Span so far</span>
                    <span className="tnum">{pd.totalSpanHours.toFixed(1)}h · {pd.chargingHours.toFixed(1)}h on charger</span>
                  </div>
                )}
              </div>
            )}

            {/* Session */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs font-medium text-slate-300">Session (site uptime)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Cost so far</span>
                <span className="text-sm font-bold text-sky-300 tnum">{formatInr(sessionCost)}</span>
              </div>
            </div>

            {/* Daily projection — ₹ focused */}
            {pd && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-xs font-medium text-slate-300">Daily Projection (24h)</span>
                  {pd.totalSpanHours < 23.5 && (
                    <span className="ml-auto text-[10px] text-slate-600 tnum">scaled from {pd.totalSpanHours.toFixed(1)}h</span>
                  )}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-slate-500">Estimated cost/day</span>
                  <span className="text-sm font-bold text-teal-300 tnum">
                    {formatInr(dailyCostLow)}–{formatInr(dailyCostHigh)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-orange-400/70" />
                    {pd.projectedDailyActiveHours.toFixed(1)}h active
                  </span>
                  <span className="flex items-center gap-1">
                    <Monitor className="w-3 h-3 text-slate-400/70" />
                    {pd.projectedDailyIdleHours.toFixed(1)}h idle
                  </span>
                  {pd.projectedDailyPowerCutHours > 0.01 && (
                    <span className="flex items-center gap-1">
                      <Plug className="w-3 h-3 text-rose-400/70" />
                      {pd.projectedDailyPowerCutHours.toFixed(1)}h cut
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Monthly projection — ₹ focused */}
            {pd && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-medium text-slate-300">Monthly Projection (30d)</span>
                </div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] text-slate-500">Estimated cost/month</span>
                  <span className="text-sm font-bold text-violet-300 tnum">
                    {formatInr(monthlyCostLow)}–{formatInr(monthlyCostHigh)}
                  </span>
                </div>
                {/* Slab threshold bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500">APSPDCL slab threshold</span>
                    <span className={`text-[10px] font-semibold ${slabTextColor}`}>{slabLabel}</span>
                  </div>
                  <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${slabColor} rounded-full transition-all duration-700`}
                      style={{ width: `${slabPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-slate-600 tnum">{monthlyMidUnits.toFixed(0)} / {SLAB_WARNING} units</span>
                    <span className="text-[9px] text-slate-600">{SLAB_THRESHOLD}u safe · {SLAB_WARNING}u limit</span>
                  </div>
                </div>
              </div>
            )}

            {/* Month-by-month history */}
            {pd && pd.monthRecords.length > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-3">
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex items-center gap-2 w-full"
                >
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-300">Monthly History</span>
                  <span className="ml-auto text-[10px] text-slate-600">{pd.monthRecords.length} month{pd.monthRecords.length > 1 ? 's' : ''}</span>
                </button>
                {showHistory && (
                  <div className="mt-3 space-y-1.5">
                    {pd.monthRecords.map((m) => (
                      <div key={m.month} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                        <div>
                          <span className="font-medium text-slate-300">{m.label}</span>
                          <span className="text-[10px] text-slate-600 ml-2 tnum">{m.daysInMonth}d</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-200 tnum">
                            {formatInr((m.costLow + m.costHigh) / 2)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-2 tnum">
                            {((m.unitsLow + m.unitsHigh) / 2).toFixed(1)} kWh
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Rate quick-toggle */}
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-slate-500 shrink-0" />
              {RATE_PRESETS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => handleRateSelect(r.value)}
                  className={`flex-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                    rate === r.value
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                      : 'bg-white/[0.03] text-slate-500 border border-white/[0.04] hover:bg-white/[0.06]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              {isCustom && (
                <span className="px-2 py-1 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25 tnum">
                  ₹{rate}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
