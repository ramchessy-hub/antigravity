import { useEffect, useState } from 'react';
import { Clock, Loader2, Moon } from 'lucide-react';

type WaitTimerProps = {
  waitSeconds: number | null;
  waitTimeText: string | null;
  nextClaimAt: string | null;
  updatedAt: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * A single watch-style "date change" digit cell.
 * Shows the current digit in white (front) and the upcoming/next digit
 * in black-dark behind it — like a flipping digital watch.
 */
function WatchDigit({ current, next }: { current: string; next: string }) {
  return (
    <span className="relative inline-block w-[0.62em] h-[1.05em] overflow-hidden text-center leading-[1.05em] align-middle">
      {/* next digit (dark, behind) */}
      <span
        className="absolute inset-0 flex items-center justify-center text-slate-700/80 select-none transition-transform duration-500 ease-out"
        style={{ transform: 'translateY(-100%)' }}
        aria-hidden="true"
      >
        {next}
      </span>
      {/* current digit (white, front) */}
      <span className="relative z-10 flex items-center justify-center text-white tnum">
        {current}
      </span>
    </span>
  );
}

function WatchColon() {
  return <span className="relative z-10 text-white/70 mx-[0.5px]">:</span>;
}

/**
 * Render an HH:MM:SS countdown in the watch date-change style.
 * Each digit cell rolls: current (white) sits in front, next (black-dark) sits behind.
 */
function WatchCountdown({ totalSeconds }: { totalSeconds: number }) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  // Compute "next" values for the rolling effect (1-second lookahead).
  const nextTotal = Math.max(0, totalSeconds - 1);
  const nh = Math.floor(nextTotal / 3600);
  const nm = Math.floor((nextTotal % 3600) / 60);
  const ns = Math.floor(nextTotal % 60);

  const hStr = pad(h);
  const mStr = pad(m);
  const sStr = pad(s);
  const nhStr = pad(nh);
  const nmStr = pad(nm);
  const nsStr = pad(ns);

  return (
    <span className="inline-flex items-center font-mono font-bold text-[12px] tracking-tight select-none">
      <WatchDigit current={hStr[0]} next={nhStr[0]} />
      <WatchDigit current={hStr[1]} next={nhStr[1]} />
      <WatchColon />
      <WatchDigit current={mStr[0]} next={nmStr[0]} />
      <WatchDigit current={mStr[1]} next={nmStr[1]} />
      <WatchColon />
      <WatchDigit current={sStr[0]} next={nsStr[0]} />
      <WatchDigit current={sStr[1]} next={nsStr[1]} />
    </span>
  );
}

export function WaitTimer({ waitSeconds, waitTimeText, nextClaimAt, updatedAt }: WaitTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (nextClaimAt === null && waitSeconds === null && !waitTimeText) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-semibold tnum text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
        title="No wait data reported \u2014 ready to claim"
      >
        <Clock className="w-3 h-3" />
        <span>Ready to Claim</span>
      </div>
    );
  }

  let remainingSeconds: number | null = null;
  let autoComputed = false;

  if (nextClaimAt) {
    const target = new Date(nextClaimAt).getTime();
    remainingSeconds = Math.max(0, Math.floor((target - now) / 1000));
  } else if (waitSeconds && updatedAt) {
    const elapsed = Math.floor((now - new Date(updatedAt).getTime()) / 1000);
    remainingSeconds = Math.max(0, waitSeconds - elapsed);
    autoComputed = true;
  } else if (waitSeconds) {
    remainingSeconds = waitSeconds;
    autoComputed = true;
  }

  const normalizedText = waitTimeText?.trim().toLowerCase() ?? '';
  const isEmptyText = normalizedText === '' || normalizedText === 'none' || normalizedText === 'null' || normalizedText === 'n/a' || normalizedText === 'no data';
  const reportedReady = normalizedText === 'ready' || normalizedText === 'ready now' || normalizedText === 'claim your drop';
  const isFinishFlip = normalizedText.includes('finish') && normalizedText.includes('flip');
  const isSleeping = normalizedText === 'sleeping';
  const noWaitData = waitSeconds === null && !nextClaimAt && isEmptyText;
  const isReady = !isFinishFlip && !isSleeping && (reportedReady || noWaitData || (remainingSeconds !== null && remainingSeconds <= 0));
  const hasReportedTimeOnly = remainingSeconds === null && Boolean(waitTimeText) && !isSleeping;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-semibold tnum transition-colors ${
        isReady
          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
          : isSleeping
            ? 'text-violet-300 bg-violet-500/10 border-violet-500/30'
            : 'text-amber-200 bg-black/40 border-amber-500/25'
      }`}
      title={
        autoComputed
          ? `Auto-estimated from last update${waitSeconds ? ` · original wait ${waitSeconds}s` : ''}`
          : waitTimeText
          ? `Reported: ${waitTimeText}`
          : 'Next claim countdown'
      }
    >
      {isReady ? (
        <>
          <Clock className="w-3 h-3" />
          <span>Ready to Claim</span>
        </>
      ) : isSleeping ? (
        <>
          <Moon className="w-3 h-3" />
          <span>Sleeping</span>
        </>
      ) : isFinishFlip ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin-slow text-amber-300/70" />
          <WatchCountdown totalSeconds={remainingSeconds ?? 0} />
        </>
      ) : hasReportedTimeOnly ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin-slow text-amber-300/70" />
          <span className="font-mono text-amber-200">{waitTimeText}</span>
        </>
      ) : (
        <>
          <Loader2 className="w-3 h-3 animate-spin-slow text-amber-300/70" />
          <WatchCountdown totalSeconds={remainingSeconds ?? 0} />
        </>
      )}
    </div>
  );
}
