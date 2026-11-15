import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Device = {
  id: string;
  device_id: string;
  token: string | null;
  display_name: string | null;
  sort_order: number;
  daily_target: number;
  last_balance: number | null;
  last_seen_at: string | null;
  is_online: boolean;
  today_earnings: number | null;
  earnings_date: string | null;
  batch: string | null;
  batch_active: boolean;
  lifetime_earnings: number | null;
  lifetime_withdrawn: number | null;
  peak_balance: number | null;
  last_withdrawal_at: string | null;
  last_withdrawal_amount: number | null;
  wait_seconds: number | null;
  wait_time_text: string | null;
  next_claim_at: string | null;
  updated_at: string | null;
  created_at: string;
};

export type BalanceReport = {
  id: string;
  device_id: string;
  balance: number;
  reported_at: string;
};

export type CocoBalance = {
  id: string;
  device_id: string;
  last_balance_text: string | null;
  last_balance_value: number | null;
  last_seen_at: string | null;
  is_online: boolean;
  today_change: number | null;
  change_date: string | null;
  peak_balance: number | null;
  lifetime_withdrawn: number | null;
  lifetime_earnings: number | null;
  last_withdrawal_at: string | null;
  last_withdrawal_amount: number | null;
  created_at: string;
};

export type SolanaWalletCheck = {
  id: string;
  wallet_address: string;
  sol_balance: number | null;
  usdc_balance: number | null;
  total_usd_value: number | null;
  sol_price_usd: number | null;
  alert_triggered: boolean;
  checked_at: string;
};

export type BalanceClaim = {
  id: string;
  device_id: string;
  previous_balance: number | null;
  new_balance: number | null;
  increase_amount: number | null;
  claimed: boolean;
  created_at: string;
};

export type CycleBatch = {
  batch: string;
  device_start: number;
  device_end: number;
  is_current: boolean;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
};

export type DeviceWithdrawal = {
  id: string;
  device_id: string;
  previous_balance: number | null;
  new_balance: number | null;
  withdrawal_amount: number | null;
  detected_at: string;
};

export type WithdrawCommand = {
  id: string;
  command_id: string;
  scope: 'all' | 'single' | 'test';
  target_device_id: string | null;
  status: 'pending' | 'picked_up' | 'executed' | 'failed' | 'expired';
  created_at: string;
  picked_up_at: string | null;
  executed_at: string | null;
  expires_at: string | null;
  created_by: string | null;
};

export type WithdrawCommandAck = {
  id: string;
  command_id: string;
  device_id: string;
  status: 'picked_up' | 'executed' | 'failed';
  message: string | null;
  reported_at: string;
};
