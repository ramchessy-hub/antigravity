-- Add cycle history tracking and a persistent cycle counter.
-- Each time a batch finishes (all its devices go offline) and the next
-- batch starts, we log the completed cycle to cycle_history and bump
-- cycle_counter. The counter cycles 1..8 and wraps around.

CREATE TABLE IF NOT EXISTS cycle_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_number int NOT NULL,
  batch text NOT NULL,
  device_start int NOT NULL,
  device_end int NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cycle_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cycle_history" ON cycle_history;
CREATE POLICY "anon_select_cycle_history" ON cycle_history FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cycle_history" ON cycle_history;
CREATE POLICY "anon_insert_cycle_history" ON cycle_history FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cycle_history" ON cycle_history;
CREATE POLICY "anon_delete_cycle_history" ON cycle_history FOR DELETE
TO anon, authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_cycle_history_created_at ON cycle_history(created_at DESC);

-- Singleton counter table (mirrors solana_wallet_settings pattern)
CREATE TABLE IF NOT EXISTS cycle_counter (
  id integer PRIMARY KEY DEFAULT 1,
  current_cycle int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cycle_counter_singleton CHECK (id = 1)
);

INSERT INTO cycle_counter (id, current_cycle)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE cycle_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cycle_counter" ON cycle_counter;
CREATE POLICY "anon_select_cycle_counter" ON cycle_counter FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_cycle_counter" ON cycle_counter;
CREATE POLICY "anon_update_cycle_counter" ON cycle_counter FOR UPDATE
TO anon, authenticated USING (id = 1) WITH CHECK (id = 1);
