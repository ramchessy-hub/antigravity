import { AlertTriangle, ChevronDown, ChevronUp, Bell, BellOff } from 'lucide-react';
import { useState } from 'react';
import type { Device } from '@/lib/supabase';
import { formatTimeAgo, offlineHours, OFFLINE_BANNER_HOURS, OFFLINE_ALERT_HOURS } from '@/lib/utils';

type DeviceIssueBannerProps = {
  devices: Device[];
  alertsMuted: boolean;
  onToggleMute: () => void;
};

export function DeviceIssueBanner({ devices, alertsMuted, onToggleMute }: DeviceIssueBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const problemDevices = devices
    .filter((d) => offlineHours(d.last_seen_at) >= OFFLINE_BANNER_HOURS)
    .sort((a, b) => offlineHours(b.last_seen_at) - offlineHours(a.last_seen_at));

  const criticalDevices = problemDevices.filter((d) => offlineHours(d.last_seen_at) >= OFFLINE_ALERT_HOURS);
  const showAlertControls = criticalDevices.length > 0;

  if (problemDevices.length === 0) return null;

  const totalIssues = problemDevices.length;

  return (
    <div className="bg-red-950/40 border border-red-700/50 rounded-2xl backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-red-950/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-500/20 border border-red-500/40 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
          </div>
          <div className="text-left">
            <div className="text-sm sm:text-base font-bold text-red-300">
              Device Issue · {totalIssues} device{totalIssues > 1 ? 's' : ''} offline {OFFLINE_BANNER_HOURS}h+
              {showAlertControls && (
                <span className="ml-2 text-red-400 font-semibold">
                  · {criticalDevices.length} alert{criticalDevices.length > 1 ? 's' : ''} ({OFFLINE_ALERT_HOURS}h+)
                </span>
              )}
            </div>
            <div className="text-xs text-red-400/70">
              {problemDevices.slice(0, 3).map((d) => d.display_name || d.device_id).join(', ')}
              {problemDevices.length > 3 && ` +${problemDevices.length - 3} more`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-red-300">
          {showAlertControls && (
            <span
              onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleMute(); } }}
              title={alertsMuted ? 'Unmute offline device alerts' : 'Mute offline device alerts'}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                alertsMuted
                  ? 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                  : 'text-red-300 bg-red-500/10 hover:bg-red-500/20'
              }`}
            >
              {alertsMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              <span>{alertsMuted ? 'Muted' : 'Mute'}</span>
            </span>
          )}
          <span className="text-xs font-semibold bg-red-500/20 px-2 py-0.5 rounded-full border border-red-500/40">
            {totalIssues}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-red-800/40 p-3 sm:p-4 space-y-2 max-h-72 overflow-y-auto">
          {problemDevices.map((d) => {
            const hours = offlineHours(d.last_seen_at);
            const isCritical = hours >= OFFLINE_ALERT_HOURS;
            return (
              <div
                key={d.device_id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  isCritical
                    ? 'bg-red-900/30 border border-red-700/50'
                    : 'bg-red-900/20 border border-red-800/40'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-red-200 truncate flex items-center gap-2">
                    {d.display_name || d.device_id}
                    {isCritical && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/30 text-red-200 border border-red-500/40">
                        ALERT
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-red-400/70 font-mono truncate">{d.device_id}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-red-300">
                    {hours >= 1 ? `${hours.toFixed(1)}h offline` : 'Offline'}
                  </div>
                  <div className="text-xs text-red-400/60">
                    Last seen {formatTimeAgo(d.last_seen_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
