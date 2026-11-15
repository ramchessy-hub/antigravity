-- One row per day with total earnings summed across all devices.
-- This keeps the client query tiny (~366 rows for a year) instead of
-- 16,000+ per-device rows that blow past PostgREST's response cap.

CREATE OR REPLACE VIEW daily_earnings_totals AS
SELECT
  day,
  SUM(earnings) AS total_earnings,
  COUNT(DISTINCT device_id) AS device_count
FROM daily_earnings
GROUP BY day;

GRANT SELECT ON daily_earnings_totals TO anon, authenticated;
