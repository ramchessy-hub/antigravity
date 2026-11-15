/*
# Claims daily summary view

1. New Views
- `claims_daily_summary` — one row per day aggregating all balance claims:
  total claims, claimed count, unclaimed count, total increase amount,
  number of distinct devices with claims, and average increase per claim.
  Grouped by day in IST timezone for consistency with daily_earnings.

2. Security
- View is `security_invoker` so it inherits the caller's RLS on `balance_claims`.
- Grant SELECT to `anon, authenticated` so the frontend can read it.

3. Important Notes
- Computed on-the-fly from `balance_claims` — no data duplication.
- Uses IST (Asia/Kolkata) timezone for day boundaries, matching daily_earnings.
*/

CREATE OR REPLACE VIEW claims_daily_summary AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') AS day,
  count(*) AS total_claims,
  count(*) FILTER (WHERE claimed = true) AS claimed_count,
  count(*) FILTER (WHERE claimed = false OR claimed IS NULL) AS unclaimed_count,
  sum(increase_amount) AS total_increase,
  avg(increase_amount) AS avg_increase,
  count(DISTINCT device_id) AS device_count,
  min(created_at) AS first_claim,
  max(created_at) AS last_claim
FROM balance_claims
GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata');

ALTER VIEW claims_daily_summary SET (security_invoker = true);

GRANT SELECT ON claims_daily_summary TO anon, authenticated;
