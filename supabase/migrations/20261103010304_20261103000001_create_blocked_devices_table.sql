/*
# Create blocked_devices table for password failure blocklist

## Purpose
When a user fails the page password 5 times, their device fingerprint is
persisted to a blocklist. Blocked devices see only a permanent block screen
and cannot access the dashboard until manually cleared.

## New Tables
- `blocked_devices`
  - `id` (uuid, primary key)
  - `device_fingerprint` (text, unique) — browser-generated fingerprint (user agent + screen + timezone hash)
  - `blocked_reason` (text) — e.g. "5 failed password attempts"
  - `blocked_at` (timestamptz) — when the block was applied
  - `created_at` (timestamptz)

## Security
- Enable RLS on `blocked_devices`.
- Grant CRUD to `anon` + `authenticated` so the page can check/insert blocks.
- All policies use `USING (true)` / `WITH CHECK (true)` because this is a
  single-tenant no-auth app — the blocklist is intentionally publicly readable
  and writable by the page itself.
*/

CREATE TABLE IF NOT EXISTS blocked_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint text UNIQUE NOT NULL,
  blocked_reason text NOT NULL DEFAULT '5 failed password attempts',
  blocked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE blocked_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON blocked_devices TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "anon_select_blocked_devices" ON blocked_devices;
CREATE POLICY "anon_select_blocked_devices"
ON blocked_devices FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blocked_devices" ON blocked_devices;
CREATE POLICY "anon_insert_blocked_devices"
ON blocked_devices FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_blocked_devices" ON blocked_devices;
CREATE POLICY "anon_update_blocked_devices"
ON blocked_devices FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blocked_devices" ON blocked_devices;
CREATE POLICY "anon_delete_blocked_devices"
ON blocked_devices FOR DELETE
TO anon, authenticated USING (true);
