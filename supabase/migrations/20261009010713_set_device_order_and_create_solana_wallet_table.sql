/*
# Set device ordering and create solana_wallet_checks table

1. Data Updates
- Set sort_order for all 19 known devices in the user's specified order.
- Devices not yet seen will get their sort_order set when they first sync (via edge function update).

2. New Tables
- `solana_wallet_checks`: Stores Solana wallet balance check results.
  - `id` (uuid, PK)
  - `wallet_address` (text, not null) — the Solana wallet address
  - `sol_balance` (numeric) — SOL balance
  - `usdc_balance` (numeric) — USDC balance
  - `total_usd_value` (numeric) — combined USD value
  - `sol_price_usd` (numeric) — SOL price at check time
  - `alert_triggered` (boolean) — whether alert was sent
  - `checked_at` (timestamptz, default now())

3. Security
- Enable RLS on solana_wallet_checks.
- Allow anon + authenticated SELECT (dashboard reads).
- Allow anon + authenticated INSERT/UPDATE (edge function writes with service role key).

4. Notes
- The edge function checks SOL and USDC balance via Solana RPC.
- Alert is sent via Telegram when total USD value > $100.
- Checks run every hour via the edge function being called by pg_cron or frontend polling.
*/

-- Set device sort orders
UPDATE devices SET sort_order = 1 WHERE device_id = 'device-lk9e6b4';
UPDATE devices SET sort_order = 2 WHERE device_id = 'device-5wj3i1k';
UPDATE devices SET sort_order = 3 WHERE device_id = 'device-ebyrsyx';
UPDATE devices SET sort_order = 4 WHERE device_id = 'device-ioj769i';
UPDATE devices SET sort_order = 5 WHERE device_id = 'device-8n449x2';
UPDATE devices SET sort_order = 6 WHERE device_id = 'device-9mul0zf';
UPDATE devices SET sort_order = 7 WHERE device_id = 'device-dn4gzmh';
UPDATE devices SET sort_order = 8 WHERE device_id = 'device-y96qqpm';
UPDATE devices SET sort_order = 9 WHERE device_id = 'device-j5ubb69';
UPDATE devices SET sort_order = 10 WHERE device_id = 'device-yylmojo';
UPDATE devices SET sort_order = 11 WHERE device_id = 'device-in5rr0';
UPDATE devices SET sort_order = 12 WHERE device_id = 'device-epkkrxg';
UPDATE devices SET sort_order = 13 WHERE device_id = 'device-fwj7x8c';
UPDATE devices SET sort_order = 14 WHERE device_id = 'device-qjhnrgm';
UPDATE devices SET sort_order = 15 WHERE device_id = 'device-a9ho4dl';
UPDATE devices SET sort_order = 16 WHERE device_id = 'decice-bbp05wt';
UPDATE devices SET sort_order = 17 WHERE device_id = 'device-bbp05wt';
UPDATE devices SET sort_order = 18 WHERE device_id = 'device-khkqdcv';
UPDATE devices SET sort_order = 19 WHERE device_id = 'device-2efmowx';
UPDATE devices SET sort_order = 20 WHERE device_id = 'device-4jbbng8';

-- Also handle the misspelled variant
UPDATE devices SET sort_order = 16, device_id = 'device-bbp05wt' WHERE device_id = 'decice-bbp05wt';

CREATE TABLE IF NOT EXISTS solana_wallet_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  sol_balance numeric,
  usdc_balance numeric,
  total_usd_value numeric,
  sol_price_usd numeric,
  alert_triggered boolean DEFAULT false,
  checked_at timestamptz DEFAULT now()
);

ALTER TABLE solana_wallet_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sol_checks" ON solana_wallet_checks;
CREATE POLICY "anon_select_sol_checks" ON solana_wallet_checks FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sol_checks" ON solana_wallet_checks;
CREATE POLICY "anon_insert_sol_checks" ON solana_wallet_checks FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sol_checks" ON solana_wallet_checks;
CREATE POLICY "anon_update_sol_checks" ON solana_wallet_checks FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sol_checks" ON solana_wallet_checks;
CREATE POLICY "anon_delete_sol_checks" ON solana_wallet_checks FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sol_checks_wallet ON solana_wallet_checks(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sol_checks_checked_at ON solana_wallet_checks(checked_at);
