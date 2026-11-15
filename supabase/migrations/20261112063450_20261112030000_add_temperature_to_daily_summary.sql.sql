/*
# Add temperature aggregates to battery daily summary

1. Modified Views
- `battery_daily_summary` — rebuilt to include temperature columns:
  - `min_temp_c` — minimum temperature recorded that day (null if no temp data)
  - `max_temp_c` — maximum temperature recorded that day
  - `avg_temp_c` — average temperature rounded to 1 decimal
  - `temp_report_count` — count of reports that had non-null temperature
  - `last_temp_c` — last temperature reading of the day
  - `last_heat_status` — heat status from the last report of the day
- All existing columns are preserved.
2. Security
- View remains `security_invoker` — inherits caller's RLS on `battery_reports`.
- Grant SELECT to `anon, authenticated` preserved.
3. Important Notes
- Temperature columns will be null for days before temperature data was collected.
*/

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
  min(temperature_c) AS min_temp_c,
  max(temperature_c) AS max_temp_c,
  round(avg(temperature_c)::numeric, 1) AS avg_temp_c,
  count(*) FILTER (WHERE temperature_c IS NOT NULL) AS temp_report_count,
  (array_agg(temperature_c ORDER BY reported_at DESC) FILTER (WHERE temperature_c IS NOT NULL))[1] AS last_temp_c,
  (array_agg(heat_status ORDER BY reported_at DESC) FILTER (WHERE heat_status IS NOT NULL))[1] AS last_heat_status
FROM battery_reports
GROUP BY device_id, date_trunc('day', reported_at AT TIME ZONE 'Asia/Kolkata');

ALTER VIEW battery_daily_summary SET (security_invoker = true);

GRANT SELECT ON battery_daily_summary TO anon, authenticated;
