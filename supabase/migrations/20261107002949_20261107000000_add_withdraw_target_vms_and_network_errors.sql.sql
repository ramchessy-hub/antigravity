-- Add new columns to existing withdraw_commands table for per-VM targeting
ALTER TABLE public.withdraw_commands ADD COLUMN IF NOT EXISTS target_vms jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.withdraw_commands ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.withdraw_commands ADD COLUMN IF NOT EXISTS vm int;
ALTER TABLE public.withdraw_commands ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;

-- Network errors table for Tampermonkey restriction reporter
CREATE TABLE IF NOT EXISTS public.network_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  vm int,
  error_message text DEFAULT 'Access restricted from this network',
  element_html text,
  resolved boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.network_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdraw_commands ENABLE ROW LEVEL SECURITY;

-- Policies for network_errors (4 separate per CRUD verb)
DROP POLICY IF EXISTS "anon_select_network_errors" ON public.network_errors;
CREATE POLICY "anon_select_network_errors" ON public.network_errors FOR SELECT
  TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "anon_insert_network_errors" ON public.network_errors;
CREATE POLICY "anon_insert_network_errors" ON public.network_errors FOR INSERT
  TO anon, authenticated, service_role WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_network_errors" ON public.network_errors;
CREATE POLICY "anon_update_network_errors" ON public.network_errors FOR UPDATE
  TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_network_errors" ON public.network_errors;
CREATE POLICY "anon_delete_network_errors" ON public.network_errors FOR DELETE
  TO anon, authenticated, service_role USING (true);

-- Recreate withdraw_commands policies to include service_role
DROP POLICY IF EXISTS "anon_select_withdraw_commands" ON public.withdraw_commands;
CREATE POLICY "anon_select_withdraw_commands" ON public.withdraw_commands FOR SELECT
  TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS "anon_insert_withdraw_commands" ON public.withdraw_commands;
CREATE POLICY "anon_insert_withdraw_commands" ON public.withdraw_commands FOR INSERT
  TO anon, authenticated, service_role WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_withdraw_commands" ON public.withdraw_commands;
CREATE POLICY "anon_update_withdraw_commands" ON public.withdraw_commands FOR UPDATE
  TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_withdraw_commands" ON public.withdraw_commands;
CREATE POLICY "anon_delete_withdraw_commands" ON public.withdraw_commands FOR DELETE
  TO anon, authenticated, service_role USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_network_errors_device_id ON public.network_errors(device_id);
CREATE INDEX IF NOT EXISTS idx_network_errors_resolved ON public.network_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_withdraw_commands_status_created ON public.withdraw_commands(status, created_at);

-- Grant to service_role too
GRANT SELECT, INSERT, UPDATE, DELETE ON public.network_errors TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.withdraw_commands TO anon, authenticated, service_role;
