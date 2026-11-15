import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, WifiOff, Puzzle } from 'lucide-react';
import { supabase, type Device } from '@/lib/supabase';
import { formatTimeAgo, deviceDisplayName } from '@/lib/utils';

type HcaptchaAssignment = {
  id: string;
  device_id: string;
  url_label: string;
  assigned_at: string;
  completed_at: string | null;
  status: string;
};

type DeviceIssue = {
  device_id: string;
  kind: 'ip' | 'hcaptcha';
  detectedAt: string;
  assignment?: HcaptchaAssignment;
};

// Matches the MuMu controller's logic:
//  - A successful claim puts the device into cooldown (wait_seconds > 6000).
//  - If a device is actively syncing (online) but still "ready to claim"
//    (wait_seconds null/0, next_claim_at null/past) with no recent balance_claims
//    row, the claim attempt didn't take → IP issue (faucet blocked it).
//  - If an hCaptcha assignment is stuck in 'assigned' state for 3+ min,
//    the puzzle appeared and never resolved → hCaptcha stuck ("stuck at poring").
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const CLAIM_LOOKBACK_MS = 10 * 60 * 1000;
const HCAPTCHA_STUCK_MS = 3 * 60 * 1000;
const RESET_AFTER_MS = 24 * 60 * 60 * 1000;

export function RunIssueBanner({ devices, refreshKey }: { devices: Device[]; refreshKey: number }) {
  const [expanded, setExpanded] = useState(false);
  const [issues, setIssues] = useState<DeviceIssue[]>([]);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const deviceNameMap = new Map<string, string>();
  devices.forEach((d, i) => {
    const stableNumber = d.sort_order && d.sort_order < 999 ? d.sort_order : i + 1;
    deviceNameMap.set(d.device_id, deviceDisplayName(d.display_name, stableNumber));
  });

  useEffect(() => {
    let cancelled = false;
    const deviceIds = devices.map((d) => d.device_id);
    if (deviceIds.length === 0) {
      setIssues([]);
      return;
    }

    async function detect() {
      const now = Date.now();
      const onlineCutoff = new Date(now - ONLINE_WINDOW_MS).toISOString();
      const claimCutoff = new Date(now - CLAIM_LOOKBACK_MS).toISOString();

      // Devices that are actively syncing (online) and "ready to claim"
      // (no cooldown, no future next_claim_at) — these ran but the claim
      // didn't take, matching the controller's failure condition.
      const stuckReady = devices.filter((d) => {
        if (!d.last_seen_at) return false;
        const ageMs = now - new Date(d.last_seen_at).getTime();
        if (ageMs > ONLINE_WINDOW_MS) return false;
        const normalizedWait = (d.wait_time_text ?? '').trim().toLowerCase();
        const isFinishFlip = normalizedWait.includes('finish') && normalizedWait.includes('flip');
        if (isFinishFlip) return false;
        const waitOk = d.wait_seconds === null || d.wait_seconds <= 0;
        const nextOk = !d.next_claim_at || new Date(d.next_claim_at).getTime() <= now;
        return waitOk && nextOk;
      });

      // Check which of those stuck-ready devices have NO recent successful claim.
      const stuckReadyIds = stuckReady.map((d) => d.device_id);
      const recentClaimIds = new Set<string>();
      if (stuckReadyIds.length > 0) {
        const { data: claims } = await supabase
          .from('balance_claims')
          .select('device_id')
          .gte('created_at', claimCutoff)
          .in('device_id', stuckReadyIds);
        for (const c of claims ?? []) {
          recentClaimIds.add(c.device_id);
        }
      }

      // hCaptcha assignments stuck in 'assigned' state.
      const { data: assignments } = await supabase
        .from('hcaptcha_assignments')
        .select('id, device_id, url_label, assigned_at, completed_at, status')
        .eq('status', 'assigned');

      const stuckHcaptcha = new Map<string, HcaptchaAssignment>();
      const toReset: string[] = [];
      for (const a of (assignments ?? []) as HcaptchaAssignment[]) {
        const age = now - new Date(a.assigned_at).getTime();
        if (age >= RESET_AFTER_MS) {
          toReset.push(a.id);
          continue;
        }
        if (age >= HCAPTCHA_STUCK_MS && !stuckHcaptcha.has(a.device_id)) {
          stuckHcaptcha.set(a.device_id, a);
        }
      }
      if (toReset.length > 0) {
        // Expire stale assignments so they stop showing as stuck.
        // This is a read-only display; the expiry is best handled server-side,
        // but we update here as a fallback since no cron does it yet.
        const { error: resetError } = await supabase
          .from('hcaptcha_assignments')
          .update({ status: 'expired', completed_at: new Date(now).toISOString() })
          .in('id', toReset);
        if (resetError) console.error('Failed to expire stale hCaptcha assignments:', resetError);
      }

      const found: DeviceIssue[] = [];
      const nowIso = new Date(now).toISOString();

      for (const d of stuckReady) {
        if (recentClaimIds.has(d.device_id)) continue;
        // Skip if this device is also hCaptcha-stuck (hcaptcha takes priority).
        if (stuckHcaptcha.has(d.device_id)) continue;
        found.push({
          device_id: d.device_id,
          kind: 'ip',
          detectedAt: d.updated_at ?? d.last_seen_at ?? nowIso,
        });
      }

      for (const [deviceId, assignment] of stuckHcaptcha) {
        found.push({
          device_id: deviceId,
          kind: 'hcaptcha',
          detectedAt: assignment.assigned_at,
          assignment,
        });
      }

      if (!cancelled) {
        setIssues(found);
        setLastChecked(nowIso);
      }
    }

    detect();
    const interval = setInterval(detect, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [devices, refreshKey]);

  if (issues.length === 0) return null;

  const ipIssues = issues.filter((i) => i.kind === 'ip');
  const hcaptchaIssues = issues.filter((i) => i.kind === 'hcaptcha');

  return (
    <div className="bg-amber-950/40 border border-amber-700/50 rounded-2xl backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-amber-950/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-500/20 border border-amber-500/40 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
          </div>
          <div className="text-left">
            <div className="text-sm sm:text-base font-bold text-amber-300">
              Post-Run Issues · {issues.length} device{issues.length > 1 ? 's' : ''} stuck after run
              {ipIssues.length > 0 && (
                <span className="ml-2 text-amber-400 font-semibold">· {ipIssues.length} IP</span>
              )}
              {hcaptchaIssues.length > 0 && (
                <span className="ml-2 text-purple-300 font-semibold">· {hcaptchaIssues.length} hCaptcha</span>
              )}
            </div>
            <div className="text-xs text-amber-400/70">
              {issues.slice(0, 3).map((i) => deviceNameMap.get(i.device_id) || i.device_id).join(', ')}
              {issues.length > 3 && ` +${issues.length - 3} more`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-amber-300">
          <span className="text-xs font-semibold bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40">
            {issues.length}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-amber-800/40 p-3 sm:p-4 space-y-2 max-h-80 overflow-y-auto">
          {issues.map((issue) => {
            const name = deviceNameMap.get(issue.device_id) || issue.device_id;
            const isIp = issue.kind === 'ip';
            return (
              <div
                key={`${issue.device_id}-${issue.kind}`}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  isIp
                    ? 'bg-amber-900/30 border border-amber-700/50'
                    : 'bg-purple-900/30 border border-purple-700/50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-semibold truncate flex items-center gap-2 ${
                      isIp ? 'text-amber-200' : 'text-purple-200'
                    }`}
                  >
                    {isIp ? (
                      <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    ) : (
                      <Puzzle className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                    )}
                    {name}
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        isIp
                          ? 'bg-amber-500/30 text-amber-200 border border-amber-500/40'
                          : 'bg-purple-500/30 text-purple-200 border border-purple-500/40'
                      }`}
                    >
                      {isIp ? 'IP ISSUE' : 'HCAPTCHA'}
                    </span>
                  </div>
                  <div className="text-xs text-amber-400/60 font-mono truncate">{issue.device_id}</div>
                  <div className={`text-xs mt-0.5 ${isIp ? 'text-amber-400/70' : 'text-purple-400/70'}`}>
                    {isIp
                      ? 'Ran but still ready to claim — no cooldown started. Faucet blocked the claim (IP flagged).'
                      : `Stuck at puzzle (poring) since ${formatTimeAgo(issue.assignment?.assigned_at ?? null)}.`}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className={`text-xs font-bold ${isIp ? 'text-amber-300' : 'text-purple-300'}`}>
                    {isIp ? 'Syncing' : 'Stuck'} {formatTimeAgo(issue.detectedAt)}
                  </div>
                </div>
              </div>
            );
          })}
          {lastChecked && (
            <div className="text-[10px] text-amber-500/40 text-right pt-1">
              Checked {formatTimeAgo(lastChecked)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
