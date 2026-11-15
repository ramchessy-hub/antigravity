export type DeviceStatus = 'live' | 'offline';

export type DeviceRow = {
  device_id: string;
  display_name: string | null;
  sort_order: number;
  daily_target: number;
  last_balance: number | null;
  last_seen_at: string | null;
  is_online: boolean;
  today_earnings: number;
};

export type DashboardStats = {
  totalDevices: number;
  liveCount: number;
  offlineCount: number;
  combinedBalance: number;
  totalToday: number;
  totalYesterday: number;
  totalThisWeek: number;
  totalThisMonth: number;
  totalThisYear: number;
  daysEarning: number;
  dailyTargetPerDevice: number;
  overallDailyTarget: number;
  devicesHitTarget: number;
  achievementPercent: number;
  totalLifetimeEarnings: number;
  totalWithdrawn: number;
};

export type EarningsSummary = {
  totalToday: number;
  totalYesterday: number;
  totalThisWeek: number;
  totalThisMonth: number;
  totalThisYear: number;
  daysEarning: number;
  perDay: { day: string; earnings: number }[];
  perDeviceToday: Record<string, number>;
};
