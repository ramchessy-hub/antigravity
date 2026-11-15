import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { formatTimeAgo, formatShortDate, formatTime } from '@/lib/utils';

export type CycleHistoryEntry = {
  id: number;
  cycle_number: number;
  batch: string;
  device_start: number;
  device_end: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
};

type CycleHistoryProps = {
  currentCycle: number;
  rotationNumber: number;
  currentBatch: string | null;
  currentBatchStartedAt: string | null;
  history: CycleHistoryEntry[];
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function CycleHistory({
  currentCycle,
  rotationNumber,
  currentBatch,
  currentBatchStartedAt,
  history,
}: CycleHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentDuration = currentBatchStartedAt
    ? Math.round((now - new Date(currentBatchStartedAt).getTime()) / 1000)
    : 0;

  return (
    <div className="glass-card p-3 sm:p-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left gap-3"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500/80 to-fuchsia-600/80 rounded-lg flex items-center justify-center shrink-0">
            <RefreshCw className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">Batch Cycle</h3>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[11px] font-bold text-violet-300 bg-violet-500/15 border border-violet-500/25 rounded-full">
                {currentCycle}/7
              </span>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 text-[11px] font-bold text-fuchsia-300 bg-fuchsia-500/15 border border-fuchsia-500/25 rounded-full">
                Rot {rotationNumber}/8
              </span>
              {currentBatch && (
                <span className="text-[11px] text-slate-500">
                  Batch {currentBatch}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Running {formatDuration(currentDuration)}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 border-t border-white/[0.06] pt-3 animate-fade-in">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              No completed cycles yet. History will appear here each time a batch finishes and the next one starts.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/15 text-violet-300 text-xs font-bold tnum">
                    {entry.cycle_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200">
                        Batch {entry.batch}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Devices {entry.device_start}-{entry.device_end}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 tnum">
                      {formatDuration(entry.duration_seconds)} · ended {formatTimeAgo(entry.ended_at)}
                    </div>
                    <div className="text-[10px] text-slate-600 tnum mt-0.5">
                      {formatShortDate(entry.started_at)} {formatTime(entry.started_at)} → {formatShortDate(entry.ended_at)} {formatTime(entry.ended_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
