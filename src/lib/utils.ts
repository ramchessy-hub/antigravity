// 1 BCD / 1 USD = 100 Rs
export const USD_TO_INR = 100;

// IST timezone constant used consistently across all date formatting
const IST_TZ = 'Asia/Kolkata';

export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatInr(usdValue: number): string {
  const inr = usdValue * USD_TO_INR;
  return `₹${inr.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatCurrencyWithInr(value: number): string {
  return `${formatCurrency(value)} · ${formatInr(value)}`;
}

export function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return mins > 0 ? `${diffHours}h ${mins}m ago` : `${diffHours}h ago`;
  }
  if (diffDays === 1) return '1 day ago';
  return `${diffDays}d ago`;
}

export function formatShortDate(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.toLocaleString('en-US', { day: 'numeric', timeZone: IST_TZ });
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: IST_TZ });
  return `${day} ${month}`;
}

export function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST_TZ });
}

// Returns the IST date string in YYYY-MM-DD format
export function istDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TZ });
}

// Returns the start of the current IST day as an ISO timestamp
export function istDayStart(date: Date = new Date()): string {
  const dayStr = istDateString(date);
  return new Date(dayStr + 'T00:00:00+05:30').toISOString();
}

export function deviceDisplayName(displayName: string | null, sortOrder: number | null): string {
  const stableNumber = sortOrder && sortOrder < 999 ? sortOrder : '?';
  const name = displayName || `Dev - ${stableNumber}`;
  const match = name.match(/^Android\s+Device\s*-\s*(.+)$/i);
  return match ? `Dev - ${match[1]}` : name;
}

export const LIVE_THRESHOLD_MS = 20 * 1000; // 20s — script reports every 5s, so >20s = missed pings = offline
export const INACTIVE_THRESHOLD_MS = 15 * 60 * 1000; // 15 min — no DB update = stale row
export const OFFLINE_BANNER_HOURS = 4; // 4h+ shows in the device issue banner
export const OFFLINE_ALERT_HOURS = 6.2; // 6.2h+ triggers a Telegram alert via pg_cron

export function getDeviceStatus(lastSeen: string | null): 'live' | 'offline' {
  if (!lastSeen) return 'offline';
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  return diffMs < LIVE_THRESHOLD_MS ? 'live' : 'offline';
}

export function isDeviceLive(lastSeen: string | null): boolean {
  return getDeviceStatus(lastSeen) === 'live';
}

export function offlineHours(lastSeen: string | null): number {
  if (!lastSeen) return 0;
  const diffMs = Date.now() - new Date(lastSeen).getTime();
  if (diffMs < LIVE_THRESHOLD_MS) return 0;
  return diffMs / (60 * 60 * 1000);
}

export function isSameDay(dateString: string | null): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: IST_TZ });
  const todayStr = istDateString();
  return dateStr === todayStr;
}

// Format a timestamp for display in IST
export function formatIstDateTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}
