/*
# Add daily reset tracking columns

1. Modified Tables
- `devices`: Add `earnings_date` (date) to track when today_earnings was last reset.
- `coco_balances`: Add `change_date` (date) to track when today_change was last reset.

2. Notes
- When a sync comes in on a new day, the edge function resets today_earnings/today_change to 0.
- This fixes the bug where daily counters never reset at midnight.
*/

ALTER TABLE devices ADD COLUMN IF NOT EXISTS earnings_date date;
ALTER TABLE coco_balances ADD COLUMN IF NOT EXISTS change_date date;
