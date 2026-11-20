import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DollarSign,
  Globe,
  RefreshCw,
  Server,
  Coins,
  Download,
  Clock,
  Sparkles,
  Sparkle,
  Lock,
  AlertTriangle,
  Thermometer,
  Snowflake,
  Flame,
  Link2 as LinkIcon,
} from 'lucide-react';
import { supabase, type Device, type CocoBalance, type SolanaWalletCheck, type BalanceClaim, type DeviceWithdrawal } from '@/lib/supabase';
import type { DashboardStats, EarningsSummary } from '@/types';
import { formatCurrency, formatInr, getDeviceStatus, isDeviceLive, deviceDisplayName, LIVE_THRESHOLD_MS } from '@/lib/utils';
import { DeviceRow } from '@/components/DeviceRow';
import { EarningsHistory } from '@/components/EarningsHistory';
import { CocoBalanceCard } from '@/components/CocoBalanceCard';
import { SolanaWalletCard } from '@/components/SolanaWalletCard';
import { ClaimToast } from '@/components/ClaimToast';
import { ClaimsFeed } from '@/components/ClaimsFeed';
import { WithdrawalsFeed } from '@/components/WithdrawalsFeed';
import { DeviceIssueBanner } from '@/components/DeviceIssueBanner';
import { WithdrawReadyBanner } from '@/components/WithdrawReadyBanner';
import { DeviceHistoryDrawer } from '@/components/DeviceHistoryDrawer';
import { DownloadsPage } from '@/components/DownloadsPage';
import { CycleHistory, type CycleHistoryEntry } from '@/components/CycleHistory';
import { BatteryHistoryDrawer } from '@/components/BatteryHistoryDrawer';
import { TemperatureDrawer } from '@/components/TemperatureDrawer';
import { ClaimsHistoryDrawer } from '@/components/ClaimsHistoryDrawer';
import { PowerConsumptionCard } from '@/components/PowerConsumptionCard';
import { UpcomingDeviceCard } from '@/components/UpcomingDeviceCard';
import { HcaptchaCounterCard } from '@/components/HcaptchaCounterCard';
import { HcaptchaLinksPage } from '@/components/HcaptchaLinksPage';
import { MissedCycleBanner } from '@/components/MissedCycleBanner';
import { RunIssueBanner } from '@/components/RunIssueBanner';

type BatteryReport = {
  id: string;
  device_id: string;
  battery_percent: number;
  is_charging: boolean;
  temperature_c: number | null;      // GPU temperature
  cpu_temperature_c: number | null;  // CPU temperature
  heat_status: string | null;
  reported_at: string;
  temperature_reported_at?: string | null;
};

function heatChipProps(heat: string | null | undefined) {
  const h = (heat ?? 'cool').toLowerCase();
  if (h === 'boiling') return { icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Boiling' };
  if (h === 'hot') return { icon: Thermometer, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Hot' };
  return { icon: Snowflake, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20', label: 'Cool' };
}

const DAILY_TARGET_PER_DEVICE = 0.16;
const SOL_WALLET_ADDRESS = 'J1n3prFCVFdakCNS1y2gW1WDFS4wZnc4dAr1swXTkBTS';

const AUTH_HASH = '784acb2ea7e1eba6fbe1efd347017591f202d4ca63d7b4c4bd7cd534efa4ec91';
const MAX_PASSWORD_ATTEMPTS = 5;

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getDeviceFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width) + 'x' + String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency || 0),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0),
  ];
  return await sha256(parts.join('|'));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
    }),
  ]);
}

function isDeviceReadyToClaim(device: Device): boolean {
  const normalizedWait = (device.wait_time_text ?? '').trim().toLowerCase();
  const isFinishFlip = normalizedWait.includes('finish') && normalizedWait.includes('flip');
  const isSleeping = normalizedWait === 'sleeping';
  const isEmptyText = normalizedWait === '' || normalizedWait === 'none' || normalizedWait === 'null' || normalizedWait === 'n/a' || normalizedWait === 'no data';
  const offlineTooLong = device.last_seen_at !== null && (Date.now() - new Date(device.last_seen_at).getTime()) >= 3 * 3600 * 1000;
  // Offline 3h+ devices are always ready, even if sleeping or finish flip.
  if (offlineTooLong) return true;
  if (isFinishFlip || isSleeping) return false;
  return (
    device.wait_seconds === 0
    || normalizedWait === 'ready'
    || normalizedWait === 'ready now'
    || normalizedWait === 'claim your drop'
    || (isEmptyText && device.wait_seconds === null)
    || (device.next_claim_at !== null && new Date(device.next_claim_at).getTime() <= Date.now())
  );
}

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const devicesRef = useRef<Device[]>([]);
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  const [cocoBalances, setCocoBalances] = useState<CocoBalance[]>([]);
  const [solCheck, setSolCheck] = useState<SolanaWalletCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [solChecking, setSolChecking] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [offlineAlertsMuted, setOfflineAlertsMuted] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [claims, setClaims] = useState<BalanceClaim[]>([]);
  const todayClaimsRef = useRef<BalanceClaim[]>([]);
  const [withdrawals, setWithdrawals] = useState<DeviceWithdrawal[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<EarningsSummary>({
    totalToday: 0,
    totalYesterday: 0,
    totalThisWeek: 0,
    totalThisMonth: 0,
    totalThisYear: 0,
    daysEarning: 0,
    perDay: [],
    perDeviceToday: {},
  });
  const [historyDevice, setHistoryDevice] = useState<{ deviceId: string; displayName: string | null } | null>(null);
  const [dismissedClaimIds, setDismissedClaimIds] = useState<Set<string>>(new Set());
  const [notificationsMuted, setNotificationsMuted] = useState(() => {
    const stored = localStorage.getItem('balance-notifications-muted');
    return stored === null ? true : stored === 'true';
  });
  const [showDownloads, setShowDownloads] = useState(false);
  const [showHcaptchaLinks, setShowHcaptchaLinks] = useState(false);
  const [battery, setBattery] = useState<BatteryReport | null>(null);
  const [showBatteryHistory, setShowBatteryHistory] = useState(false);
  const [showTempDrawer, setShowTempDrawer] = useState(false);
  const [showClaimsHistory, setShowClaimsHistory] = useState(false);
  const [cycleNumber, setCycleNumber] = useState(1);
  const [rotationNumber, setRotationNumber] = useState(1);
  const [cycleBatch, setCycleBatch] = useState<string | null>(null);
  const [cycleStartedAt, setCycleStartedAt] = useState<string | null>(null);
  const [cycleHistory, setCycleHistory] = useState<CycleHistoryEntry[]>([]);
  const [firstDeployedAt, setFirstDeployedAt] = useState<string | null>(null);
  const [siteUptime, setSiteUptime] = useState(0);
  const [cooldownFilter, setCooldownFilter] = useState<'all' | 'ready' | 'cooldown'>('all');
  const [deviceSort, setDeviceSort] = useState<'default' | 'cooldown'>('default');
  const [animationsOn, setAnimationsOn] = useState(() => {
    const stored = localStorage.getItem('animations-enabled');
    return stored === null ? true : stored === 'true';
  });
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem('page-unlocked') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [windowBlurred, setWindowBlurred] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(() => Number(localStorage.getItem('pw-fail-count') || 0));
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fp = await getDeviceFingerprint();
      if (cancelled) return;
      const { data } = await supabase
        .from('blocked_devices')
        .select('blocked_reason')
        .eq('device_fingerprint', fp)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setIsBlocked(true);
        setBlockReason(data.blocked_reason);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggleAnimations = useCallback(() => {
    setAnimationsOn((on) => {
      const next = !on;
      localStorage.setItem('animations-enabled', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handleBlur = () => setWindowBlurred(true);
    const handleFocus = () => setWindowBlurred(false);
    const handleVisibility = () => setWindowBlurred(document.hidden);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handlePasswordSubmit = useCallback(async () => {
    const hash = await sha256(passwordInput);
    if (hash === AUTH_HASH) {
      setUnlocked(true);
      localStorage.setItem('page-unlocked', 'true');
      localStorage.removeItem('pw-fail-count');
      setFailedAttempts(0);
      setPasswordInput('');
      setPasswordError(false);
    } else {
      const nextCount = failedAttempts + 1;
      setFailedAttempts(nextCount);
      localStorage.setItem('pw-fail-count', String(nextCount));
      setPasswordInput('');
      setPasswordError(true);
      if (nextCount >= MAX_PASSWORD_ATTEMPTS) {
        const fp = await getDeviceFingerprint();
        await supabase
          .from('blocked_devices')
          .upsert({
            device_fingerprint: fp,
            blocked_reason: `${MAX_PASSWORD_ATTEMPTS} failed password attempts`,
          }, { onConflict: 'device_fingerprint' });
        setIsBlocked(true);
        setBlockReason(`${MAX_PASSWORD_ATTEMPTS} failed password attempts`);
      }
    }
  }, [passwordInput, failedAttempts]);

  const handleLock = useCallback(() => {
    setUnlocked(false);
    localStorage.removeItem('page-unlocked');
    setPasswordInput('');
    setPasswordError(false);
  }, []);

  const fetchDevices = useCallback(async () => {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Failed to load devices:', error);
      return;
    }

    if (data) {
      setDevices(data as Device[]);
    }
  }, []);

  const fetchCocoBalances = useCallback(async () => {
    const { data, error } = await supabase
      .from('coco_balances')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load coco balances:', error);
      return;
    }

    if (data) {
      setCocoBalances(data as CocoBalance[]);
    }
  }, []);

  const fetchClaims = useCallback(async () => {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const istDayStart = new Date(todayStr + 'T00:00:00+05:30').toISOString();

    const [recentRes, todayRes] = await Promise.all([
      supabase.from('balance_claims').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('balance_claims').select('*').gte('created_at', istDayStart).order('created_at', { ascending: false }),
    ]);

    if (recentRes.error) {
      console.error('Failed to load claims:', recentRes.error);
      return;
    }

    if (recentRes.data) {
      setClaims(recentRes.data as BalanceClaim[]);
    }

    if (todayRes.data) {
      todayClaimsRef.current = todayRes.data as BalanceClaim[];
    }
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    const { data, error } = await supabase
      .from('device_withdrawals')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to load withdrawals:', error);
      return;
    }

    if (data) {
      setWithdrawals(data as DeviceWithdrawal[]);
    }
  }, []);

  const fetchEarningsSummary = useCallback(async () => {
    // Fetch one row per day (pre-aggregated in the database) instead of
    // per-device rows. The per-device daily_earnings view has 1000+ rows and
    // blows past PostgREST's default response cap, truncating today's data.
    const now = new Date();
    const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const yearStartStr = new Date(todayStr + 'T00:00:00Z');
    yearStartStr.setUTCDate(yearStartStr.getUTCDate() - 365);
    const yearStartFilter = yearStartStr.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('daily_earnings_totals')
      .select('day, total_earnings')
      .gte('day', yearStartFilter)
      .order('day', { ascending: true })
      .limit(1000);

    if (error) {
      console.error('Failed to load earnings summary:', error);
      return;
    }

    if (!data) return;

    const yesterdayDate = new Date(todayStr + 'T00:00:00Z');
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const istTodayMs = new Date(todayStr + 'T00:00:00Z').getTime();
    const weekStartMs = istTodayMs - 7 * 24 * 60 * 60 * 1000;
    const monthStartMs = istTodayMs - 30 * 24 * 60 * 60 * 1000;
    const yearStartMs = istTodayMs - 365 * 24 * 60 * 60 * 1000;

    let totalToday = 0;
    let totalYesterday = 0;
    let totalThisWeek = 0;
    let totalThisMonth = 0;
    let totalThisYear = 0;
    let daysEarning = 0;

    const perDay: { day: string; earnings: number }[] = [];
    for (const row of data as { day: string; total_earnings: number | string }[]) {
      const earnings = Number(row.total_earnings) || 0;
      perDay.push({ day: row.day, earnings });
      daysEarning += 1;
      if (row.day === todayStr) totalToday += earnings;
      if (row.day === yesterdayStr) totalYesterday += earnings;
      const d = new Date(row.day + 'T00:00:00Z').getTime();
      if (d >= weekStartMs) totalThisWeek += earnings;
      if (d >= monthStartMs) totalThisMonth += earnings;
      if (d >= yearStartMs) totalThisYear += earnings;
    }

    // Build perDeviceToday from today's balance_claims — each claim records
    // an increase_amount (a drip). Summing those per device gives the real
    // earnings for today, unaffected by spurious zero readings or withdrawal
    // resets that corrupt the devices.today_earnings field.
    const perDeviceToday: Record<string, number> = {};
    let claimsTodayTotal = 0;
    for (const c of todayClaimsRef.current) {
      const amt = Number(c.increase_amount) || 0;
      perDeviceToday[c.device_id] = (perDeviceToday[c.device_id] ?? 0) + amt;
      claimsTodayTotal += amt;
    }

    // Use claims-based total for today if there are claims; otherwise fall
    // back to the daily_earnings_totals view (which may not have today yet).
    if (claimsTodayTotal > 0) {
      totalToday = Math.round(claimsTodayTotal * 100) / 100;
    }

    setEarningsSummary({
      totalToday,
      totalYesterday,
      totalThisWeek,
      totalThisMonth,
      totalThisYear,
      daysEarning,
      perDay,
      perDeviceToday,
    });
  }, []);

  const fetchBattery = useCallback(async () => {
    const [latestRes, latestGpuRes, latestCpuRes] = await Promise.all([
      supabase
        .from('battery_reports')
        .select('*')
        .eq('device_id', 'laptop')
        .order('reported_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Most recent row that has GPU temperature
      supabase
        .from('battery_reports')
        .select('temperature_c, heat_status, reported_at')
        .eq('device_id', 'laptop')
        .not('temperature_c', 'is', null)
        .order('reported_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Most recent row that has CPU temperature
      supabase
        .from('battery_reports')
        .select('cpu_temperature_c, reported_at')
        .eq('device_id', 'laptop')
        .not('cpu_temperature_c', 'is', null)
        .order('reported_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestRes.error) {
      console.error('Failed to load battery:', latestRes.error);
      return;
    }
    if (latestRes.data) {
      const latest = latestRes.data as BatteryReport;
      setBattery({
        ...latest,
        temperature_c: latestGpuRes.data?.temperature_c ?? null,
        heat_status: latestGpuRes.data?.heat_status ?? latest.heat_status,
        cpu_temperature_c: latestCpuRes.data?.cpu_temperature_c ?? null,
        temperature_reported_at: latestGpuRes.data?.reported_at ?? null,
      });
    }
  }, []);

  const fetchFirstDeployed = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_meta')
      .select('first_deployed_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.error('Failed to load site meta:', error);
      return;
    }
    if (data) setFirstDeployedAt(data.first_deployed_at);
  }, []);

  const fetchCycleData = useCallback(async () => {
    const [counterRes, batchRes, historyRes] = await Promise.all([
      supabase.from('cycle_counter').select('current_cycle, rotation_number').eq('id', 1).maybeSingle(),
      supabase.from('cycle_batches').select('batch, started_at').eq('is_current', true).maybeSingle(),
      supabase.from('cycle_history').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (counterRes.data) {
      setCycleNumber(counterRes.data.current_cycle);
      setRotationNumber(counterRes.data.rotation_number);
    }
    if (batchRes.data) {
      setCycleBatch(batchRes.data.batch);
      setCycleStartedAt(batchRes.data.started_at);
    }
    if (historyRes.data) setCycleHistory(historyRes.data as CycleHistoryEntry[]);
  }, []);

  const handleClaim = useCallback(async (id: string) => {
    const { error } = await supabase.from('balance_claims').update({ claimed: true }).eq('id', id);
    if (error) {
      console.error('Failed to mark claim:', error);
      return;
    }
    setClaims((prev) => prev.map((c) => c.id === id ? { ...c, claimed: true } : c));
  }, []);

  const handleClearAll = useCallback(async () => {
    const unclaimedIds = claims.filter((c) => !c.claimed).map((c) => c.id);
    if (unclaimedIds.length > 0) {
      const { error } = await supabase.from('balance_claims').update({ claimed: true }).in('id', unclaimedIds);
      if (error) {
        console.error('Failed to clear claims:', error);
        return;
      }
    }
    setClaims((prev) => prev.map((c) => ({ ...c, claimed: true })));
  }, [claims]);

  const handleDismissToast = useCallback((id: string) => {
    setDismissedClaimIds((prev) => new Set(prev).add(id));
  }, []);

  const handleToggleMute = useCallback(() => {
    setNotificationsMuted((muted) => {
      const nextMuted = !muted;
      localStorage.setItem('balance-notifications-muted', String(nextMuted));
      return nextMuted;
    });
  }, []);

  const fetchOfflineAlertSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('device_offline_settings')
      .select('alerts_enabled')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('Failed to load offline alert settings:', error);
      return;
    }

    setOfflineAlertsMuted(data ? !data.alerts_enabled : false);
  }, []);

  const handleToggleOfflineAlerts = useCallback(async () => {
    const nextMuted = !offlineAlertsMuted;
    const { error } = await supabase
      .from('device_offline_settings')
      .update({ alerts_enabled: !nextMuted, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) {
      console.error('Failed to update offline alert settings:', error);
      return;
    }

    setOfflineAlertsMuted(nextMuted);
  }, [offlineAlertsMuted]);

  const fetchSolAlertSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('solana_wallet_settings')
      .select('alerts_enabled')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('Failed to load Solana alert settings:', error);
      return;
    }

    setAlertsMuted(data ? !data.alerts_enabled : false);
  }, []);

  const handleToggleSolAlerts = useCallback(async () => {
    const nextMuted = !alertsMuted;
    const { error } = await supabase
      .from('solana_wallet_settings')
      .update({ alerts_enabled: !nextMuted, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) {
      console.error('Failed to update Solana alert settings:', error);
      return;
    }

    setAlertsMuted(nextMuted);
  }, [alertsMuted]);

  const fetchSolCheck = useCallback(async () => {
    const { data, error } = await supabase
      .from('solana_wallet_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Failed to load solana wallet check:', error);
      return;
    }

    setSolCheck(data as SolanaWalletCheck | null);
  }, []);

  const triggerSolCheck = useCallback(async () => {
    setSolChecking(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-sol-wallet`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        await fetchSolCheck();
      }
    } catch (err) {
      console.error('Failed to check solana wallet:', err);
    }
    setSolChecking(false);
  }, [fetchSolCheck]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    let deviceFailed = false;
    try {
      const results = await Promise.allSettled([
        withTimeout(fetchDevices()),
        withTimeout(fetchCocoBalances()),
        withTimeout(fetchSolCheck()),
        withTimeout(fetchSolAlertSettings()),
        withTimeout(fetchOfflineAlertSettings()),
        withTimeout(fetchClaims()),
        withTimeout(fetchWithdrawals()),
        withTimeout(fetchEarningsSummary()),
        withTimeout(fetchCycleData()),
        withTimeout(fetchBattery()),
        withTimeout(fetchFirstDeployed()),
      ]);
      if (results[0].status === 'rejected') deviceFailed = true;
    } finally {
      setLoadError(deviceFailed);
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [fetchDevices, fetchCocoBalances, fetchSolCheck, fetchSolAlertSettings, fetchOfflineAlertSettings, fetchClaims, fetchWithdrawals, fetchEarningsSummary, fetchCycleData, fetchBattery, fetchFirstDeployed]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        fetchDevices(),
        fetchCocoBalances(),
        fetchSolCheck(),
        fetchSolAlertSettings(),
        fetchOfflineAlertSettings(),
        fetchClaims(),
        fetchWithdrawals(),
        fetchEarningsSummary(),
        fetchCycleData(),
        fetchBattery(),
        fetchFirstDeployed(),
      ]);
    } finally {
      setRefreshing(false);
      setLastRefresh(new Date());
    }
  }, [fetchDevices, fetchCocoBalances, fetchSolCheck, fetchSolAlertSettings, fetchOfflineAlertSettings, fetchClaims, fetchWithdrawals, fetchEarningsSummary, fetchCycleData, fetchBattery, fetchFirstDeployed]);

  const handleViewHistory = useCallback((deviceId: string, displayName: string | null) => {
    setHistoryDevice({ deviceId, displayName });
  }, []);

  const handleRename = useCallback(async (deviceId: string, name: string) => {
    const { error } = await supabase.from('devices').update({ display_name: name }).eq('device_id', deviceId);
    if (error) {
      console.error('Failed to rename device:', error);
      return;
    }
    await fetchDevices();
  }, [fetchDevices]);

  const handleDelete = useCallback(async (deviceId: string) => {
    const { error } = await supabase.from('devices').delete().eq('device_id', deviceId);
    if (error) {
      console.error('Failed to delete device:', error);
      return;
    }
    await fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    initialLoad();

    let dataInterval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (dataInterval) return;
      dataInterval = setInterval(() => {
        fetchDevices();
        fetchCocoBalances();
        fetchSolCheck();
        fetchSolAlertSettings();
        fetchOfflineAlertSettings();
        fetchClaims();
        fetchWithdrawals();
        fetchEarningsSummary();
        fetchCycleData();
        fetchBattery();
        fetchFirstDeployed();
        setRefreshKey((k) => k + 1);
      }, 10000);
    };

    const stopPolling = () => {
      if (dataInterval) {
        clearInterval(dataInterval);
        dataInterval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopPolling();
    };
  }, [initialLoad, fetchDevices, fetchCocoBalances, fetchSolCheck, fetchSolAlertSettings, fetchOfflineAlertSettings, fetchClaims, fetchWithdrawals, fetchEarningsSummary, fetchCycleData, fetchBattery, fetchFirstDeployed]);

  useEffect(() => {
    const channel = supabase
      .channel('devices-cooldown-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const deletedId = String(payload.old.device_id ?? '');
          setDevices((current) => current.filter((device) => device.device_id !== deletedId));
          return;
        }

        const incoming = payload.new as unknown as Device;
        if (!incoming.device_id) return;
        setDevices((current) => {
          const index = current.findIndex((device) => device.device_id === incoming.device_id);
          if (index === -1) return [...current, incoming];
          const updated = [...current];
          updated[index] = { ...updated[index], ...incoming };
          return updated;
        });
      })
      .subscribe();

    const cocoChannel = supabase
      .channel('coco-balance-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coco_balances' }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const incoming = payload.new as unknown as CocoBalance;
        if (!incoming.device_id) return;
        setCocoBalances((current) => {
          const index = current.findIndex((c) => c.device_id === incoming.device_id);
          if (index === -1) return [...current, incoming];
          const updated = [...current];
          updated[index] = { ...updated[index], ...incoming };
          return updated;
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(cocoChannel);
    };
  }, []);

  // Live-tick the site uptime based on the first-deployed timestamp
  useEffect(() => {
    if (!firstDeployedAt) return;
    const update = () => setSiteUptime(Date.now() - new Date(firstDeployedAt).getTime());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [firstDeployedAt]);

  // Solana wallet check runs via pg_cron server-side. Only check on first load
  // and when the tab regains focus after being hidden for a while.
  useEffect(() => {
    triggerSolCheck();
    const handleVisibility = () => {
      if (!document.hidden) triggerSolCheck();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [triggerSolCheck]);

  // Live devices first, then offline devices in sort_order 1→N.
  const sortedDevices = [...devices].sort((a, b) => {
    const aLive = getDeviceStatus(a.last_seen_at) === 'live';
    const bLive = getDeviceStatus(b.last_seen_at) === 'live';
    if (aLive !== bLive) return aLive ? -1 : 1;
    return a.sort_order - b.sort_order;
  });


  const filteredDevices = sortedDevices.filter((device) => {
    const isReady = isDeviceReadyToClaim(device);
    if (cooldownFilter === 'ready') return isReady;
    if (cooldownFilter === 'cooldown') return !isReady;
    return true;
  });

  const visibleDevices = deviceSort === 'cooldown'
    ? [...filteredDevices].sort((a, b) => {
        const aSeconds = a.next_claim_at ? (new Date(a.next_claim_at).getTime() - Date.now()) / 1000 : (a.wait_seconds ?? Number.MAX_SAFE_INTEGER);
        const bSeconds = b.next_claim_at ? (new Date(b.next_claim_at).getTime() - Date.now()) / 1000 : (b.wait_seconds ?? Number.MAX_SAFE_INTEGER);
        return Math.max(0, aSeconds) - Math.max(0, bSeconds);
      })
    : filteredDevices;

  const tmConnectedCount = sortedDevices.filter((d) => isDeviceLive(d.last_seen_at)).length;

  const stats: DashboardStats = {
    totalDevices: sortedDevices.length,
    liveCount: sortedDevices.filter((d) => getDeviceStatus(d.last_seen_at) === 'live').length,
    offlineCount: sortedDevices.filter((d) => getDeviceStatus(d.last_seen_at) === 'offline').length,
    combinedBalance: sortedDevices.reduce((sum, d) => sum + (d.last_balance ?? 0), 0),
    totalToday: earningsSummary.totalToday,
    totalYesterday: earningsSummary.totalYesterday,
    totalThisWeek: earningsSummary.totalThisWeek,
    totalThisMonth: earningsSummary.totalThisMonth,
    totalThisYear: earningsSummary.totalThisYear,
    daysEarning: earningsSummary.daysEarning,
    dailyTargetPerDevice: DAILY_TARGET_PER_DEVICE,
    overallDailyTarget: sortedDevices.length * DAILY_TARGET_PER_DEVICE,
    devicesHitTarget: sortedDevices.filter((d) => (earningsSummary.perDeviceToday[d.device_id] ?? 0) >= DAILY_TARGET_PER_DEVICE).length,
    achievementPercent: Math.round(
      Math.min(100, (Object.values(earningsSummary.perDeviceToday).reduce((s, v) => s + v, 0) / Math.max(0.01, sortedDevices.length * DAILY_TARGET_PER_DEVICE)) * 100),
    ),
    totalLifetimeEarnings: sortedDevices.reduce((sum, d) => sum + (d.lifetime_earnings ?? 0), 0),
    totalWithdrawn: sortedDevices.reduce((sum, d) => sum + (d.lifetime_withdrawn ?? 0), 0),
  };

  const unclaimedToasts = notificationsMuted
    ? []
    : claims.filter((c) => !c.claimed && !dismissedClaimIds.has(c.id)).slice(0, 5);

  return (
    <div className={`relative min-h-screen text-slate-100 overflow-x-hidden ${animationsOn ? '' : 'animations-off'}`}>
      {/* Ambient animated background */}
      <div className="fixed inset-0 -z-10 bg-[#070a12]">
        <div className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] rounded-full bg-emerald-500/10 blur-[120px] animate-aurora" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-sky-500/10 blur-[120px] animate-aurora" style={{ animationDelay: '-6s' }} />
        <div className="absolute top-[30%] right-[20%] w-[35vw] h-[35vw] rounded-full bg-teal-500/[0.07] blur-[100px] animate-aurora" style={{ animationDelay: '-12s' }} />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Toast notifications */}
      <ClaimToast claims={unclaimedToasts} onDismiss={handleDismissToast} />

      {/* Block screen — device blocked after 5 failed password attempts */}
      {isBlocked && (
        <div className="fixed inset-0 z-[10001] bg-black flex items-center justify-center select-none">
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <Lock className="w-16 h-16 text-slate-700" strokeWidth={1.5} />
            <h2 className="text-lg font-bold text-slate-600">Device Blocked</h2>
            <p className="text-sm text-slate-700 max-w-sm">
              This device has been blocked due to {blockReason}. Contact the administrator to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Password lock screen — blocks all access until authenticated */}
      {!unlocked && (
        <div className="fixed inset-0 z-[10000] bg-[#070a12] flex items-center justify-center select-none">
          <div className="flex flex-col items-center gap-5 w-full max-w-xs px-6">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Lock className="w-7 h-7 text-slate-500" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <h2 className="text-base font-bold text-slate-300 mb-1">Access Restricted</h2>
              <p className="text-xs text-slate-600">Enter password to continue</p>
            </div>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-200 text-sm outline-none focus:border-slate-500/50 text-center tracking-[0.3em]"
              placeholder="•••••"
              autoFocus
            />
            {passwordError && (
              <p className="text-xs text-red-400 -mt-2">
                Incorrect password. {MAX_PASSWORD_ATTEMPTS - failedAttempts} attempt{MAX_PASSWORD_ATTEMPTS - failedAttempts !== 1 ? 's' : ''} remaining before device is blocked.
              </p>
            )}
            <button
              onClick={handlePasswordSubmit}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-700/80 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
            >
              Unlock
            </button>
          </div>
        </div>
      )}

      {/* Auto-hide overlay — blacks out screen when window loses focus (remote viewing protection) */}
      {unlocked && windowBlurred && (
        <div className="fixed inset-0 z-[9998] bg-black pointer-events-none" />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070a12]/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent" />
              <Server className="relative w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(52,211,153,0.15)]">
                Prasanth
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block -mt-0.5">Device balance monitor</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            {lastRefresh && (
              <span className="text-[10px] sm:text-xs text-slate-500 tnum">
                {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
              </span>
            )}
            <button
              onClick={() => setShowBatteryHistory(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/[0.08] bg-white/[0.03] transition-all hover:bg-white/[0.08] hover:scale-105"
              title={battery?.is_charging ? 'Laptop charger connected' : 'Laptop charger disconnected'}
            >
              <span className="relative flex items-center">
                <span className="relative w-[22px] h-[12px] rounded-[3px] border-[1.5px] border-slate-200/90 p-[1.5px]">
                  <span
                    className={`block h-full rounded-[1px] transition-all duration-500 ${battery?.is_charging ? 'bg-emerald-400' : 'bg-lime-300'}`}
                    style={{ width: `${Math.max(0, Math.min(100, battery?.battery_percent ?? 0))}%` }}
                  />
                  {battery?.is_charging && (
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] leading-none text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)] pointer-events-none">⚡</span>
                  )}
                </span>
                <span className="w-[2px] h-[6px] rounded-r-sm bg-slate-200/90" />
              </span>
              <span className="text-[11px] font-semibold text-slate-100 tnum">
                {battery ? `${battery.battery_percent}%` : '--'}
              </span>
              {battery && (
                <span className={`text-[10px] font-medium ${battery.is_charging ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {battery.is_charging ? 'Charging' : 'On battery'}
                </span>
              )}
            </button>
            {battery && (battery.temperature_c !== null || battery.cpu_temperature_c !== null) && (() => {
              const gpuTemp = battery.temperature_c;
              const cpuTemp = battery.cpu_temperature_c;
              // Use hotter of the two for the chip colour
              const dominantHeat = gpuTemp !== null && cpuTemp !== null
                ? (gpuTemp >= cpuTemp ? battery.heat_status : (cpuTemp >= 75 ? 'boiling' : cpuTemp >= 55 ? 'hot' : 'cool'))
                : battery.heat_status;
              const chip = heatChipProps(dominantHeat);
              const HeatIcon = chip.icon;
              return (
                <button
                  onClick={() => setShowTempDrawer(true)}
                  className={`inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md border ${chip.bg} ${chip.color} tnum hover:scale-105 transition-transform`}
                  title={`Temperatures — GPU: ${gpuTemp !== null ? Math.round(gpuTemp) + '°C' : 'N/A'} · CPU: ${cpuTemp !== null ? Math.round(cpuTemp) + '°C' : 'N/A'}. Tap for details.`}
                >
                  <HeatIcon className="w-3 h-3" />
                  {gpuTemp !== null && <span className="text-[11px] font-semibold">GPU {Math.round(gpuTemp)}°</span>}
                  {gpuTemp !== null && cpuTemp !== null && <span className="text-[10px] opacity-50">·</span>}
                  {cpuTemp !== null && <span className="text-[11px] font-semibold">CPU {Math.round(cpuTemp)}°</span>}
                </button>
              );
            })()}
            <PowerConsumptionCard
              batteryPercent={battery?.battery_percent ?? null}
              isCharging={battery?.is_charging ?? false}
              siteUptimeMs={siteUptime}
            />
            <HcaptchaCounterCard />
            <button
              onClick={() => setShowHcaptchaLinks(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-sky-500/20 bg-sky-950/30 transition-all hover:bg-sky-900/40"
              title="Manage hCaptcha links — add, edit, delete, reorder"
            >
              <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[11px] font-semibold text-slate-300">Links</span>
            </button>
            <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[11px] font-semibold text-emerald-300">{stats.liveCount} live</span>
            </div>
            <button
              onClick={handleLock}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300 transition-all"
              title="Lock page — requires password to access again"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleAnimations}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
                animationsOn
                  ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/15'
                  : 'border-white/[0.08] bg-white/[0.03] text-slate-500 hover:bg-white/[0.08]'
              }`}
              title={animationsOn ? 'Animations on — click to pause all motion' : 'Animations off — click to enable'}
            >
              {animationsOn ? <Sparkles className="w-3.5 h-3.5" /> : <Sparkle className="w-3.5 h-3.5 opacity-50" />}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-slate-300 hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-xs sm:text-sm">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Connection error banner */}
        {loadError && !loading && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-700/50 bg-red-950/40 px-4 sm:px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-red-500/20 border border-red-500/40 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-red-300">Couldn't reach the server</div>
                <div className="text-xs text-red-400/70">Some data may be stale. Tap Refresh to retry.</div>
              </div>
            </div>
            <button
              onClick={() => { setLoadError(false); handleRefresh(); }}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300 hover:bg-red-500/20 transition-colors shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs">Retry</span>
            </button>
          </div>
        )}

        {/* Missed cycle claims — devices that missed their claim window */}
        <MissedCycleBanner devices={sortedDevices} refreshKey={refreshKey} />

        {/* Ready-for-withdraw banner (green) */}
        <WithdrawReadyBanner devices={sortedDevices} solCheck={solCheck} />

        {/* Device issue banner (offline 4h+) */}
        <DeviceIssueBanner devices={sortedDevices} alertsMuted={offlineAlertsMuted} onToggleMute={handleToggleOfflineAlerts} />

        {/* Post-run issues — devices stuck "ready to claim" (IP) or "poring" (hCaptcha) after a run */}
        <RunIssueBanner devices={sortedDevices} refreshKey={refreshKey} />

        {/* Top: Combined balance hero + Coco balance */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Prasanth combined balance */}
          <div className="lg:col-span-2 glass-card sheen p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.15em]">
                    Combined Balance
                  </span>
                </div>
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight tnum bg-gradient-to-br from-white via-white to-slate-500 bg-clip-text text-transparent mb-1">
                  {formatCurrency(stats.combinedBalance)}
                </div>
                <div className="text-lg font-bold text-emerald-400 tnum mb-2">
                  {formatInr(stats.combinedBalance)}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse-soft" />
                    <span className="text-slate-300 font-medium">{stats.liveCount}</span> live
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-slate-600 rounded-full" />
                    <span className="text-slate-300 font-medium">{stats.offlineCount}</span> offline
                  </span>
                  <span className="text-slate-500">· {stats.totalDevices} devices</span>
                </div>
              </div>

              {/* Daily target progress */}
              <div className="lg:w-80 shrink-0">
                <div className="bg-black/30 border border-white/[0.06] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.15em]">
                      Daily Target
                    </span>
                    <span className="text-xs text-slate-500 tnum">
                      {formatCurrency(stats.totalToday)} / {formatCurrency(stats.overallDailyTarget)}
                      <span className="hidden sm:inline text-slate-600"> · {formatInr(stats.totalToday)} / {formatInr(stats.overallDailyTarget)}</span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-white/[0.05] rounded-full overflow-hidden mb-2.5 relative">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-700 ease-out relative"
                      style={{
                        width: `${Math.min(100, (stats.totalToday / Math.max(0.01, stats.overallDailyTarget)) * 100)}%`,
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-bold tnum">
                      {stats.achievementPercent}%
                    </span>
                    <span className="text-slate-500">
                      {stats.devicesHitTarget}/{stats.totalDevices} hit target
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: Upcoming devices + Coco balance */}
          <div className="space-y-4">
            <UpcomingDeviceCard devices={sortedDevices} />
            {loading ? (
              <div className="glass-card p-6 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/5 rounded-xl" />
                  <div className="space-y-1">
                    <div className="h-4 w-24 bg-white/5 rounded" />
                    <div className="h-3 w-16 bg-white/5 rounded" />
                  </div>
                </div>
                <div className="h-8 w-32 bg-white/5 rounded mb-3" />
                <div className="h-8 bg-white/5 rounded" />
              </div>
            ) : cocoBalances.length === 0 ? (
              <div className="glass-card p-6 text-center">
                <Coins className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                <h3 className="text-sm font-medium text-slate-300 mb-1">No Coco data yet</h3>
                <p className="text-xs text-slate-500">
                  BCD balances will appear here once the sync script starts reporting.
                </p>
              </div>
            ) : (
              cocoBalances.map((coco) => (
                <CocoBalanceCard
                  key={coco.device_id}
                  deviceId={coco.device_id}
                  balanceText={coco.last_balance_text}
                  balanceValue={coco.last_balance_value}
                  lastSeenAt={coco.last_seen_at}
                  todayChange={coco.today_change ?? 0}
                  lifetimeEarnings={coco.lifetime_earnings ?? 0}
                  lifetimeWithdrawn={coco.lifetime_withdrawn ?? 0}
                  lastWithdrawalAt={coco.last_withdrawal_at}
                  lastWithdrawalAmount={coco.last_withdrawal_amount}
                />
              ))
            )}
          </div>
        </section>

        {/* Claims feed */}
        <section>
          <ClaimsFeed
            claims={claims}
            onClaim={handleClaim}
            onClearAll={handleClearAll}
            notificationsMuted={notificationsMuted}
            onToggleMute={handleToggleMute}
            onShowHistory={() => setShowClaimsHistory(true)}
            deviceNameMap={new Map(sortedDevices.map((d) => {
              return [d.device_id, deviceDisplayName(d.display_name, d.sort_order)];
            }))}
          />
        </section>

        {/* Batch cycle history (collapsed by default) */}
        <section>
          <CycleHistory
            currentCycle={cycleNumber}
            rotationNumber={rotationNumber}
            currentBatch={cycleBatch}
            currentBatchStartedAt={cycleStartedAt}
            history={cycleHistory}
          />
        </section>

        {/* Withdrawals */}
        <section>
          <WithdrawalsFeed
            withdrawals={withdrawals}
            totalLifetimeWithdrawn={stats.totalWithdrawn}
            deviceNameMap={new Map(sortedDevices.map((d) => {
              return [d.device_id, deviceDisplayName(d.display_name, d.sort_order)];
            }))}
          />
        </section>

        {/* Device list */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold tracking-wide text-slate-200 uppercase">Connected Devices</h2>
              <span title="Tampermonkey-connected devices (seen in last 15s)" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
                TM {tmConnectedCount} / {stats.totalDevices}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {([
              ['all', 'All'],
              ['ready', 'Ready to Claim'],
              ['cooldown', 'On Cooldown'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setCooldownFilter(value)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${cooldownFilter === value ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300'}`}
              >
                {label}
              </button>
            ))}
            <select
              value={deviceSort}
              onChange={(event) => setDeviceSort(event.target.value as 'default' | 'cooldown')}
              className="ml-auto rounded-lg border border-white/[0.08] bg-[#0c1018] px-2.5 py-1 text-[11px] text-slate-400 outline-none focus:border-cyan-400/40"
              aria-label="Sort devices"
            >
              <option value="default">Default order</option>
              <option value="cooldown">Cooldown (Soonest First)</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="glass-card px-4 py-3 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-4 bg-white/5 rounded" />
                    <div className="w-5 h-5 bg-white/5 rounded" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-32 bg-white/5 rounded" />
                      <div className="h-2 w-24 bg-white/5 rounded" />
                    </div>
                    <div className="h-3 w-16 bg-white/5 rounded" />
                    <div className="h-3 w-16 bg-white/5 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleDevices.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Server className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <h3 className="text-base font-medium text-slate-300 mb-1">No devices connected yet</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Devices will appear here automatically once they start sending balance data through the sync script.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleDevices.map((device, index) => {
                const tmConnected = isDeviceLive(device.last_seen_at);
                const stableNumber = device.sort_order && device.sort_order < 999 ? device.sort_order : index + 1;
                const displayName = deviceDisplayName(device.display_name, stableNumber);
                return (
                  <DeviceRow
                    key={device.device_id}
                    deviceId={device.device_id}
                    displayName={displayName}
                    lastBalance={device.last_balance}
                    lastSeenAt={device.last_seen_at}
                    todayEarnings={earningsSummary.perDeviceToday[device.device_id] ?? device.today_earnings ?? 0}
                    dailyTarget={device.daily_target ?? DAILY_TARGET_PER_DEVICE}
                    rank={index + 1}
                    peakBalance={device.peak_balance}
                    lifetimeEarnings={device.lifetime_earnings}
                    lifetimeWithdrawn={device.lifetime_withdrawn}
                    lastWithdrawalAt={device.last_withdrawal_at}
                    lastWithdrawalAmount={device.last_withdrawal_amount}
                    waitSeconds={device.wait_seconds ?? null}
                    waitTimeText={device.wait_time_text ?? null}
                    nextClaimAt={device.next_claim_at ?? null}
                    updatedAt={device.updated_at ?? null}
                    onRename={handleRename}
                    onDelete={handleDelete}
                    onViewHistory={handleViewHistory}
                    isLive={getDeviceStatus(device.last_seen_at) === 'live'}
                    tmConnected={tmConnected}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Earnings history — period cards with change vs prior period */}
        <EarningsHistory summary={earningsSummary} />

        {/* Solana wallet */}
        <section>
          <SolanaWalletCard
            solBalance={solCheck?.sol_balance ?? null}
            usdcBalance={solCheck?.usdc_balance ?? null}
            totalUsdValue={solCheck?.total_usd_value ?? null}
            solPriceUsd={solCheck?.sol_price_usd ?? null}
            lastCheckedAt={solCheck?.checked_at ?? null}
            alertTriggered={solCheck?.alert_triggered ?? false}
            walletAddress={SOL_WALLET_ADDRESS}
            onCheckNow={triggerSolCheck}
            checking={solChecking}
            alertsMuted={alertsMuted}
            onToggleMute={handleToggleSolAlerts}
          />
        </section>

        {/* Downloads */}
        <section className="flex justify-center pb-2">
          <button
            onClick={() => setShowDownloads(true)}
            className="group flex items-center gap-2 px-5 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white hover:border-white/[0.15] transition-all"
          >
            <Download className="w-4 h-4 group-hover:text-emerald-400 transition-colors" />
            Downloads & Setup
          </button>
        </section>

        {/* Footer */}
        <footer className="pt-4 pb-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <Clock className="w-3 h-3 text-emerald-400/70" />
            <span className="font-medium text-slate-400">Site uptime</span>
            <span className="tnum text-emerald-300/80 font-semibold">
              {(() => {
                const days = Math.floor(siteUptime / 86400000);
                const hours = Math.floor((siteUptime % 86400000) / 3600000);
                const mins = Math.floor((siteUptime % 3600000) / 60000);
                const secs = Math.floor((siteUptime % 60000) / 1000);
                if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
                if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
                if (mins > 0) return `${mins}m ${secs}s`;
                return `${secs}s`;
              })()}
            </span>
          </div>
          <p className="text-[11px] text-slate-600">
            Auto-refreshing every 10 seconds · Solana wallet checked every 1 minute in the background · Data synced from Prasanth devices
          </p>
        </footer>
      </main>

      {/* Device history drawer */}
      <DeviceHistoryDrawer
        deviceId={historyDevice?.deviceId ?? ''}
        displayName={historyDevice?.displayName ?? null}
        open={historyDevice !== null}
        onClose={() => setHistoryDevice(null)}
      />

      {/* Battery history drawer */}
      <BatteryHistoryDrawer
        open={showBatteryHistory}
        onClose={() => setShowBatteryHistory(false)}
      />

      {/* Temperature drawer */}
      <TemperatureDrawer
        open={showTempDrawer}
        onClose={() => setShowTempDrawer(false)}
        liveBattery={battery}
      />

      {/* Claims history drawer */}
      <ClaimsHistoryDrawer
        open={showClaimsHistory}
        onClose={() => setShowClaimsHistory(false)}
        deviceNameMap={new Map(sortedDevices.map((d) => {
          return [d.device_id, deviceDisplayName(d.display_name, d.sort_order)];
        }))}
      />

      {/* Downloads page (password-protected) */}
      {showDownloads && (
        <DownloadsPage onClose={() => setShowDownloads(false)} />
      )}

      {/* hCaptcha links manager */}
      <HcaptchaLinksPage open={showHcaptchaLinks} onClose={() => setShowHcaptchaLinks(false)} />
    </div>
  );
}

export default App;
