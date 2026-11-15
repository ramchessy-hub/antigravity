/*
# Add CPU temperature to battery_reports and update daily summary

1. Modified Tables
- `battery_reports` — add `cpu_temperature_c` (double precision) for CPU temp readings.
  The existing `temperature_c` column is renamed conceptually to GPU temperature but
  kept as-is for backward compatibility. cpu_temperature_c is nullable.

2. Modified Views
- `battery_daily_summary` — rebuilt to include cpu temperature aggregates:
  - `min_cpu_temp_c`, `max_cpu_temp_c`, `avg_cpu_temp_c` — CPU temperature stats per day
  - `last_cpu_temp_c` — last CPU temperature reading of the day
  All existing GPU temperature columns retained.

3. Security
- View remains security_invoker. Grant SELECT to anon, authenticated preserved.
*/

ALTER TABLE battery_reports
  ADD COLUMN IF NOT EXISTS cpu_temperature_c double precision;

CREATE OR REPLACE VIEW battery_daily_summary AS
SELECT
  device_id,
  date_trunc('day', reported_at AT TIME ZONE 'Asia/Kolkata') AS day,
  min(battery_percent) AS min_pct,
  max(battery_percent) AS max_pct,
  round(avg(battery_percent)) AS avg_pct,
  count(*) AS report_count,
  count(*) FILTER (WHERE is_charging) AS charging_count,
  round(100.0 * count(*) FILTER (WHERE is_charging) / nullif(count(*), 0), 1) AS charging_pct,
  min(reported_at) AS first_report,
  max(reported_at) AS last_report,
  -- GPU temperature
  min(temperature_c) AS min_temp_c,
  max(temperature_c) AS max_temp_c,
  round(avg(temperature_c)::numeric, 1) AS avg_temp_c,
  count(*) FILTER (WHERE temperature_c IS NOT NULL) AS temp_report_count,
  (array_agg(temperature_c ORDER BY reported_at DESC) FILTER (WHERE temperature_c IS NOT NULL))[1] AS last_temp_c,
  (array_agg(heat_status ORDER BY reported_at DESC) FILTER (WHERE heat_status IS NOT NULL))[1] AS last_heat_status,
  -- CPU temperature
  min(cpu_temperature_c) AS min_cpu_temp_c,
  max(cpu_temperature_c) AS max_cpu_temp_c,
  round(avg(cpu_temperature_c)::numeric, 1) AS avg_cpu_temp_c,
  count(*) FILTER (WHERE cpu_temperature_c IS NOT NULL) AS cpu_temp_report_count,
  (array_agg(cpu_temperature_c ORDER BY reported_at DESC) FILTER (WHERE cpu_temperature_c IS NOT NULL))[1] AS last_cpu_temp_c
FROM battery_reports
GROUP BY device_id, date_trunc('day', reported_at AT TIME ZONE 'Asia/Kolkata');

ALTER VIEW battery_daily_summary SET (security_invoker = true);

GRANT SELECT ON battery_daily_summary TO anon, authenticated;
