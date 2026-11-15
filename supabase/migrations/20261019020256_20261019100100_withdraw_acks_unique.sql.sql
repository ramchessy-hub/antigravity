/*
# Unique constraint on withdraw_command_acks

1. Changes
- Add unique constraint on (command_id, device_id) so the edge function can upsert acks.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdraw_acks_command_device_unique
ON withdraw_command_acks(command_id, device_id);
