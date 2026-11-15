/*
# Add wait-time columns to devices table

1. New Columns (on `devices`)
- `wait_seconds` (integer, nullable) — seconds until the device's next claim becomes available, as reported by the Tampermonkey script.
- `wait_time_text` (text, nullable) — human-readable wait-time string (e.g. "00:14:32") shown in the dashboard.
- `next_claim_at` (timestamptz, nullable) — absolute timestamp when the next claim is expected to be ready, computed server-side as now() + wait_seconds.
- `updated_at` (timestamptz, nullable, default now()) — last time the device row was written by sync-device.

2. Security
- No new tables. Existing RLS policies on `devices` still apply.
- No policy or grant changes needed: the new columns are covered by the existing column-level privileges already granted to `anon` and `authenticated`.
*/

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS wait_seconds integer,
  ADD COLUMN IF NOT EXISTS wait_time_text text,
  ADD COLUMN IF NOT EXISTS next_claim_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
