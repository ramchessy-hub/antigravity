/*
# Create coco_balances table for BCD balance tracking

1. New Tables
- `coco_balances`: Tracks BCD (Coco) balances reported from Tampermonkey scripts.
  - `id` (uuid, PK)
  - `device_id` (text, unique) — identifier for the browser/device sending the BCD balance
  - `last_balance_text` (text) — the raw balance string as displayed (e.g. "12.34 BCD$")
  - `last_balance_value` (numeric) — parsed numeric balance value
  - `last_seen_at` (timestamptz) — last sync timestamp
  - `is_online` (boolean) — whether the source is currently live
  - `today_change` (numeric, default 0) — change in balance today
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `coco_balances`.
- Allow anon + authenticated CRUD (single-tenant, no auth app).
- The edge function uses the service role key (bypasses RLS) for writes.

3. Notes
- BCD balance is a single value tracked per browser/device.
- The edge function parses the numeric value from the text and upserts.
- `today_change` accumulates positive deltas throughout the day.
*/

CREATE TABLE IF NOT EXISTS coco_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  last_balance_text text,
  last_balance_value numeric,
  last_seen_at timestamptz,
  is_online boolean DEFAULT false,
  today_change numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coco_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_coco" ON coco_balances;
CREATE POLICY "anon_select_coco" ON coco_balances FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_coco" ON coco_balances;
CREATE POLICY "anon_insert_coco" ON coco_balances FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_coco" ON coco_balances;
CREATE POLICY "anon_update_coco" ON coco_balances FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_coco" ON coco_balances;
CREATE POLICY "anon_delete_coco" ON coco_balances FOR DELETE
TO anon, authenticated USING (true);
