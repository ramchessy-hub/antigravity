/*
# Add pg_cron job to reset daily earnings at midnight IST

## Problem
The daily reset of `today_earnings` and `today_change` only happens when
a device syncs. If no device syncs right after midnight IST, the counters
stay stuck on yesterday's values until the first sync arrives. This cron
job is a safety net that resets all counters at 00:01 IST every day.

## Changes
1. Enables the `pg_cron` extension if not already enabled.
2. Schedules a daily job at 18:31 UTC (= 00:01 IST, +5:30) that:
   - Sets `today_earnings = 0` and `earnings_date = (now() AT TIME ZONE 'Asia/Kolkata')::date`
     for ALL rows in `devices`.
   - Sets `today_change = 0` and `change_date = (now() AT TIME ZONE 'Asia/Kolkata')::date`
     for ALL rows in `coco_balances`.

## Notes
- pg_cron uses UTC, so 18:31 UTC = 00:01 IST (next day).
- The job is idempotent — running it twice on the same day just sets the
  same zero values and same date again.
- Existing cron jobs (if any) are dropped first to avoid duplicates.
*/

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('reset-daily-earnings-ist');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reset-daily-earnings-ist',
  '31 18 * * *',
  $sql$
    UPDATE devices
    SET today_earnings = 0,
        earnings_date = (now() AT TIME ZONE 'Asia/Kolkata')::date;

    UPDATE coco_balances
    SET today_change = 0,
        change_date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
  $sql$
);