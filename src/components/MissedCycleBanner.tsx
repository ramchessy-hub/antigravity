import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, WifiOff, Clock, TrendingDown } from 'lucide-react';
import { supabase, type Device } from '@/lib/supabase';
import { formatCurrency, formatInr, formatTimeAgo, deviceDisplayName, isDeviceLive } from '@/lib/utils';

type MissedCycleBannerProps = {
  devices: Device[];
  refreshKey: number;
};

type ClaimRow = {
  device_id: string;
  increase_amount: number | null;
  created_at: string;
};

type MissedDevice = {
  deviceId: string;
  displayName: string;
  sortOrder: number;
  expectedAmount: number;
  lastClaimAt: string | null;
  nextClaimAt: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  minutesOverdue: number;
};

const GRACE_PERIOD_MIN = 5;

function deviceLabel(device: Device): string {
  return deviceDisplayName(device.display_name, device.sort_order);
}

export function MissedCycleBanner({ devices, refreshKey }: MissedCycleBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [claimMap, setClaimMap] = useState<Map<string, ClaimRow>>(new Map());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    supabase
      .from('balance_claims')
      .select('device_id, increase_amount, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const latest = new Map<string, ClaimRow>();
        for (const row of data as ClaimRow[]) {
          if (!latest.has(row.device_id)) {
            latest.set(row.device_id, row);
          }
        }
        setClaimMap(latest);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const missedDevices: MissedDevice[] = devices
    .map((device) => {
      const lastClaim = claimMap.get(device.device_id);
      const expectedAmount = lastClaim?.increase_amount ?? 0.01;
      const nextClaimAt = device.next_claim_at;
      const lastClaimAt = lastClaim?.created_at ?? null;

      let isMissed = false;
      let minutesOverdue = 0;

      if (nextClaimAt) {
        const nextClaimMs = new Date(nextClaimAt).getTime();
        const overdueMs = now - nextClaimMs;
        if (overdueMs > GRACE_PERIOD_MIN * 60 * 1000) {
          const lastClaimMs = lastClaimAt ? new Date(lastClaimAt).getTime() : 0;
          if (lastClaimMs < nextClaimMs) {
            isMissed = true;
            minutesOverdue = Math.floor(overdueMs / 60000);
          }
        }
      } else {
        const lastClaimMs = lastClaimAt ? new Date(lastClaimAt).getTime() : 0;
        const hoursSinceClaim = (now - lastClaimMs) / (60 * 60 * 1000);
        const isOnline = isDeviceLive(device.last_seen_at);
        if (isOnline && hoursSinceClaim > 2) {
          isMissed = true;
          minutesOverdue = Math.floor((now - lastClaimMs) / 60000);
        }
      }

      return {
        deviceId: device.device_id,
        displayName: deviceLabel(device),
        sortOrder: device.sort_order,
        expectedAmount,
        lastClaimAt,
        nextClaimAt,
        lastSeenAt: device.last_seen_at,
        isOnline: isDeviceLive(device.last_seen_at),
        minutesOverdue,
      } as MissedDevice;
    })
    .filter((d) => d.minutesOverdue > 0 || d.expectedAmount > 0)
    .filter((d) => {
      if (!d.nextClaimAt && !d.lastClaimAt) return false;
      return d.minutesOverdue > GRACE_PERIOD_MIN;
    })
    .sort((a, b) => b.minutesOverdue - a.minutesOverdue);

  const totalMissedAmount = missedDevices.reduce((sum, d) => sum + d.expectedAmount, 0);

  if (missedDevices.length === 0) return null;

  return (
    <div className="glass-card border-amber-500/30 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-amber-500/[0.04] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-100">
              Missed Cycle Claims
              <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[11px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 rounded-full">
                {missedDevices.length}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              <span className="text-amber-400 font-semibold tnum">{formatCurrency(totalMissedAmount)}</span>
              <span className="hidden sm:inline text-slate-600"> · {formatInr(totalMissedAmount)} expected increase not claimed</span>
              <span className="sm:hidden text-slate-600"> expected not claimed</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400 shrink-0">
          <TrendingDown className="w-4 h-4 text-amber-400" />
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-amber-500/15 p-3 sm:p-4">
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {missedDevices.map((d) => (
              <div
                key={d.deviceId}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-amber-500/[0.06] border border-amber-500/15 hover:bg-amber-500/[0.1] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/15 text-[11px] font-bold text-amber-300 shrink-0">
                    {d.sortOrder < 999 ? d.sortOrder : '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate flex items-center gap-1.5">
                      {d.displayName}
                      {d.isOnline ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      ) : (
                        <WifiOff className="w-3 h-3 text-slate-600 shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-2.5 h-2.5" />
                      {d.minutesOverdue >= 60
                        ? `${Math.floor(d.minutesOverdue / 60)}h ${d.minutesOverdue % 60}m overdue`
                        : `${d.minutesOverdue}m overdue`}
                      {d.lastClaimAt && (
                        <span className="text-slate-600">· last claim {formatTimeAgo(d.lastClaimAt)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-amber-300 tnum">
                    +{formatCurrency(d.expectedAmount)}
                  </div>
                  <div className="text-[10px] text-amber-400/50 tnum">{formatInr(d.expectedAmount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
