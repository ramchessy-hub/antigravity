/*
# Daily earnings view from balance reports + withdrawals

1. New Views
- `daily_earnings`: one row per (device_id, day) with computed earnings.
  - `day` (date): the calendar day (UTC)
  - `device_id` (text)
  - `first_balance` (numeric): first balance report of that day
  - `last_balance` (numeric): last balance report of that day
  - `withdrawals_sum` (numeric): sum of withdrawal_amount from device_withdrawals for that day (0 if none)
  - `earnings` (numeric): (last_balance - first_balance) + withdrawals_sum
    — withdrawals are added back so a withdrawal dip doesn't count as negative earnings.

2. Notes
- Earnings for today may be partial (day not over yet).
- Days with only one balance report have earnings = withdrawals_sum only (no balance change yet).
- This view powers the dashboard's Daily / Yesterday / Weekly / Monthly / Yearly stat cards
  with real historical data instead of fake multipliers.
*/

CREATE OR REPLACE VIEW daily_earnings AS
WITH daily_balance AS (
  SELECT
    device_id,
    (reported_at AT TIME ZONE 'UTC')::date AS day,
    FIRST_VALUE(balance) OVER (PARTITION BY device_id, (reported_at AT TIME ZONE 'UTC')::date ORDER BY reported_at) AS first_balance,
    LAST_VALUE(balance) OVER (PARTITION BY device_id, (reported_at AT TIME ZONE 'UTC')::date ORDER BY reported_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_balance,
    ROW_NUMBER() OVER (PARTITION BY device_id, (reported_at AT TIME ZONE 'UTC')::date ORDER BY reported_at) AS rn
  FROM balance_reports
),
daily_withdrawals AS (
  SELECT
    device_id,
    (detected_at AT TIME ZONE 'UTC')::date AS day,
    COALESCE(SUM(withdrawal_amount), 0) AS withdrawals_sum
  FROM device_withdrawals
  GROUP BY device_id, (detected_at AT TIME ZONE 'UTC')::date
)
SELECT
  db.day,
  db.device_id,
  db.first_balance,
  db.last_balance,
  COALESCE(dw.withdrawals_sum, 0) AS withdrawals_sum,
  (db.last_balance - db.first_balance) + COALESCE(dw.withdrawals_sum, 0) AS earnings
FROM daily_balance db
LEFT JOIN daily_withdrawals dw ON dw.device_id = db.device_id AND dw.day = db.day
WHERE db.rn = 1;
