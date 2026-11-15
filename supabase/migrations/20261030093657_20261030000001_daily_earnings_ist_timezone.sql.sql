/*
# Fix daily earnings view to use IST (Asia/Kolkata) timezone

## Problem
The daily_earnings view and the edge functions both used UTC date for the
"day" boundary. Since the user is in India (IST = UTC+5:30), the daily
counters were resetting at 5:30 AM IST (midnight UTC) instead of midnight
IST. This caused "today" to still show yesterday's data between midnight
and 5:30 AM IST.

## Changes
1. Replaces the `daily_earnings` view to compute `day` using
   `AT TIME ZONE 'Asia/Kolkata'` instead of `AT TIME ZONE 'UTC'`.
   This aligns the view's day boundary with the edge functions'
   IST-based `todayDateString()`.

## Notes
- The view is recreated with `CREATE OR REPLACE` — no data is lost.
- Existing rows in `balance_reports` and `device_withdrawals` are
  re-partitioned into IST calendar days.
*/

CREATE OR REPLACE VIEW daily_earnings AS
WITH daily_balance AS (
  SELECT
    device_id,
    (reported_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
    FIRST_VALUE(balance) OVER (PARTITION BY device_id, (reported_at AT TIME ZONE 'Asia/Kolkata')::date ORDER BY reported_at) AS first_balance,
    LAST_VALUE(balance) OVER (PARTITION BY device_id, (reported_at AT TIME ZONE 'Asia/Kolkata')::date ORDER BY reported_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_balance,
    ROW_NUMBER() OVER (PARTITION BY device_id, (reported_at AT TIME ZONE 'Asia/Kolkata')::date ORDER BY reported_at) AS rn
  FROM balance_reports
),
daily_withdrawals AS (
  SELECT
    device_id,
    (detected_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
    COALESCE(SUM(withdrawal_amount), 0) AS withdrawals_sum
  FROM device_withdrawals
  GROUP BY device_id, (detected_at AT TIME ZONE 'Asia/Kolkata')::date
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