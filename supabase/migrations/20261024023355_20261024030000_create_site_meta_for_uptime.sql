-- Create a site_meta table to store the first-deployed timestamp.
-- This persists across all users and page reloads, so the uptime
-- counter shows time since the site was first published.

CREATE TABLE IF NOT EXISTS site_meta (
  id integer PRIMARY KEY DEFAULT 1,
  first_deployed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT site_meta_single_row CHECK (id = 1)
);

INSERT INTO site_meta (id, first_deployed_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE site_meta ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON site_meta TO anon, authenticated;

CREATE POLICY "read_site_meta" ON site_meta FOR SELECT
  TO anon, authenticated USING (true);
