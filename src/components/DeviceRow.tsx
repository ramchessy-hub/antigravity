import { Wifi, WifiOff, MoreVertical, History, Clock } from 'lucide-react';
import { formatCurrency, formatInr, formatShortDate, formatTime, formatTimeAgo, getDeviceStatus, offlineHours, INACTIVE_THRESHOLD_MS } from '@/lib/utils';
import { ProgressBar } from './ProgressBar';
import { DeviceWithdrawalBadge } from './WithdrawalsFeed';
import { WaitTimer } from './WaitTimer';
import { useState } from 'react';

const BALANCE_MILESTONES = [0.5, 1, 2, 5];


type DeviceRowProps = {
  deviceId: string;
  displayName: string | null;
  lastBalance: number | null;
  lastSeenAt: string | null;
  todayEarnings: number;
  dailyTarget: number;
  rank: number;
  peakBalance: number | null;
  lifetimeEarnings: number | null;
  lifetimeWithdrawn: number | null;
  lastWithdrawalAt: string | null;
  lastWithdrawalAmount: number | null;
  waitSeconds: number | null;
  waitTimeText: string | null;
  nextClaimAt: string | null;
  updatedAt: string | null;
  onRename: (deviceId: string, name: string) => void;
  onDelete: (deviceId: string) => void;
  onViewHistory: (deviceId: string, displayName: string | null) => void;
  isLive: boolean;
  tmConnected?: boolean;
};

function formatMilestoneEta(hours: number): string {
  const roundedHours = Math.max(1, Math.ceil(hours));
  if (roundedHours < 24) return `${roundedHours}h`;

  const days = Math.floor(roundedHours / 24);
  const remainingHours = roundedHours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function MilestoneForecast({ lastBalance, dailyTarget }: { lastBalance: number | null; dailyTarget: number }) {
  if (lastBalance === null) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2 text-[10px]">
      <span className="text-slate-600 uppercase tracking-wide">Goals</span>
      {BALANCE_MILESTONES.map((milestone) => {
        const achieved = lastBalance >= milestone;
        const eta = dailyTarget > 0 ? formatMilestoneEta(((milestone - lastBalance) / dailyTarget) * 24) : '—';

        return (
          <span
            key={milestone}
            className={`px-1.5 py-0.5 rounded border ${
              achieved
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                : 'text-slate-400 bg-white/[0.03] border-white/[0.06]'
            }`}
            title={achieved ? `${formatCurrency(milestone)} achieved` : `Estimated at ${formatCurrency(dailyTarget)} per day`}
          >
            {achieved ? '✓ ' : ''}{formatCurrency(milestone)}{achieved ? '' : ` · ${eta}`}
          </span>
        );
      })}
    </div>
  );
}

export function DeviceRow({
  deviceId,
  displayName,
  lastBalance,
  lastSeenAt,
  todayEarnings,
  dailyTarget,
  rank,
  peakBalance,
  lifetimeEarnings,
  lifetimeWithdrawn,
  lastWithdrawalAt,
  lastWithdrawalAmount,
  waitSeconds,
  waitTimeText,
  nextClaimAt,
  updatedAt,
  onRename,
  onDelete,
  onViewHistory,
  isLive: isLiveProp,
  tmConnected = false,
}: DeviceRowProps) {
  const status = getDeviceStatus(lastSeenAt);
  const isLive = isLiveProp || status === 'live';
  const hours = offlineHours(lastSeenAt);
  const isCriticalOffline = hours >= 4;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(displayName || '');

  const targetPercent = dailyTarget > 0 ? Math.min(100, (todayEarnings / dailyTarget) * 100) : 0;
  const hitTarget = todayEarnings >= dailyTarget;
  const hasWaitData = true;
  const isInactive = !updatedAt || Date.now() - new Date(updatedAt).getTime() > INACTIVE_THRESHOLD_MS;
  const displayLabel = displayName;

  const handleSaveName = () => {
    onRename(deviceId, editName.trim());
    setEditing(false);
    setMenuOpen(false);
  };

  return (
    <div className={`group border rounded-xl px-3 sm:px-4 py-3 transition-all hover:translate-x-0.5 ${
      isCriticalOffline
        ? 'bg-red-950/20 border-red-900/40 hover:border-red-800/60'
        : isLive
        ? 'glass-card glass-card-hover hover:border-emerald-500/20'
        : 'glass-card glass-card-hover'
    }`}>
      {/* Mobile layout: stacked */}
      <div className="sm:hidden">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-5 text-center text-xs font-bold text-slate-500 shrink-0">{rank}</div>
          <div className="shrink-0">
            {isLive ? (
              <div className="relative">
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              </div>
            ) : (
              <WifiOff className="w-4 h-4 text-slate-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-100 outline-none focus:border-emerald-500 flex-1 min-w-0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') { setEditing(false); setMenuOpen(false); }
                  }}
                />
                <button onClick={handleSaveName} className="text-xs text-emerald-400 shrink-0">Save</button>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium text-slate-200 truncate leading-tight">
                  {displayLabel}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {tmConnected && (
                    <span title="Tampermonkey script connected" className="inline-flex items-center justify-center px-1.5 h-4 text-[9px] font-bold text-sky-300 bg-sky-500/15 border border-sky-600/40 rounded shrink-0">TM</span>
                  )}
                  {isInactive && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-600/40 bg-slate-800/40 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 shrink-0">
                      <Clock className="h-2.5 w-2.5" /> Inactive
                    </span>
                  )}
                  {hasWaitData && (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Next Drip</span>
                      <WaitTimer
                        waitSeconds={waitSeconds}
                        waitTimeText={waitTimeText}
                        nextClaimAt={nextClaimAt}
                        updatedAt={updatedAt}
                      />
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-600 truncate font-mono leading-tight mt-0.5">{deviceId}</div>
              </>
            )}
          </div>
          {/* Menu */}
          <div className="relative shrink-0 flex items-center">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-slate-500 hover:text-slate-300"
              aria-label="Device menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 bg-[#0c1018] border border-white/[0.1] rounded-lg shadow-xl py-1 w-36">
                  <button
                    onClick={() => { setEditName(displayName || ''); setEditing(true); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => { onViewHistory(deviceId, displayName); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-cyan-400 hover:bg-white/5"
                  >
                    History
                  </button>
                  <button
                    onClick={() => { onDelete(deviceId); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile status row - highlight critical offline */}
        <div className="flex items-center justify-between pl-7">
          <div className="flex items-center gap-3">
            <div>
              <div className={`text-sm font-semibold ${hitTarget ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatCurrency(todayEarnings)}
              </div>
              <div className="text-[10px] text-slate-500">{formatInr(todayEarnings)}</div>
              <div className="text-xs text-slate-500">today</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200">
                {lastBalance !== null ? formatCurrency(lastBalance) : '—'}
              </div>
              <div className="text-[10px] text-slate-500">{lastBalance !== null ? formatInr(lastBalance) : ''}</div>
              <div className="text-xs text-slate-500">balance</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xs ${isLive ? 'text-emerald-400' : isCriticalOffline ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
              {isLive ? 'Live' : isCriticalOffline ? `${hours.toFixed(1)}h offline` : formatTimeAgo(lastSeenAt)}
            </div>
            <div className="text-xs text-slate-500">
              {formatShortDate(lastSeenAt)} {formatTime(lastSeenAt)}
            </div>
          </div>
        </div>

        {/* Mobile progress bar */}
        <div className="pl-7 mt-2">
          <ProgressBar
            value={todayEarnings}
            max={dailyTarget}
            color={hitTarget ? 'bg-emerald-500' : 'bg-amber-500'}
            height="h-1.5"
          />
          <div className="flex items-center justify-between mt-1">
            <DeviceWithdrawalBadge
              lastWithdrawalAt={lastWithdrawalAt}
              lastWithdrawalAmount={lastWithdrawalAmount}
              lifetimeWithdrawn={lifetimeWithdrawn}
            />
            <span className="text-xs text-slate-500">
              {targetPercent.toFixed(0)}% of {formatCurrency(dailyTarget)}<span className="hidden sm:inline"> · {formatInr(dailyTarget)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Desktop layout: single row */}
      <div className="hidden sm:flex items-center gap-4">
        {/* Rank */}
        <div className="flex items-center gap-2 shrink-0 w-12">
          <div className="w-5 text-center text-sm font-bold text-slate-500">{rank}</div>
        </div>

        {/* Status indicator */}
        <div className="shrink-0">
          {isLive ? (
            <div className="relative">
              <Wifi className="w-5 h-5 text-emerald-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            </div>
          ) : (
            <WifiOff className="w-5 h-5 text-slate-500" />
          )}
        </div>

        {/* Device name + ID */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-black/30 border border-white/[0.1] rounded px-2 py-0.5 text-sm text-slate-100 outline-none focus:border-emerald-500 w-48"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') { setEditing(false); setMenuOpen(false); }
                }}
              />
              <button
                onClick={handleSaveName}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Save
              </button>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium text-slate-200 truncate flex items-center gap-1.5">
                {displayLabel}
                {tmConnected && (
                  <span title="Tampermonkey script connected" className="inline-flex items-center justify-center px-1.5 h-4 text-[9px] font-bold text-sky-300 bg-sky-500/15 border border-sky-600/40 rounded">TM</span>
                )}
                {hasWaitData && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Next Drip</span>
                    <WaitTimer
                      waitSeconds={waitSeconds}
                      waitTimeText={waitTimeText}
                      nextClaimAt={nextClaimAt}
                      updatedAt={updatedAt}
                    />
                  </span>
                )}
                {isInactive && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-600/40 bg-slate-800/40 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                    <Clock className="h-2.5 w-2.5" /> Inactive
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 truncate font-mono">{deviceId}</div>
            </>
          )}
        </div>

        {/* Last seen */}
        <div className="hidden sm:flex flex-col items-end shrink-0 w-32">
          <div className="text-xs text-slate-400">{formatShortDate(lastSeenAt)} · {formatTime(lastSeenAt)}</div>
          <div className={`text-xs ${isLive ? 'text-emerald-400' : isCriticalOffline ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
            {isLive ? 'Live' : isCriticalOffline ? `${hours.toFixed(1)}h offline` : formatTimeAgo(lastSeenAt)}
          </div>
        </div>

        {/* Today earnings */}
        <div className="text-right shrink-0 w-20">
          <div className={`text-sm font-semibold ${hitTarget ? 'text-emerald-400' : 'text-amber-400'}`}>
            {formatCurrency(todayEarnings)}
          </div>
          <div className="text-[10px] text-slate-500">{formatInr(todayEarnings)}</div>
          <div className="text-xs text-slate-500">today</div>
        </div>

        {/* Balance */}
        <div className="text-right shrink-0 w-20">
          <div className="text-sm font-semibold text-slate-200">
            {lastBalance !== null ? formatCurrency(lastBalance) : '—'}
          </div>
          <div className="text-[10px] text-slate-500">{lastBalance !== null ? formatInr(lastBalance) : ''}</div>
          <div className="text-xs text-slate-500">balance</div>
        </div>

        {/* Target progress */}
        <div className="hidden md:block w-32 shrink-0">
          <ProgressBar
            value={todayEarnings}
            max={dailyTarget}
            color={hitTarget ? 'bg-emerald-500' : 'bg-amber-500'}
          />
          <div className="flex items-center justify-between mt-1">
            <DeviceWithdrawalBadge
              lastWithdrawalAt={lastWithdrawalAt}
              lastWithdrawalAmount={lastWithdrawalAmount}
              lifetimeWithdrawn={lifetimeWithdrawn}
            />
            <span className="text-xs text-slate-500">
              {targetPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Peak balance (lifetime context) */}
        <div className="hidden lg:block text-right shrink-0 w-20">
          <div className="text-sm font-semibold text-slate-400">
            {peakBalance !== null ? formatCurrency(peakBalance) : '—'}
          </div>
          <div className="text-[10px] text-slate-500">{peakBalance !== null ? formatInr(peakBalance) : ''}</div>
          <div className="text-xs text-slate-500">peak</div>
        </div>

        {/* Lifetime earnings */}
        <div className="hidden lg:block text-right shrink-0 w-20">
          <div className="text-sm font-semibold text-cyan-400">
            {lifetimeEarnings !== null ? formatCurrency(lifetimeEarnings) : '—'}
          </div>
          <div className="text-[10px] text-slate-500">{lifetimeEarnings !== null ? formatInr(lifetimeEarnings) : ''}</div>
          <div className="text-xs text-slate-500">lifetime</div>
        </div>

        {/* Menu */}
        <div className="relative shrink-0 flex items-center gap-1">
          <button
            onClick={() => onViewHistory(deviceId, displayName)}
            className="p-1 text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="View history"
            aria-label="View history"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-[#0c1018] border border-white/[0.1] rounded-lg shadow-xl py-1 w-36">
                <button
                  onClick={() => { setEditName(displayName || ''); setEditing(true); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                >
                  Rename
                </button>
                <button
                  onClick={() => { onViewHistory(deviceId, displayName); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-cyan-400 hover:bg-white/5"
                >
                  History
                </button>
                <button
                  onClick={() => { onDelete(deviceId); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pl-7 sm:pl-16">
        <MilestoneForecast lastBalance={lastBalance} dailyTarget={dailyTarget} />
      </div>
    </div>
  );
}
