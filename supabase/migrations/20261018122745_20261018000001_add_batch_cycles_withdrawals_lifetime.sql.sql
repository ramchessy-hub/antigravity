/*
# Add batch/cycle tracking, balance history, withdrawals, lifetime earnings

1. Modified Tables
- `devices`:
  - `batch` (text, e.g. 'A','B','C') — computed from sort_order. Batch A = devices 1-6, B = 7-12, etc.
  - `lifetime_earnings` (numeric, default 0) — total earnings ever accrued (never reset).
  - `lifetime_withdrawn` (numeric, default 0) — total balance withdrawn/reduced from peak.
  - `peak_balance` (numeric) — highest balance ever observed for this device.
  - `batch_active` (boolean, default false) — whether this device's batch is currently the running cycle.
  - `last_withdrawal_at` (timestamptz) — timestamp of the most recent detected withdrawal.
  - `last_withdrawal_amount` (numeric) — amount of the most recent detected withdrawal.
- `coco_balances`:
  - `peak_balance` (numeric) — highest BCD balance observed.
  - `lifetime_withdrawn` (numeric, default 0) — total BCD reduced from peak.
  - `last_withdrawal_at` (timestamptz) — timestamp of last detected withdrawal.
  - `last_withdrawal_amount` (numeric) — amount of the last withdrawal.

2. New Tables
- `device_withdrawals`:
  - `id` (uuid, PK)
  - `device_id` (text, not null) — device that had a withdrawal
  - `previous_balance` (numeric) — balance right before the withdrawal
  - `new_balance` (numeric) — balance right after the withdrawal
  - `withdrawal_amount` (numeric) — amount removed (previous - new)
  - `detected_at` (timestamptz, default now()) — when the sync detected it
- `cycle_batches`:
  - `batch` (text, PK) — the batch label e.g. 'A'
  - `device_start` (int) — first device sort_order in the batch (1, 7, 13, ...)
  - `device_end` (int) — last device sort_order in the batch (6, 12, 18, ...)
  - `is_current` (boolean, default false) — whether this batch is currently running
  - `started_at` (timestamptz) — when this batch became current
  - `ended_at` (timestamptz) — when this batch was superseded
  - `notes` (text) — optional notes

3. Security
- RLS enabled on all new tables.
- anon + authenticated CRUD (single-tenant monitoring app; edge function writes via service role).

4. Notes
- Batches are derived from sort_order: 1-6 = A, 7-12 = B, 13-18 = C, 19-24 = D.
- A "withdrawal" is detected when a sync arrives with a balance LOWER than the previously stored last_balance.
  The reduction is recorded as a withdrawal (not negative earnings) and the lifetime_withdrawn counter
  increases. Earnings only count upward deltas, so withdrawn amounts don't get misattributed as losses.
- `peak_balance` tracks the running maximum balance ever seen; it only goes up.
- The cycle_batches table lets the UI display which batch is currently running and rotate batches.
*/

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS batch text,
  ADD COLUMN IF NOT EXISTS lifetime_earnings numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_withdrawn numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_balance numeric,
  ADD COLUMN IF NOT EXISTS batch_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_withdrawal_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_withdrawal_amount numeric;

ALTER TABLE coco_balances
  ADD COLUMN IF NOT EXISTS peak_balance numeric,
  ADD COLUMN IF NOT EXISTS lifetime_withdrawn numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_withdrawal_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_withdrawal_amount numeric;

CREATE TABLE IF NOT EXISTS device_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  previous_balance numeric,
  new_balance numeric,
  withdrawal_amount numeric,
  detected_at timestamptz DEFAULT now()
);

ALTER TABLE device_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_withdrawals" ON device_withdrawals;
CREATE POLICY "anon_select_withdrawals" ON device_withdrawals FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_withdrawals" ON device_withdrawals;
CREATE POLICY "anon_insert_withdrawals" ON device_withdrawals FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_withdrawals" ON device_withdrawals;
CREATE POLICY "anon_update_withdrawals" ON device_withdrawals FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_withdrawals" ON device_withdrawals;
CREATE POLICY "anon_delete_withdrawals" ON device_withdrawals FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_device_withdrawals_device_id ON device_withdrawals(device_id);
CREATE INDEX IF NOT EXISTS idx_device_withdrawals_detected_at ON device_withdrawals(detected_at);

CREATE TABLE IF NOT EXISTS cycle_batches (
  batch text PRIMARY KEY,
  device_start int NOT NULL,
  device_end int NOT NULL,
  is_current boolean DEFAULT false,
  started_at timestamptz,
  ended_at timestamptz,
  notes text
);

ALTER TABLE cycle_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cycle_batches" ON cycle_batches;
CREATE POLICY "anon_select_cycle_batches" ON cycle_batches FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cycle_batches" ON cycle_batches;
CREATE POLICY "anon_insert_cycle_batches" ON cycle_batches FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cycle_batches" ON cycle_batches;
CREATE POLICY "anon_update_cycle_batches" ON cycle_batches FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cycle_batches" ON cycle_batches;
CREATE POLICY "anon_delete_cycle_batches" ON cycle_batches FOR DELETE
TO anon, authenticated USING (true);

-- Seed default batches A..D for up to 24 devices
INSERT INTO cycle_batches (batch, device_start, device_end, is_current, started_at)
VALUES
  ('A', 1, 6, false, null),
  ('B', 7, 12, false, null),
  ('C', 13, 18, false, null),
  ('D', 19, 24, false, null)
ON CONFLICT (batch) DO NOTHING;

-- Mark batch A as the default current batch if none is current
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cycle_batches WHERE is_current = true) THEN
    UPDATE cycle_batches SET is_current = true, started_at = now() WHERE batch = 'A';
  END IF;
END $$;

-- Backfill batch labels on existing devices based on sort_order
UPDATE devices
SET batch = CASE
  WHEN sort_order BETWEEN 1 AND 6 THEN 'A'
  WHEN sort_order BETWEEN 7 AND 12 THEN 'B'
  WHEN sort_order BETWEEN 13 AND 18 THEN 'C'
  WHEN sort_order BETWEEN 19 AND 24 THEN 'D'
  ELSE 'A'
END
WHERE batch IS NULL;

-- Mark devices in the current batch as batch_active
UPDATE devices
SET batch_active = true
WHERE batch = (SELECT batch FROM cycle_batches WHERE is_current = true LIMIT 1);
