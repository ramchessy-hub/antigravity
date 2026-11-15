/*
# Add Batch E and auto-rotate cycle settings

1. Modified Tables
- `cycle_batches`: no schema change, but we seed batch E (devices 25-30).

2. New Rows
- `cycle_batches`: Insert batch 'E' covering devices 25-30 (if not present).

3. Notes
- Batches now span A (1-6), B (7-12), C (13-18), D (19-24), E (25-30).
- Auto-rotation logic is implemented in the new `auto-rotate-batch` edge function which
  checks the current batch: if no device in the current batch has reported in the last
  5 minutes, it advances the current batch to the next letter (A -> B -> C -> D -> E -> A).
- The auto-rotate function is invoked by the sync-device edge function after each sync,
  so rotation happens automatically when a cycle finishes (all devices in current batch offline).
*/

INSERT INTO cycle_batches (batch, device_start, device_end, is_current, started_at)
VALUES ('E', 25, 30, false, null)
ON CONFLICT (batch) DO NOTHING;
