/*
# Device Offline Alerts — Telegram notifications for devices offline 6.2+ hours

1. New Table: `device_offline_alerts`
   - Tracks which devices have already been alerted (prevents duplicate alerts every 2 minutes)
   - `id` (uuid, primary key)
   - `device_id` (text, not null) — the device that went offline
   - `alerted_at` (timestamptz, default now()) — when the first alert was sent
   - `last_reminder_at` (timestamptz) — when the last reminder was sent (updated every 2 min)
   - Unique constraint on device_id so only one alert row per device exists

2. New Table: `device_offline_settings`
   - Singleton table (id = 1) to store the mute/unmute preference for offline alerts
   - `id` (integer, primary key, default 1, CHECK id = 1)
   - `alerts_enabled` (boolean, default true)
   - `updated_at` (timestamptz, default now())

3. Scheduled Job
   - pg_cron job `check-device-offline-every-2-minutes` runs every 2 minutes
   - Calls the `check-device-offline` edge function via HTTP POST

4. Security
   - RLS enabled on both tables
   - `device_offline_settings`: anon + authenticated can read/update (no-login dashboard)
   - `device_offline_alerts`: only service_role can read/write (internal tracking table)
   - No DELETE policy on either table (rows are managed server-side)
*/

CREATE TABLE IF NOT EXISTS device_offline_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  last_reminder_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS device_offline_alerts_device_id_key
  ON device_offline_alerts (device_id);

ALTER TABLE device_offline_alerts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON device_offline_alerts TO service_role;

DROP POLICY IF EXISTS "anon_select_device_offline_alerts" ON device_offline_alerts;
CREATE POLICY "anon_select_device_offline_alerts" ON device_offline_alerts
  FOR SELECT TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "anon_insert_device_offline_alerts" ON device_offline_alerts;
CREATE POLICY "anon_insert_device_offline_alerts" ON device_offline_alerts
  FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "anon_update_device_offline_alerts" ON device_offline_alerts;
CREATE POLICY "anon_update_device_offline_alerts" ON device_offline_alerts
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "anon_delete_device_offline_alerts" ON device_offline_alerts;
CREATE POLICY "anon_delete_device_offline_alerts" ON device_offline_alerts
  FOR DELETE TO anon, authenticated USING (false);

CREATE TABLE IF NOT EXISTS device_offline_settings (
  id integer PRIMARY KEY DEFAULT 1,
  alerts_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_offline_settings_singleton CHECK (id = 1)
);

INSERT INTO device_offline_settings (id, alerts_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE device_offline_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON device_offline_settings TO anon, authenticated;
GRANT UPDATE ON device_offline_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_offline_settings TO service_role;

DROP POLICY IF EXISTS "anon_select_offline_settings" ON device_offline_settings;
CREATE POLICY "anon_select_offline_settings" ON device_offline_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_offline_settings" ON device_offline_settings;
CREATE POLICY "anon_insert_offline_settings" ON device_offline_settings
  FOR INSERT TO anon, authenticated WITH CHECK (id = 1);

DROP POLICY IF EXISTS "anon_update_offline_settings" ON device_offline_settings;
CREATE POLICY "anon_update_offline_settings" ON device_offline_settings
  FOR UPDATE TO anon, authenticated USING (id = 1) WITH CHECK (id = 1);

DROP POLICY IF EXISTS "anon_delete_offline_settings" ON device_offline_settings;
CREATE POLICY "anon_delete_offline_settings" ON device_offline_settings
  FOR DELETE TO anon, authenticated USING (false);

SELECT cron.schedule(
  'check-device-offline-every-2-minutes',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/check-device-offline',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
