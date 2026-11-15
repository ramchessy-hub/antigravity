/*
# Extend withdraw command expiry to 7 days

Previously commands expired after 10 minutes, which means devices that were
offline when "Withdraw All" was clicked would never pick them up.

Now commands persist for 7 days, so devices that come online later (e.g. when
the .bat script boots the MuMu emulators) will still find the pending command
and execute the withdraw.

Also updates the edge function's expiry sweep to use the same 7-day window.
*/

-- Backfill: any currently-pending commands that were about to expire get a fresh 7-day window
UPDATE withdraw_commands
SET expires_at = (created_at AT TIME ZONE 'UTC' + INTERVAL '7 days')
WHERE status = 'pending';
