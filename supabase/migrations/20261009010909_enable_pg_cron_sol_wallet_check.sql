/*
# Enable pg_cron and schedule hourly Solana wallet check

1. Extensions
- Enable pg_cron extension for scheduled database jobs.

2. Scheduled Jobs
- Create a cron job that runs every hour to call the check-sol-wallet edge function.
- This ensures the Solana wallet is checked every hour regardless of whether the dashboard page is open.
- The edge function checks SOL + USDC balance, gets SOL price, and sends a Telegram alert if total > $100.

3. Security
- No new tables or RLS changes.
- The cron job uses pg_net to make an HTTP request to the edge function.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'check-sol-wallet-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://ekjivkdpczvamcysmxlr.supabase.co/functions/v1/check-sol-wallet',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVraml2a2RwY3p2YW1jeXNteGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0OTE4MzEsImV4cCI6MjEwNzA2NzgzMX0.SKez8C6cPipQyZ5NRQzPqAmBusxzQT2b20Ly03tCYkI"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
