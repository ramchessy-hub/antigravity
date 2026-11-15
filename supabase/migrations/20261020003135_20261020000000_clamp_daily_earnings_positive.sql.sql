-- Recreate daily_earnings with earnings clamped to >= 0.
-- A balance drop without a recorded withdrawal is a device restart / reset, not a loss,
-- so it must never show as negative earnings.
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
  GREATEST((db.last_balance - db.first_balance) + COALESCE(dw.withdrawals_sum, 0), 0) AS earnings
FROM daily_balance db
LEFT JOIN daily_withdrawals dw ON dw.device_id = db.device_id AND dw.day = db.day
WHERE db.rn = 1;
