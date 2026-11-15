/*
# Fix daily_earnings view to use previous day's closing balance as opening

## Problem
The daily_earnings view computed first_balance as the first balance_report
on each day. But balance_reports only stores entries when the balance changes.
After a withdrawal resets balance to 0, the first report of the next IST day
already has the increased balance (e.g. 0.06), so earnings = last - first = 0.

This caused all devices to show $0 earnings today after midnight IST, even
though claims were being recorded.

## Fix
Use LAG to carry forward the previous day's last balance as the current
day's opening balance. If there's no prior report (first ever day), fall
back to the first report of that day.

## Security
No changes to RLS or grants. The view is owned by postgres.
*/

CREATE OR REPLACE VIEW daily_earnings AS
WITH daily_balance AS (
  SELECT
    device_id,
    (reported_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
    first_value(balance) OVER (
      PARTITION BY device_id, (reported_at AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY reported_at
    ) AS first_balance,
    last_value(balance) OVER (
      PARTITION BY device_id, (reported_at AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY reported_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS last_balance,
    row_number() OVER (
      PARTITION BY device_id, (reported_at AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY reported_at
    ) AS rn
  FROM balance_reports
),
day_closes AS (
  SELECT DISTINCT ON (device_id, day)
    device_id,
    day,
    last_balance AS day_close
  FROM daily_balance
  ORDER BY device_id, day, rn DESC
),
day_opens AS (
  SELECT
    device_id,
    day,
    COALESCE(
      LAG(day_close) OVER (PARTITION BY device_id ORDER BY day),
      first_balance
    ) AS opening_balance
  FROM day_closes dc
  JOIN LATERAL (
    SELECT first_balance
    FROM daily_balance db
    WHERE db.device_id = dc.device_id AND db.day = dc.day AND db.rn = 1
    LIMIT 1
  ) fb ON true
),
daily_withdrawals AS (
  SELECT
    device_id,
    (detected_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
    COALESCE(sum(withdrawal_amount), 0) AS withdrawals_sum
  FROM device_withdrawals
  GROUP BY device_id, (detected_at AT TIME ZONE 'Asia/Kolkata')::date
)
SELECT
  db.day,
  db.device_id,
  db.first_balance,
  db.last_balance,
  COALESCE(dw.withdrawals_sum, 0) AS withdrawals_sum,
  db.last_balance - dop.opening_balance + COALESCE(dw.withdrawals_sum, 0) AS earnings
FROM daily_balance db
JOIN day_opens dop ON dop.device_id = db.device_id AND dop.day = db.day
LEFT JOIN daily_withdrawals dw ON dw.device_id = db.device_id AND dw.day = db.day
WHERE db.rn = 1;
