/*
# Rebuild batch cycle system: 7 batches (6 per batch, last 4), 8 rotations/day

## Summary
Previously batches were A-E (5 batches) with 6 devices each, supporting up to 30 devices.
Now there are 40 devices total. The batch system is rebuilt to:
- 7 batches: A(1-6), B(7-12), C(13-18), D(19-24), E(25-30), F(31-36), G(37-40)
- Last batch G has 4 devices (remainder)
- 7 batches completing = 1 full rotation
- 8 full rotations per day
- cycle_counter.current_cycle now represents the batch within the current rotation (1..7)
- cycle_counter.rotation_number tracks which rotation we're on (1..8)

## Changes
1. Fix sort_order for all 21 devices currently at 999, assigning them positions 6-40
   based on their display_name numbers.
2. Rebuild cycle_batches table with 7 batches (A-G), correct device ranges.
3. Update cycle_counter: current_cycle wraps 1..7, add rotation_number (wraps 1..8),
   update total_batches to 7.
4. Reassign batch labels on all devices based on new sort_order.
5. Reset batch A as the current batch, reset cycle to 1, rotation to 1.
*/

-- Step 1: Fix sort_order for all 40 devices based on display_name number
UPDATE devices SET sort_order = 1  WHERE device_id = 'device-lk9e6b4';
UPDATE devices SET sort_order = 2  WHERE device_id = 'device-5wj3i1k';
UPDATE devices SET sort_order = 3  WHERE device_id = 'device-ebyrsyx';
UPDATE devices SET sort_order = 4  WHERE device_id = 'device-i0j769i';
UPDATE devices SET sort_order = 5  WHERE device_id = 'device-8n449x2';
UPDATE devices SET sort_order = 6  WHERE device_id = 'device-89y64u5';
UPDATE devices SET sort_order = 7  WHERE device_id = 'device-kss34ac';
UPDATE devices SET sort_order = 8  WHERE device_id = 'device-9mul0zf';
UPDATE devices SET sort_order = 9  WHERE device_id = 'device-qe7ratd';
UPDATE devices SET sort_order = 10 WHERE device_id = 'device-3r1x99m';
UPDATE devices SET sort_order = 11 WHERE device_id = 'device-dn4gzmh';
UPDATE devices SET sort_order = 12 WHERE device_id = 'device-y96qqpm';
UPDATE devices SET sort_order = 13 WHERE device_id = 'device-j5ubb69';
UPDATE devices SET sort_order = 14 WHERE device_id = 'device-yylmojo';
UPDATE devices SET sort_order = 15 WHERE device_id = 'device-in5rrr0';
UPDATE devices SET sort_order = 16 WHERE device_id = 'device-epkkrxg';
UPDATE devices SET sort_order = 17 WHERE device_id = 'device-fwj7x8c';
UPDATE devices SET sort_order = 18 WHERE device_id = 'device-qjhnrgm';
UPDATE devices SET sort_order = 19 WHERE device_id = 'device-a9ho4dl';
UPDATE devices SET sort_order = 20 WHERE device_id = 'device-bbp05wt';
UPDATE devices SET sort_order = 21 WHERE device_id = 'device-khkqdcv';
UPDATE devices SET sort_order = 22 WHERE device_id = 'device-2efmowx';
UPDATE devices SET sort_order = 23 WHERE device_id = 'device-4jbbng8';
UPDATE devices SET sort_order = 24 WHERE device_id = 'device-7zryt0f';
UPDATE devices SET sort_order = 25 WHERE device_id = 'device-h86smhy';
UPDATE devices SET sort_order = 26 WHERE device_id = 'device-y50tpn8';
UPDATE devices SET sort_order = 27 WHERE device_id = 'device-rv0hwaz';
UPDATE devices SET sort_order = 28 WHERE device_id = 'device-ug4hcy2';
UPDATE devices SET sort_order = 29 WHERE device_id = 'device-na5s6so';
UPDATE devices SET sort_order = 30 WHERE device_id = 'device-8lxebne';
UPDATE devices SET sort_order = 31 WHERE device_id = 'device-pzyq2x1';
UPDATE devices SET sort_order = 32 WHERE device_id = 'device-tpyqqbq';
UPDATE devices SET sort_order = 33 WHERE device_id = 'device-6pk79hn';
UPDATE devices SET sort_order = 34 WHERE device_id = 'device-ibzsb97';
UPDATE devices SET sort_order = 35 WHERE device_id = 'device-wmhoi13';
UPDATE devices SET sort_order = 36 WHERE device_id = 'device-j4u0omj';
UPDATE devices SET sort_order = 37 WHERE device_id = 'device-zj4x21j';
UPDATE devices SET sort_order = 38 WHERE device_id = 'device-0is7tlp';
UPDATE devices SET sort_order = 39 WHERE device_id = 'device-725d2xn';
UPDATE devices SET sort_order = 40 WHERE device_id = 'device-36ytkwb';

-- Step 2: Rebuild cycle_batches — clear old batches and insert new 7-batch layout
DELETE FROM cycle_batches;

INSERT INTO cycle_batches (batch, device_start, device_end, is_current, started_at, ended_at, notes)
VALUES
  ('A', 1,  6,  true,  now(), null, 'Batch A: devices 1-6'),
  ('B', 7,  12, false, null,  null, 'Batch B: devices 7-12'),
  ('C', 13, 18, false, null,  null, 'Batch C: devices 13-18'),
  ('D', 19, 24, false, null,  null, 'Batch D: devices 19-24'),
  ('E', 25, 30, false, null,  null, 'Batch E: devices 25-30'),
  ('F', 31, 36, false, null,  null, 'Batch F: devices 31-36'),
  ('G', 37, 40, false, null,  null, 'Batch G: devices 37-40 (last batch, 4 devices)');

-- Step 3: Update cycle_counter for new 7-batch rotation system
-- current_cycle = batch within rotation (1..7), rotation_number = which rotation (1..8)
UPDATE cycle_counter
SET current_cycle = 1,
    rotation_number = 1,
    total_batches = 7,
    round_started_at = now(),
    cycle_date = (now() AT TIME ZONE 'UTC')::date,
    updated_at = now()
WHERE id = 1;

-- Step 4: Reassign batch labels on all devices based on new sort_order
UPDATE devices
SET batch = CASE
  WHEN sort_order BETWEEN 1  AND 6  THEN 'A'
  WHEN sort_order BETWEEN 7  AND 12 THEN 'B'
  WHEN sort_order BETWEEN 13 AND 18 THEN 'C'
  WHEN sort_order BETWEEN 19 AND 24 THEN 'D'
  WHEN sort_order BETWEEN 25 AND 30 THEN 'E'
  WHEN sort_order BETWEEN 31 AND 36 THEN 'F'
  WHEN sort_order BETWEEN 37 AND 40 THEN 'G'
  ELSE 'A'
END;

-- Step 5: Set batch_active flags — only batch A devices are active
UPDATE devices SET batch_active = false;
UPDATE devices SET batch_active = true WHERE batch = 'A';