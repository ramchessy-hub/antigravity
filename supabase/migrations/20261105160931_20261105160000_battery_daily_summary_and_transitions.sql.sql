/*
# Battery daily summary and power-cut transitions views

1. New Views
- `battery_daily_summary` — one row per device per day, aggregating min/max/avg battery percent,
  charging time percentage, report count, and whether any power cut occurred that day.
  Computed from `battery_reports` using `date_trunc('day', reported_at)`.
- `battery_power_cut_transitions` — one row per charging→not-charging transition (power cut event),
  with disconnect time, reconnect time, duration, battery at disconnect/reconnect, min battery during cut,
  and battery drop. Uses LAG/window functions over the raw reports ordered by time.

2. Security
- Both views are `security_invoker` so they inherit the caller's RLS on `battery_reports`.
- Grant SELECT to `anon, authenticated` so the frontend can read them.

3. Important Notes
- Views are computed on-the-fly from `battery_reports` — no data duplication.
- The transitions view filters to only rows where charging went from true→false,
  then finds the next true (reconnect) to compute duration.
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
  max(reported_at) AS last_report
FROM battery_reports
GROUP BY device_id, date_trunc('day', reported_at AT TIME ZONE 'Asia/Kolkata');

ALTER VIEW battery_daily_summary SET (security_invoker = true);

GRANT SELECT ON battery_daily_summary TO anon, authenticated;

CREATE OR REPLACE VIEW battery_power_cut_transitions AS
WITH ordered AS (
  SELECT
    device_id,
    battery_percent,
    is_charging,
    reported_at,
    LAG(is_charging) OVER (PARTITION BY device_id ORDER BY reported_at) AS prev_charging,
    LAG(battery_percent) OVER (PARTITION BY device_id ORDER BY reported_at) AS prev_pct
  FROM battery_reports
),
disconnects AS (
  SELECT
    device_id,
    battery_percent AS battery_at_disconnect,
    reported_at AS disconnected_at,
    row_number() OVER (PARTITION BY device_id ORDER BY reported_at) AS rn
  FROM ordered
  WHERE prev_charging = true AND is_charging = false
),
-- For each disconnect, find the next report where charging=true again (reconnect)
reconnects AS (
  SELECT
    d.device_id,
    d.battery_at_disconnect,
    d.disconnected_at,
    d.rn,
    r.reported_at AS reconnected_at,
    r.battery_percent AS battery_at_reconnect,
    (
      SELECT min(b2.battery_percent)
      FROM battery_reports b2
      WHERE b2.device_id = d.device_id
        AND b2.reported_at >= d.disconnected_at
        AND b2.reported_at < r.reported_at
        AND b2.is_charging = false
    ) AS min_battery_during_cut
  FROM disconnects d
  CROSS JOIN LATERAL (
    SELECT reported_at, battery_percent
    FROM battery_reports b
    WHERE b.device_id = d.device_id
      AND b.reported_at > d.disconnected_at
      AND b.is_charging = true
    ORDER BY reported_at
    LIMIT 1
  ) r
)
SELECT
  device_id,
  battery_at_disconnect,
  disconnected_at,
  reconnected_at,
  EXTRACT(EPOCH FROM (reconnected_at - disconnected_at)) * 1000 AS duration_ms,
  battery_at_reconnect,
  COALESCE(min_battery_during_cut, battery_at_disconnect) AS min_battery,
  GREATEST(battery_at_disconnect - COALESCE(min_battery_during_cut, battery_at_disconnect), 0) AS battery_drop
FROM reconnects

UNION ALL

-- Also include ongoing cuts (disconnected, never reconnected yet)
SELECT
  d.device_id,
  d.battery_at_disconnect,
  d.disconnected_at,
  NULL::timestamptz AS reconnected_at,
  NULL::bigint AS duration_ms,
  NULL::integer AS battery_at_reconnect,
  (
    SELECT min(b2.battery_percent)
    FROM battery_reports b2
    WHERE b2.device_id = d.device_id
      AND b2.reported_at >= d.disconnected_at
      AND b2.is_charging = false
  ) AS min_battery,
  GREATEST(
    d.battery_at_disconnect - COALESCE(
      (SELECT min(b2.battery_percent) FROM battery_reports b2 WHERE b2.device_id = d.device_id AND b2.reported_at >= d.disconnected_at AND b2.is_charging = false),
      d.battery_at_disconnect
    ), 0
  ) AS battery_drop
FROM disconnects d
WHERE NOT EXISTS (
  SELECT 1 FROM battery_reports b
  WHERE b.device_id = d.device_id
    AND b.reported_at > d.disconnected_at
    AND b.is_charging = true
)
ORDER BY disconnected_at DESC;

ALTER VIEW battery_power_cut_transitions SET (security_invoker = true);

GRANT SELECT ON battery_power_cut_transitions TO anon, authenticated;
