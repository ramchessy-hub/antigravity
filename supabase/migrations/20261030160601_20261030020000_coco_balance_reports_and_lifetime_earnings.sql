/*
# Add coco_balance_reports table + lifetime_earnings column to coco_balances

## Purpose
Track per-sync coco balance reports so today_change can be computed from
first-to-last balance of the IST day (immune to ±0.01 oscillation noise),
and add lifetime_earnings tracking to coco_balances.

## Changes
1. New table `coco_balance_reports` — stores every balance reading from sync-coco
2. New column `lifetime_earnings` on `coco_balances` — total earnings since device creation
3. New column `lifetime_earnings` populated from existing data (last_balance_value + lifetime_withdrawn)

## Security
- RLS enabled on coco_balance_reports
- CRUD granted to anon + authenticated (single-tenant, no auth)
- service_role granted for edge function access
*/

CREATE TABLE IF NOT EXISTS coco_balance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  balance_value numeric,
  reported_at timestamptz DEFAULT now()
);

ALTER TABLE coco_balance_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON coco_balance_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON coco_balance_reports TO service_role;

DROP POLICY IF EXISTS "anon_select_coco_reports" ON coco_balance_reports;
CREATE POLICY "anon_select_coco_reports" ON coco_balance_reports FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_coco_reports" ON coco_balance_reports;
CREATE POLICY "anon_insert_coco_reports" ON coco_balance_reports FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_coco_reports" ON coco_balance_reports;
CREATE POLICY "anon_update_coco_reports" ON coco_balance_reports FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_coco_reports" ON coco_balance_reports;
CREATE POLICY "anon_delete_coco_reports" ON coco_balance_reports FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_coco_balance_reports_device_time
ON coco_balance_reports(device_id, reported_at);

-- Add lifetime_earnings column to coco_balances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'coco_balances' AND column_name = 'lifetime_earnings'
  ) THEN
    ALTER TABLE coco_balances ADD COLUMN lifetime_earnings numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Populate lifetime_earnings from existing data
UPDATE coco_balances
SET lifetime_earnings = COALESCE(last_balance_value, 0) + COALESCE(lifetime_withdrawn, 0)
WHERE lifetime_earnings = 0 AND last_balance_value IS NOT NULL;

-- Fix any inflated today_change values: recompute from first-to-last balance of today (IST)
WITH today_first AS (
  SELECT
    cbr.device_id,
    (SELECT cbr2.balance_value FROM coco_balance_reports cbr2
     WHERE cbr2.device_id = cbr.device_id
     AND cbr2.reported_at >= ((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamptz
     ORDER BY cbr2.reported_at ASC LIMIT 1) AS first_balance
  FROM (SELECT DISTINCT device_id FROM coco_balances) cbr
)
UPDATE coco_balances cb
SET today_change = GREATEST(0, COALESCE(cb.last_balance_value, 0) - COALESCE(tf.first_balance, cb.last_balance_value)),
    change_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
FROM today_first tf
WHERE cb.device_id = tf.device_id;
