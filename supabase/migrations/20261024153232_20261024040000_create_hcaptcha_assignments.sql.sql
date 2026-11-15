/*
# Create hCaptcha assignment tracking table

1. New Tables
- `hcaptcha_assignments`
  - `id` (uuid, primary key)
  - `device_id` (text, which device requested the hCaptcha URL)
  - `url_label` (text, e.g. "URL_1" through "URL_25")
  - `assigned_at` (timestamptz, when assigned)
  - `completed_at` (timestamptz, nullable, when device reported completion)
  - `status` (text, 'assigned' | 'completed' | 'expired')

2. Security
- Enable RLS on `hcaptcha_assignments`.
- Grant SELECT, INSERT, UPDATE to `anon, authenticated` (no-auth app pattern, same as other tables).
- Allow anon + authenticated full CRUD since this is a single-tenant shared dashboard.
*/
CREATE TABLE IF NOT EXISTS hcaptcha_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  url_label text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'assigned'
);

ALTER TABLE hcaptcha_assignments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON hcaptcha_assignments TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_hcaptcha" ON hcaptcha_assignments;
CREATE POLICY "anon_select_hcaptcha" ON hcaptcha_assignments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_hcaptcha" ON hcaptcha_assignments;
CREATE POLICY "anon_insert_hcaptcha" ON hcaptcha_assignments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_hcaptcha" ON hcaptcha_assignments;
CREATE POLICY "anon_update_hcaptcha" ON hcaptcha_assignments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_hcaptcha" ON hcaptcha_assignments;
CREATE POLICY "anon_delete_hcaptcha" ON hcaptcha_assignments FOR DELETE
  TO anon, authenticated USING (true);
