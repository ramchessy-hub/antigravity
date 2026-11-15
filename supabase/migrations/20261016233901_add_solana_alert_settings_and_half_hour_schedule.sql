/*
# Add Solana alert settings and schedule checks every 30 minutes

1. New Tables
- `solana_wallet_settings`: Stores the shared wallet alert preference for this no-login dashboard.
  - `id` (integer, singleton primary key)
  - `alerts_enabled` (boolean, defaults to true) — controls background Telegram alerts.
  - `updated_at` (timestamptz) — when the preference was changed.

2. Modified Scheduled Job
- Replace the hourly `check-sol-wallet` job with a job that runs every 30 minutes.
- The job continues to run when the dashboard page is closed.

3. Security
- Enable RLS on `solana_wallet_settings`.
- Allow anon and authenticated users to read and update the shared setting because this dashboard has no sign-in screen.

4. Important Notes
- Existing wallet check history is preserved.
- The default keeps alerts enabled unless the dashboard mute control is used.
*/

CREATE TABLE IF NOT EXISTS solana_wallet_settings (
  id integer PRIMARY KEY DEFAULT 1,
  alerts_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solana_wallet_settings_singleton CHECK (id = 1)
);

INSERT INTO solana_wallet_settings (id, alerts_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE solana_wallet_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sol_settings" ON solana_wallet_settings;
CREATE POLICY "anon_select_sol_settings" ON solana_wallet_settings FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sol_settings" ON solana_wallet_settings;
CREATE POLICY "anon_insert_sol_settings" ON solana_wallet_settings FOR INSERT
TO anon, authenticated WITH CHECK (id = 1);

DROP POLICY IF EXISTS "anon_update_sol_settings" ON solana_wallet_settings;
CREATE POLICY "anon_update_sol_settings" ON solana_wallet_settings FOR UPDATE
TO anon, authenticated USING (id = 1) WITH CHECK (id = 1);

DROP POLICY IF EXISTS "anon_delete_sol_settings" ON solana_wallet_settings;
CREATE POLICY "anon_delete_sol_settings" ON solana_wallet_settings FOR DELETE
TO anon, authenticated USING (false);

SELECT cron.unschedule('check-sol-wallet-hourly');

SELECT cron.schedule(
  'check-sol-wallet-every-30-minutes',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/check-sol-wallet',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
