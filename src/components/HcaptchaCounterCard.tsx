import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ChevronDown, CheckCircle2, Flame } from 'lucide-react';

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
    const interval = setInterval(fetchCount, 5000); // Fast 5s polling
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

  const count = data?.count_today ?? 0;
  const completed = data?.completed_today ?? 0;
  const usageKeys = data?.labels ?? (data?.usage ? Object.keys(data.usage) : []);
  const total = Math.max(TOTAL_ROTATION_URLS, data?.total_available ?? 0, usageKeys.length);
  const cycle = data?.cycle ?? Math.floor(count / total) + 1;

  const labelList = Array.from({ length: total }, (_, i) => `URL_${i + 1}`);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-sky-500/20 bg-sky-950/30 transition-all hover:bg-sky-900/40 cursor-pointer"
        title={`Aggressive 1–${total} Rotation · Cycle ${cycle} · ${count} assigned, ${completed} completed`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-[11px] font-semibold text-slate-100 tnum">
          hCaptcha {count}/{total}
        </span>
        <span className="text-[9px] sm:text-[10px] font-semibold text-amber-300/90 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 tnum flex items-center gap-0.5">
          <Flame className="w-2.5 h-2.5 text-amber-400" /> C{cycle}
        </span>
        {completed > 0 && (
          <span className="text-[9px] sm:text-[10px] font-medium text-emerald-300/80 tnum">
            {completed} done
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-slate-800/70 border-b border-slate-700/50 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-100">
                Aggressive Rotation (1–{total})
              </div>
              <div className="text-[10px] text-slate-400">
                Cycle {cycle} · Next up after {data?.last_label || 'URL_1'}
              </div>
            </div>
            <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded-full border border-sky-700/50">
              {completed}/{count} Done
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto p-2 divide-y divide-slate-800/40">
            <div className="grid grid-cols-3 text-[10px] font-semibold text-slate-400 px-2 pb-1">
              <span>Link (1–{total})</span>
              <span className="text-center">Assigned</span>
              <span className="text-right">Completed</span>
            </div>
            {labelList.map((label) => {
              const usageInfo = data?.usage?.[label] || { assigned: 0, completed: 0, active: false };
              const isUsed = usageInfo.assigned > 0;
              const isDone = usageInfo.completed > 0;
              const isActive = usageInfo.active;

              return (
                <div
                  key={label}
                  className={`grid grid-cols-3 text-[11px] items-center px-2 py-1.5 rounded ${
                    isActive ? 'bg-sky-950/60 border border-sky-700/40' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <span className={`font-mono font-medium flex items-center gap-1.5 ${isUsed ? 'text-sky-300' : 'text-slate-500'}`}>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                    {label}
                  </span>
                  <div className="text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        isUsed
                          ? 'bg-sky-950 text-sky-300 border border-sky-800/40'
                          : 'text-slate-600'
                      }`}
                    >
                      {usageInfo.assigned}x
                    </span>
                  </div>
                  <div className="text-right flex items-center justify-end gap-1">
                    {isDone ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> {usageInfo.completed}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">0</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/50 text-[10px] text-slate-400 text-center">
            Least-used priority · Continuous 24/7 loop
          </div>
        </div>
      )}
    </div>
  );
}