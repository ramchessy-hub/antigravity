import { TrendingUp, ChevronDown, ChevronUp, Wallet, CheckCircle2 } from 'lucide-react';

const SOL_WALLET_ADDRESS = 'J1n3prFCVFdakCNS1y2gW1WDFS4wZnc4dAr1swXTkBTS';
import { useState } from 'react';
import type { Device, SolanaWalletCheck } from '@/lib/supabase';
import { formatCurrency, deviceDisplayName } from '@/lib/utils';

type WithdrawReadyBannerProps = {
  devices: Device[];
  solCheck: SolanaWalletCheck | null;
};

const DEVICE_THRESHOLD = 0.5;
const SOL_BALANCE_THRESHOLD = 2;
const USDC_BALANCE_THRESHOLD = 50;

export function WithdrawReadyBanner({ devices, solCheck }: WithdrawReadyBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const readyDevices = devices.filter((d) => (d.last_balance ?? 0) >= DEVICE_THRESHOLD);
  const deviceReady = readyDevices.length > 0;
  const usdcReady = (solCheck?.usdc_balance ?? 0) >= USDC_BALANCE_THRESHOLD;
  const solUsdValue = (solCheck?.sol_balance ?? 0) * (solCheck?.sol_price_usd ?? 0);
  const solReady = solUsdValue >= SOL_BALANCE_THRESHOLD;

  const allReady = deviceReady && usdcReady && solReady;

  if (!allReady) return null;

  return (
    <div className="bg-emerald-950/40 border border-emerald-600/50 rounded-2xl backdrop-blur-sm overflow-hidden animate-pulse-soft">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-emerald-950/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          </div>
          <div className="text-left">
            <div className="text-sm sm:text-base font-bold text-emerald-300">
              All Ready for Withdraw · All 3 conditions met
            </div>
            <div className="text-xs text-emerald-400/70">
              <span className="hidden sm:inline">{readyDevices.length} device{readyDevices.length > 1 ? 's' : ''} &ge; ${DEVICE_THRESHOLD} &middot; USDC &ge; ${USDC_BALANCE_THRESHOLD} &middot; SOL &ge; ${SOL_BALANCE_THRESHOLD} (USD)</span>
              <span className="sm:hidden">{readyDevices.length} devices &ge; ${DEVICE_THRESHOLD} · all conditions met</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-emerald-300">
          <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
            <CheckCircle2 className="w-3 h-3" />
            READY
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-emerald-800/40 p-3 sm:p-4 space-y-2 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-emerald-900/30 border border-emerald-700/50">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-200">
                Device balance &ge; ${DEVICE_THRESHOLD}
              </span>
            </div>
            <span className="text-xs font-bold text-emerald-300">
              {readyDevices.length} device{readyDevices.length > 1 ? 's' : ''}
            </span>
          </div>

          {readyDevices
            .slice()
            .sort((a, b) => (b.last_balance ?? 0) - (a.last_balance ?? 0))
            .map((d) => {
              const label = deviceDisplayName(d.display_name, d.sort_order);
              return (
                <div
                  key={d.device_id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-emerald-900/20 border border-emerald-800/40 ml-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-emerald-200 truncate">
                      {label}
                    </div>
                    <div className="text-xs text-emerald-400/60 font-mono truncate">{d.device_id}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-emerald-300">
                      {formatCurrency(d.last_balance ?? 0)}
                    </div>
                  </div>
                </div>
              );
            })}

          <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-emerald-900/30 border border-emerald-700/50">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-200">Solana Wallet</div>
                <div className="text-[10px] text-emerald-400/50 font-mono truncate">{SOL_WALLET_ADDRESS}</div>
              </div>
            </div>
            <div className="text-right shrink-0 flex items-center gap-2 sm:gap-3">
              <div>
                <div className="text-[10px] text-emerald-400/60">SOL</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-300">
                  {solUsdValue.toFixed(2)}$
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-400/60">USDC</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-300">
                  {formatCurrency(solCheck?.usdc_balance ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-400/60">Total</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-300">
                  {formatCurrency(solCheck?.total_usd_value ?? 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
