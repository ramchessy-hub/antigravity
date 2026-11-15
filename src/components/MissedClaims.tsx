import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Power, WifiOff, Bug, HelpCircle, ChevronDown, ChevronUp, Zap, Clock } from 'lucide-react';
import { supabase, type Device } from '@/lib/supabase';
import type { EarningsSummary } from '@/types';
import { formatCurrency, formatInr, offlineHours, formatTimeAgo, istDateString } from '@/lib/utils';

type MissedClaimsProps = {
  devices: Device[];
  summary: EarningsSummary;
  dailyTargetPerDevice: number;
};

type Period = 'yesterday' | 'week' | 'month' | 'overall';

type ReasonCategory = 'power' | 'offline' | 'script' | 'other' | 'maturing';

type DeviceMissed = {
  deviceId: string;
  displayName: string;
  missedAmount: number;
  expectedAmount: number;
  actualAmount: number;
  hoursOffline: number;
  reason: ReasonCategory;
  reasonLabel: string;
  fix: string;
  lastSeen: string | null;
  isMaturing: boolean;
  claimAmount: number;
};

type PerDeviceDayEarning = {
  device_id: string;
  earnings: number;
};

type BalanceClaimRow = {
  device_id: string;
  increase_amount: number | null;
  created_at: string;
};

const RAMPUP_DAILY_TARGET = 0.08;
const RAMPUP_CLAIM_AMOUNT = 0.01;
const MATURE_CLAIM_THRESHOLD = 0.015;
const MATURITY_FALLBACK_DAYS = 5;

const PERIOD_DEFS: { key: Period; label: string; days: number }[] = [
  { key: 'yesterday', label: 'Yesterday', days: 1 },
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 30 },
  { key: 'overall', label: 'Overall', days: 365 },
];

const REASON_META: Record<ReasonCategory, { label: string; icon: typeof Power; color: string; bgColor: string; borderColor: string }> = {
  power: {
    label: 'Power Off',
    icon: Power,
    color: 'text-red-300',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  offline: {
    label: 'Device Offline',
    icon: WifiOff,
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  script: {
    label: 'Script Issue',
    icon: Bug,
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  maturing: {
    label: 'Maturing',
    icon: Clock,
    color: 'text-sky-300',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-sky-500/30',
  },
  other: {
    label: 'Underperforming',
    icon: HelpCircle,
    color: 'text-slate-300',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
  },
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

type DayMaturity = Map<string, boolean>;

function buildMaturityMap(
  claims: BalanceClaimRow[],
  devices: Device[],
): Map<string, DayMaturity> {
  const byDevice = new Map<string, BalanceClaimRow[]>();
  for (const c of claims) {
    if (c.increase_amount == null) continue;
    const arr = byDevice.get(c.device_id) ?? [];
    arr.push(c);
    byDevice.set(c.device_id, arr);
  }

  const result = new Map<string, DayMaturity>();

  for (const device of devices) {
    const deviceClaims = byDevice.get(device.device_id) ?? [];
    const dayMap = new Map<string, boolean>();
    const createdDate = new Date(device.created_at);

    for (const claim of deviceClaims) {
      const dayStr = new Date(claim.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const amt = claim.increase_amount ?? 0;
      dayMap.set(dayStr, amt >= MATURE_CLAIM_THRESHOLD);
    }

    const now = new Date();
    const daysSinceCreation = daysBetween(createdDate, now);
    const isStillMaturingByTime = daysSinceCreation < MATURITY_FALLBACK_DAYS;

    const hasMatureClaim = Array.from(dayMap.values()).some((m) => m);
    if (hasMatureClaim) {
      const firstMatureDay = deviceClaims
        .filter((c) => (c.increase_amount ?? 0) >= MATURE_CLAIM_THRESHOLD)
        .map((c) => new Date(c.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
        .sort()[0];
      if (firstMatureDay) {
        for (let t = new Date(firstMatureDay + 'T00:00:00+05:30').getTime(); t <= now.getTime(); t += 24 * 60 * 60 * 1000) {
          const ds = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          if (!dayMap.has(ds)) dayMap.set(ds, true);
        }
      }
    } else if (isStillMaturingByTime) {
      const todayStr = istDateString(now);
      if (!dayMap.has(todayStr)) dayMap.set(todayStr, false);
    }

    result.set(device.device_id, dayMap);
  }

  return result;
}

function isDeviceMatureOnDay(
  maturityData: Map<string, DayMaturity>,
  deviceId: string,
  dayStr: string,
  device: Device,
): boolean {
  const dayMap = maturityData.get(deviceId);
  if (dayMap?.has(dayStr)) return dayMap.get(dayStr)!;

  const createdDate = new Date(device.created_at);
  const dayDate = new Date(dayStr + 'T00:00:00+05:30');
  const daysSinceCreation = daysBetween(createdDate, dayDate);

  if (daysSinceCreation < 0) return true;
  return daysSinceCreation >= MATURITY_FALLBACK_DAYS;
}

function getDeviceExpectedForDay(
  maturityData: Map<string, DayMaturity>,
  device: Device,
  dayStr: string,
  fullTarget: number,
): number {
  const createdDate = new Date(device.created_at);
  const dayDate = new Date(dayStr + 'T00:00:00+05:30');
  if (dayDate < createdDate) return 0;

  const isMature = isDeviceMatureOnDay(maturityData, device.device_id, dayStr, device);
  return isMature ? fullTarget : RAMPUP_DAILY_TARGET;
}

function predictReason(
  device: Device,
  isMaturing: boolean,
  actualEarnings: number,
  expectedEarnings: number,
): { reason: ReasonCategory; reasonLabel: string; fix: string } {
  if (isMaturing && actualEarnings >= RAMPUP_DAILY_TARGET * 0.8) {
    return {
      reason: 'maturing',
      reasonLabel: 'Maturing',
      fix: 'Device is still ramping up ($0.01/claim). Expected earnings are lower — this is normal, not a miss.',
    };
  }

  const hours = offlineHours(device.last_seen_at);

  if (hours >= 6.2) {
    return {
      reason: 'power',
      reasonLabel: 'Power Off',
      fix: 'Power on the device, open the browser with Tampermonkey, and verify the script is running.',
    };
  }

  if (hours > 0) {
    return {
      reason: 'offline',
      reasonLabel: 'Device Offline',
      fix: 'Check the device internet connection and make sure the browser tab stays open.',
    };
  }

  if (actualEarnings <= 0 && expectedEarnings > 0) {
    return {
      reason: 'script',
      reasonLabel: 'Script Issue',
      fix: 'Reload the Tampermonkey script page or restart the browser. Check if the script is enabled in Tampermonkey dashboard.',
    };
  }

  if (actualEarnings < expectedEarnings * 0.7) {
    return {
      reason: 'other',
      reasonLabel: 'Underperforming',
      fix: 'Device is online but earning below target. Check if the staking app is running properly and the tab is active.',
    };
  }

  return {
    reason: 'maturing',
    reasonLabel: 'Maturing',
    fix: 'Device is ramping up. Give it a few more days to reach full target.',
  };
}

export function MissedClaims({ devices, summary, dailyTargetPerDevice }: MissedClaimsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('yesterday');
  const [expanded, setExpanded] = useState(false);
  const [yesterdayPerDevice, setYesterdayPerDevice] = useState<Map<string, number>>(new Map());
  const [maturityData, setMaturityData] = useState<Map<string, DayMaturity>>(new Map());
  const [claimAmounts, setClaimAmounts] = useState<Map<string, number>>(new Map());

  const yesterdayStr = useMemo(() => {
    const now = new Date();
    const todayIst = istDateString(now);
    const todayDate = new Date(todayIst + 'T00:00:00+05:30');
    const yesterday = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
    return istDateString(yesterday);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;

    const since = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase
        .from('daily_earnings')
        .select('device_id, earnings')
        .eq('day', yesterdayStr),
      supabase
        .from('balance_claims')
        .select('device_id, increase_amount, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
    ]).then(([earningsRes, claimsRes]) => {
      if (cancelled) return;

      const eMap = new Map<string, number>();
      if (earningsRes.data) {
        for (const row of earningsRes.data as PerDeviceDayEarning[]) {
          eMap.set(row.device_id, row.earnings ?? 0);
        }
      }
      setYesterdayPerDevice(eMap);

      if (claimsRes.data) {
        const claims = claimsRes.data as BalanceClaimRow[];
        setMaturityData(buildMaturityMap(claims, devices));

        const latestClaim = new Map<string, number>();
        for (const c of claims) {
          if (c.increase_amount == null) continue;
          if (!latestClaim.has(c.device_id)) {
            latestClaim.set(c.device_id, c.increase_amount);
          }
        }
        setClaimAmounts(latestClaim);
      }
    });

    return () => { cancelled = true; };
  }, [expanded, yesterdayStr, devices]);

  const deviceMissed: DeviceMissed[] = useMemo(() => {
    return devices
      .map((d) => {
        const isMaturingYesterday = !isDeviceMatureOnDay(maturityData, d.device_id, yesterdayStr, d);
        const expectedForYesterday = getDeviceExpectedForDay(maturityData, d, yesterdayStr, dailyTargetPerDevice);
        const actualYesterday = yesterdayPerDevice.get(d.device_id) ?? 0;
        const missedAmount = Math.max(0, expectedForYesterday - actualYesterday);

        const { reason, reasonLabel, fix } = predictReason(
          d,
          isMaturingYesterday,
          actualYesterday,
          expectedForYesterday,
        );

        return {
          deviceId: d.device_id,
          displayName: d.display_name || d.device_id,
          missedAmount,
          expectedAmount: expectedForYesterday,
          actualAmount: actualYesterday,
          hoursOffline: offlineHours(d.last_seen_at),
          reason,
          reasonLabel,
          fix,
          lastSeen: d.last_seen_at,
          isMaturing: isMaturingYesterday,
          claimAmount: claimAmounts.get(d.device_id) ?? RAMPUP_CLAIM_AMOUNT,
        };
      })
      .filter((d) => d.missedAmount > 0.001)
      .sort((a, b) => b.missedAmount - a.missedAmount);
  }, [devices, dailyTargetPerDevice, yesterdayPerDevice, yesterdayStr, maturityData, claimAmounts]);

  const periodTotals = useMemo(() => {
    const now = new Date();
    const todayIstStr = istDateString(now);
    const todayDate = new Date(todayIstStr + 'T00:00:00+05:30');
    const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayIstStr = istDateString(yesterdayDate);

    return PERIOD_DEFS.map((p) => {
      let fromStr: string;
      let toStr: string;
      if (p.key === 'yesterday') {
        fromStr = yesterdayIstStr;
        toStr = yesterdayIstStr;
      } else if (p.key === 'overall') {
        fromStr = '0000-01-01';
        toStr = yesterdayIstStr;
      } else {
        toStr = yesterdayIstStr;
        const from = new Date(yesterdayDate.getTime() - (p.days - 1) * 24 * 60 * 60 * 1000);
        fromStr = istDateString(from);
      }

      let actual = 0;
      for (const row of summary.perDay) {
        if (row.day >= fromStr && row.day <= toStr) {
          actual += row.earnings;
        }
      }

      let expected = 0;
      const dayMs = 24 * 60 * 60 * 1000;
      const fromDate = new Date(fromStr + 'T00:00:00+05:30');
      const toDate = new Date(toStr + 'T00:00:00+05:30');
      for (let t = fromDate.getTime(); t <= toDate.getTime(); t += dayMs) {
        const dayStr = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        for (const device of devices) {
          expected += getDeviceExpectedForDay(maturityData, device, dayStr, dailyTargetPerDevice);
        }
      }

      const missed = Math.max(0, expected - actual);

      return {
        key: p.key,
        label: p.label,
        missed: Math.round(missed * 100) / 100,
        expected: Math.round(expected * 100) / 100,
        actual: Math.round(actual * 100) / 100,
      };
    });
  }, [summary.perDay, devices, dailyTargetPerDevice, maturityData]);

  const selectedTotal = periodTotals.find((p) => p.key === selectedPeriod) ?? periodTotals[0];

  const reasonCounts = useMemo(() => {
    const counts: Record<ReasonCategory, number> = { power: 0, offline: 0, script: 0, maturing: 0, other: 0 };
    for (const d of deviceMissed) {
      counts[d.reason]++;
    }
    return counts;
  }, [deviceMissed]);

  const totalReasonCount = Object.values(reasonCounts).reduce((a, b) => a + b, 0);
  const maturingCount = devices.filter((d) => {
    const todayStr = istDateString();
    return !isDeviceMatureOnDay(maturityData, d.device_id, todayStr, d);
  }).length;

  return (
    <div className="glass-card p-4 sm:p-5">
      {/* Collapsed: compact header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-gradient-to-br from-rose-500/80 to-orange-600/80 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Missed Claims</h3>
            <p className="text-[11px] text-slate-500">
              <span className="text-rose-400 font-semibold tnum">{formatCurrency(selectedTotal.missed)}</span>
              <span className="hidden sm:inline text-slate-600"> · {formatInr(selectedTotal.missed)}</span>
              {totalReasonCount > 0 && (
                <span className="text-slate-600"> · {totalReasonCount} device{totalReasonCount > 1 ? 's' : ''} affected</span>
              )}
              {maturingCount > 0 && (
                <span className="text-sky-400/70"> · {maturingCount} maturing</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expanded && (
            <div className="flex items-center gap-1">
              {PERIOD_DEFS.map((p) => (
                <span
                  key={p.key}
                  onClick={(e) => { e.stopPropagation(); setSelectedPeriod(p.key); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSelectedPeriod(p.key); } }}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    selectedPeriod === p.key
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/5'
                  }`}
                >
                  {p.label}
                </span>
              ))}
            </div>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {/* Expanded: full details */}
      {expanded && (
        <div className="mt-4 border-t border-white/[0.06] pt-4 animate-fade-in">
          {/* Maturity notice */}
          {maturingCount > 0 && (
            <div className="flex items-center gap-2 mb-3 text-xs text-sky-300/80 bg-sky-500/[0.07] border border-sky-500/15 rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                {maturingCount} device{maturingCount > 1 ? 's' : ''} still maturing ($0.01/claim, expected{' '}
                <span className="font-semibold tnum">{formatCurrency(RAMPUP_DAILY_TARGET)}/day</span>).
                Once a device starts claiming $0.02, its target automatically rises to{' '}
                <span className="font-semibold tnum">{formatCurrency(dailyTargetPerDevice)}/day</span>.
              </span>
            </div>
          )}

          {/* Period summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-rose-500/[0.07] border border-rose-500/15 rounded-xl p-3">
              <div className="text-[11px] text-rose-400/70 uppercase tracking-wide font-semibold mb-1">Missed</div>
              <div className="text-xl font-bold text-rose-300 tnum">{formatCurrency(selectedTotal.missed)}</div>
              <div className="text-[10px] text-rose-400/50 tnum">{formatInr(selectedTotal.missed)}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Expected</div>
              <div className="text-xl font-bold text-slate-200 tnum">{formatCurrency(selectedTotal.expected)}</div>
              <div className="text-[10px] text-slate-500 tnum">{formatInr(selectedTotal.expected)}</div>
            </div>
            <div className="bg-emerald-500/[0.05] border border-emerald-500/10 rounded-xl p-3">
              <div className="text-[11px] text-emerald-400/70 uppercase tracking-wide font-semibold mb-1">Actual</div>
              <div className="text-xl font-bold text-emerald-300 tnum">{formatCurrency(selectedTotal.actual)}</div>
              <div className="text-[10px] text-emerald-400/50 tnum">{formatInr(selectedTotal.actual)}</div>
            </div>
          </div>

          {/* Reason summary chips */}
          {totalReasonCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.keys(reasonCounts) as ReasonCategory[]).map((key) => {
                if (reasonCounts[key] === 0) return null;
                const meta = REASON_META[key];
                const Icon = meta.icon;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${meta.bgColor} ${meta.borderColor} border ${meta.color}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{meta.label}</span>
                    <span className="font-bold tnum">{reasonCounts[key]}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Per-device breakdown */}
          {deviceMissed.length === 0 ? (
            <div className="text-center py-4">
              <Zap className="w-6 h-6 text-emerald-400/50 mx-auto mb-1.5" />
              <p className="text-xs text-slate-400">No missed earnings detected — all devices hit their targets yesterday!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {deviceMissed.map((d) => {
                const meta = REASON_META[d.reason];
                const Icon = meta.icon;
                return (
                  <div
                    key={d.deviceId}
                    className={`rounded-lg p-3 ${meta.bgColor} border ${meta.borderColor}`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bgColor} border ${meta.borderColor}`}>
                          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-200 truncate">
                            {d.displayName}
                            {d.isMaturing && (
                              <span className="ml-1.5 text-[10px] text-sky-400/70 font-normal">
                                ${d.claimAmount.toFixed(2)}/claim
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">{d.deviceId}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-rose-300 tnum">
                          -{formatCurrency(d.missedAmount)}
                        </div>
                        <div className="text-[10px] text-rose-400/50 tnum">{formatInr(d.missedAmount)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs ml-9 flex-wrap">
                      <span className={`font-semibold ${meta.color}`}>{d.reasonLabel}</span>
                      <span className="text-slate-500 tnum">
                        · expected {formatCurrency(d.expectedAmount)} · got {formatCurrency(d.actualAmount)}
                      </span>
                      {d.hoursOffline > 0 && (
                        <span className="text-slate-500">
                          · {d.hoursOffline >= 1 ? `${d.hoursOffline.toFixed(1)}h offline` : 'Offline'}
                        </span>
                      )}
                      {d.lastSeen && (
                        <span className="text-slate-600">· {formatTimeAgo(d.lastSeen)}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1.5 ml-9">
                      <span className="text-slate-500 font-semibold">Fix: </span>
                      {d.fix}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
