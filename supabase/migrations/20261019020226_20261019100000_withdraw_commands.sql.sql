/*
# Withdraw commands table

1. New Tables
- `withdraw_commands`:
  - `command_id` (text, unique) — short id used by the Tampermonkey script to fetch pending commands
  - `scope` (text, NOT NULL) — 'all' (all devices) or 'single' (one device)
  - `target_device_id` (text, nullable) — required when scope = 'single'
  - `status` (text, NOT NULL DEFAULT 'pending') — pending | picked_up | executed | failed | expired
  - `created_at`, `picked_up_at`, `executed_at`, `expires_at` (timestamptz)
  - `created_by` (text) — optional source label, default 'dashboard'

- `withdraw_command_acks`:
  - `command_id` (text, not null) — references withdraw_commands.command_id
  - `device_id` (text, not null) — the device that picked up / executed the command
  - `status` (text, not null) — picked_up | executed | failed
  - `message` (text) — optional status message from the script
  - `reported_at` (timestamptz, default now())

2. Security
- RLS enabled on both tables.
- anon + authenticated CRUD (single-tenant monitoring app; edge function uses service role for writes).

3. Notes
- The dashboard creates a command with scope='all' (or scope='single', target_device_id=...).
- Each device's Tampermonkey script polls the edge function `trigger-withdraw` to fetch the latest pending
  command for itself, then acks it as picked_up, runs the withdraw flow on the page, and acks executed/failed.
- Commands auto-expire after 10 minutes via the `expires_at` column.
*/

CREATE TABLE IF NOT EXISTS withdraw_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id text UNIQUE NOT NULL,
  scope text NOT NULL DEFAULT 'all',
  target_device_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  picked_up_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '10 minutes'),
  created_by text DEFAULT 'dashboard'
);

ALTER TABLE withdraw_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_withdraw_commands" ON withdraw_commands;
CREATE POLICY "anon_select_withdraw_commands" ON withdraw_commands FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_withdraw_commands" ON withdraw_commands;
CREATE POLICY "anon_insert_withdraw_commands" ON withdraw_commands FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_withdraw_commands" ON withdraw_commands;
CREATE POLICY "anon_update_withdraw_commands" ON withdraw_commands FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_withdraw_commands" ON withdraw_commands;
CREATE POLICY "anon_delete_withdraw_commands" ON withdraw_commands FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_withdraw_commands_status ON withdraw_commands(status);
CREATE INDEX IF NOT EXISTS idx_withdraw_commands_command_id ON withdraw_commands(command_id);

CREATE TABLE IF NOT EXISTS withdraw_command_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id text NOT NULL,
  device_id text NOT NULL,
  status text NOT NULL,
  message text,
  reported_at timestamptz DEFAULT now()
);

ALTER TABLE withdraw_command_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_withdraw_acks" ON withdraw_command_acks;
CREATE POLICY "anon_select_withdraw_acks" ON withdraw_command_acks FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_withdraw_acks" ON withdraw_command_acks;
CREATE POLICY "anon_insert_withdraw_acks" ON withdraw_command_acks FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_withdraw_acks" ON withdraw_command_acks;
CREATE POLICY "anon_update_withdraw_acks" ON withdraw_command_acks FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_withdraw_acks" ON withdraw_command_acks;
CREATE POLICY "anon_delete_withdraw_acks" ON withdraw_command_acks FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_withdraw_acks_command_id ON withdraw_command_acks(command_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_acks_device_id ON withdraw_command_acks(device_id);
