import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ChevronDown, Flame } from 'lucide-react';

type LinkUsage = {
  assigned: number;
  completed: number;
  active?: boolean;
};

type HcaptchaCount = {
  count_today: number;
  completed_today: number;
  total_available: number;
  cycle?: number;
  last_label?: string;
  labels?: string[];
  usage?: Record<string, LinkUsage>;
};

const TOTAL_ROTATION_URLS = 40;

type ChipState = 'unused' | 'active' | 'pending' | 'done';

function chipState(usage: LinkUsage | undefined, hasData: boolean): ChipState {
  if (!usage || usage.assigned === 0) return hasData ? 'unused' : 'unused';
  if (usage.completed > 0) return 'done';
  if (usage.active) return 'active';
  return 'pending';
}

const CHIP_STYLES: Record<ChipState, string> = {
  unused: 'bg-slate-800/60 text-slate-500 border-slate-700/50',
  active: 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse',
  pending: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

export function HcaptchaCounterCard() {
  const [data, setData] = useState<HcaptchaCount | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assign-hcaptcha?action=count`;
        const res = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json && typeof json.count_today === 'number') {
          setData(json);
        }
      } catch {
        // silent
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const assigned = data?.count_today ?? 0;
  const completed = data?.completed_today ?? 0;
  const usage = data?.usage ?? {};
  const hasData = !!data;
  const total = Math.max(TOTAL_ROTATION_URLS, data?.total_available ?? 0, Object.keys(usage).length);
  const cycle = data?.cycle ?? Math.floor(assigned / total) + 1;

  const notFinished = Math.max(0, assigned - completed);

  const chipList = Array.from({ length: total }, (_, i) => {
    const label = `URL_${i + 1}`;
    return { label, num: i + 1, usage: usage[label], state: chipState(usage[label], hasData) };
  });

  const pct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-sky-500/20 bg-sky-950/30 transition-all hover:bg-sky-900/40 cursor-pointer"
        title={`Cycle ${cycle} · ${assigned} assigned, ${completed} completed today`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-[11px] font-semibold text-slate-100 tnum">hCaptcha</span>
        <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-300/90 tnum">
          {completed}<span className="text-slate-500"> done</span>
        </span>
        <span className="text-[9px] sm:text-[10px] font-semibold text-amber-300/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 tnum flex items-center gap-0.5">
          <Flame className="w-2.5 h-2.5 text-amber-400" /> Cycle {cycle}
        </span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 bg-slate-800/70 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-100">hCaptcha Links · Today</div>
              <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded-full border border-sky-700/50 tnum">
                Cycle {cycle}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-slate-950/60 border border-slate-800 py-1.5">
                <div className="text-sm font-bold text-sky-300 tnum">{assigned}</div>
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Assigned</div>
              </div>
              <div className="rounded-md bg-slate-950/60 border border-slate-800 py-1.5">
                <div className="text-sm font-bold text-emerald-300 tnum">{completed}</div>
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Completed</div>
              </div>
              <div className="rounded-md bg-slate-950/60 border border-slate-800 py-1.5">
                <div className="text-sm font-bold text-rose-300 tnum">{notFinished}</div>
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Not finished</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-950 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              {pct}% of today's runs finished · next link after{' '}
              <span className="font-mono text-sky-300">{data?.last_label || 'URL_1'}</span>
            </div>
          </div>

          <div className="p-2.5">
            <div className="grid grid-cols-8 gap-1.5">
              {chipList.map(({ label, num, usage: u, state }) => (
                <div
                  key={label}
                  title={`${label} · assigned ${u?.assigned ?? 0}x, completed ${u?.completed ?? 0}x${
                    state === 'pending' ? ' · run not finished' : ''
                  }`}
                  className={`h-7 rounded-md border flex items-center justify-center text-[10px] font-semibold tnum transition-colors ${CHIP_STYLES[state]}`}
                >
                  {num}
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-emerald-500/60" /> Finished
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-rose-500/50" /> Not finished
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-amber-400/80" /> Running now
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-slate-700" /> Waiting
              </span>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/50 text-[10px] text-slate-400 text-center">
            Links run in order 1–40, then the cycle repeats
          </div>
        </div>
      )}
    </div>
  );
}
