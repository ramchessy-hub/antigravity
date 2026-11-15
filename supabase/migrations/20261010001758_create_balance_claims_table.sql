/*
# Create balance_claims table

1. New Tables
- `balance_claims`: Records every time a device's balance increases.
  - `id` (uuid, PK)
  - `device_id` (text, not null) — which device had the increase
  - `previous_balance` (numeric) — balance before the increase
  - `new_balance` (numeric) — balance after the increase
  - `increase_amount` (numeric) — how much it went up
  - `claimed` (boolean, default false) — whether user acknowledged the claim
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS, allow anon+authenticated full CRUD (no-auth app pattern).
*/

CREATE TABLE IF NOT EXISTS balance_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  previous_balance numeric,
  new_balance numeric,
  increase_amount numeric,
  claimed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE balance_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_claims" ON balance_claims;
CREATE POLICY "anon_select_claims" ON balance_claims FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_claims" ON balance_claims;
CREATE POLICY "anon_insert_claims" ON balance_claims FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_claims" ON balance_claims;
CREATE POLICY "anon_update_claims" ON balance_claims FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_claims" ON balance_claims;
CREATE POLICY "anon_delete_claims" ON balance_claims FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_claims_device ON balance_claims(device_id);
CREATE INDEX IF NOT EXISTS idx_claims_created ON balance_claims(created_at DESC);
