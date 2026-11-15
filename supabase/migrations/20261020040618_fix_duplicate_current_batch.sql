-- Fix: multiple batches had is_current=true, causing maybeSingle() to fail
UPDATE cycle_batches SET is_current = false, ended_at = now() WHERE is_current = true AND batch != 'A';
UPDATE cycle_batches SET is_current = true, started_at = COALESCE(started_at, now()), ended_at = NULL WHERE batch = 'A';
