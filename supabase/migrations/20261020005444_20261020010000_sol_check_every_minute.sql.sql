-- Reschedule the Solana wallet check to run every 1 minute instead of every 30 minutes.
-- This keeps auto-withdraw responsive even when the dashboard page is closed.
SELECT cron.unschedule('check-sol-wallet-every-30-minutes');

SELECT cron.schedule(
  'check-sol-wallet-every-minute',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/check-sol-wallet',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
