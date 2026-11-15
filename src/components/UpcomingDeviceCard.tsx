import { useEffect, useState } from 'react';
import { Clock, ListOrdered, Wifi, WifiOff, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import type { Device } from '@/lib/supabase';
import { formatShortDate, formatTime, getDeviceStatus, deviceDisplayName } from '@/lib/utils';
import { WaitTimer } from './WaitTimer';

type UpcomingDeviceCardProps = {
  devices: Device[];
};

function remainingSeconds(device: Device, now: number): number | null {
  const normalizedWait = (device.wait_time_text ?? '').trim().toLowerCase();
  const isEmptyText = normalizedWait === '' || normalizedWait === 'none' || normalizedWait === 'null' || normalizedWait === 'n/a' || normalizedWait === 'no data';
  if (normalizedWait === 'ready' || normalizedWait === 'ready now' || normalizedWait === 'claim your drop') return 0;
  if (isEmptyText && device.wait_seconds === null) return 0;
  if (device.next_claim_at) {
    return Math.max(0, Math.floor((new Date(device.next_claim_at).getTime() - now) / 1000));
  }
  if (device.wait_seconds !== null && device.updated_at) {
    const elapsed = Math.floor((now - new Date(device.updated_at).getTime()) / 1000);
    return Math.max(0, device.wait_seconds - elapsed);
  }
  if (device.wait_seconds !== null) return Math.max(0, device.wait_seconds);
  return null;
}

function deviceLabel(device: Device): string {
  return deviceDisplayName(device.display_name, device.sort_order);
}

export function UpcomingDeviceCard({ devices }: UpcomingDeviceCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const upcoming = devices
    .map((device) => {
      const normalizedWait = (device.wait_time_text ?? '').trim().toLowerCase();
      const isFinishFlip = normalizedWait.includes('finish') && normalizedWait.includes('flip');
      const isSleeping = normalizedWait === 'sleeping';
      const remaining = (isFinishFlip || isSleeping) ? null : remainingSeconds(device, now);
      return { device, remaining, isFinishFlip, isSleeping };
    })
    .sort((a, b) => {
      const aVal = a.remaining === null ? Number.MAX_SAFE_INTEGER : a.remaining;
      const bVal = b.remaining === null ? Number.MAX_SAFE_INTEGER : b.remaining;
      return aVal - bVal;
    });

  const readyCount = upcoming.filter((u) => !u.isFinishFlip && !u.isSleeping && (u.remaining ?? Infinity) <= 0).length;
  const nextDevice = upcoming[0]?.device ?? null;
  const nextRemaining = upcoming[0]?.remaining ?? null;

  return (
    <div className="glass-card glass-card-hover overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <ListOrdered className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-100">Upcoming Devices</h3>
            <p className="text-[11px] text-slate-500">
              {readyCount > 0 ? (
                <span className="text-emerald-400 font-semibold">{readyCount} ready now</span>
              ) : nextDevice ? (
                <>Next: {deviceLabel(nextDevice)}{nextRemaining !== null && nextRemaining > 0 ? ` · ${formatHMS(nextRemaining)}` : ''}</>
              ) : (
                'Waiting for updates'
              )}
              {' · '}{upcoming.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] p-3 sm:p-4">
          {upcoming.length === 0 ? (
            <div className="flex h-[90px] flex-col items-center justify-center text-center">
              <Clock className="w-7 h-7 text-slate-700 mb-2" />
              <p className="text-xs text-slate-400">Waiting for device updates</p>
              <p className="text-[10px] text-slate-600 mt-1">Wait times will appear here automatically</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {upcoming.map(({ device, remaining, isFinishFlip, isSleeping }, idx) => {
                const status = getDeviceStatus(device.last_seen_at);
                const isReady = !isFinishFlip && !isSleeping && (remaining ?? Infinity) <= 0;
                return (
                  <div
                    key={device.device_id}
                    className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 border transition-colors ${
                      isReady
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.04] text-[11px] font-bold text-slate-400 shrink-0">
                        {isReady ? (
                          <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-200 truncate flex items-center gap-1.5">
                          {deviceLabel(device)}
                          {status === 'live' ? (
                            <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <WifiOff className="w-3 h-3 text-slate-600 shrink-0" />
                          )}
                        </div>
                        <div className="text-[9px] text-slate-600 font-mono truncate leading-tight">
                          {device.device_id}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {device.last_seen_at
                            ? `${formatShortDate(device.last_seen_at)} · ${formatTime(device.last_seen_at)}`
                            : 'No update yet'}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <WaitTimer
                        waitSeconds={device.wait_seconds}
                        waitTimeText={device.wait_time_text}
                        nextClaimAt={device.next_claim_at}
                        updatedAt={device.updated_at}
                      />
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

function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
