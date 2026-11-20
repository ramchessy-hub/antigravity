/*
# hCaptcha link manager: links table, rotation pointer, atomic assignment (retry)

Same as previous attempt; fixed next_label subquery to compare hcaptcha_links.position
(integer) with v_following instead of the uuid id column, which failed validation.

1. New Tables
- `hcaptcha_links` — user-managed rotation list (position, label, url, is_active).
- `hcaptcha_rotation_state` — single-row pointer (id = 1) with next_position.

2. Seeded data
- The 40 existing hardcoded links inserted with positions 1..40 (idempotent on label).

3. New Functions
- `assign_hcaptcha_link(p_device_id text)` — SECURITY DEFINER atomic strict-rotation
  assignment; service_role only.

4. Security
- RLS on both tables; anon + authenticated CRUD (single-tenant no-auth app);
  EXECUTE on function revoked from public, granted to service_role.
*/

CREATE TABLE IF NOT EXISTS hcaptcha_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position int NOT NULL UNIQUE,
  label text NOT NULL UNIQUE,
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hcaptcha_rotation_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  next_position int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO hcaptcha_rotation_state (id, next_position) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

INSERT INTO hcaptcha_links (position, label, url) VALUES
  (1,  'URL_1',  'https://accounts.hcaptcha.com/verify_email/e1e7ee0a-d569-48ea-a826-dd0dda0d438a'),
  (2,  'URL_2',  'https://accounts.hcaptcha.com/verify_email/fb44ffdf-d83c-4a43-892a-e5bb8bd54027'),
  (3,  'URL_3',  'https://accounts.hcaptcha.com/verify_email/43361230-bf41-4ba9-9041-5f0d53056ae8'),
  (4,  'URL_4',  'https://accounts.hcaptcha.com/verify_email/302f6237-c995-46ce-ae10-33e83be3baf0'),
  (5,  'URL_5',  'https://accounts.hcaptcha.com/verify_email/cb076e26-7e02-4021-a008-e6a8b2375906'),
  (6,  'URL_6',  'https://accounts.hcaptcha.com/verify_email/f64f66ba-ceaa-430d-951d-913ab2497fa9'),
  (7,  'URL_7',  'https://accounts.hcaptcha.com/verify_email/9f50283e-d840-40b4-a675-82dd142921cc'),
  (8,  'URL_8',  'https://accounts.hcaptcha.com/verify_email/401a44ac-d296-456f-9167-ed167fa7913d'),
  (9,  'URL_9',  'https://accounts.hcaptcha.com/verify_email/14246df8-bba3-4d8a-9466-08e2d457bfd5'),
  (10, 'URL_10', 'https://accounts.hcaptcha.com/verify_email/6a533eb7-0dd9-583a-aa4e-f549f387761f'),
  (11, 'URL_11', 'https://accounts.hcaptcha.com/verify_email/3d52861f-1195-4df7-b370-184f5157b4c7'),
  (12, 'URL_12', 'https://accounts.hcaptcha.com/verify_email/c45951ab-5c2e-4c02-81ca-8a1cad9b290f'),
  (13, 'URL_13', 'https://accounts.hcaptcha.com/verify_email/d713d486-c973-4263-8892-d8285542a1a4'),
  (14, 'URL_14', 'https://accounts.hcaptcha.com/verify_email/63fd95b5-0851-4ef9-9c68-aab84627aeac'),
  (15, 'URL_15', 'https://accounts.hcaptcha.com/verify_email/0ac3f3e5-8e1a-4fbe-8df2-25a5a5428aa1'),
  (16, 'URL_16', 'https://accounts.hcaptcha.com/verify_email/8650b147-1ed8-46a8-9464-9179e9d088b4'),
  (17, 'URL_17', 'https://accounts.hcaptcha.com/verify_email/6adc58eb-0bc5-f526-040a-8df54193ba82'),
  (18, 'URL_18', 'https://accounts.hcaptcha.com/verify_email/ba244034-c494-4790-8d80-f35b57d6aa16'),
  (19, 'URL_19', 'https://accounts.hcaptcha.com/verify_email/f33c2027-21aa-442f-91dd-45006c593a67'),
  (20, 'URL_20', 'https://accounts.hcaptcha.com/verify_email/8e35bc66-3907-4c65-9e59-d44374508daf'),
  (21, 'URL_21', 'https://accounts.hcaptcha.com/verify_email/954250c0-ea58-4e66-aad4-9127e90eb160'),
  (22, 'URL_22', 'https://accounts.hcaptcha.com/verify_email/f1a4760f-8bf1-4e2e-928e-5576f9a232df'),
  (23, 'URL_23', 'https://accounts.hcaptcha.com/verify_email/1de3b9c0-6087-443b-9d7d-25159a2d6e79'),
  (24, 'URL_24', 'https://accounts.hcaptcha.com/verify_email/6af4f57b-3139-e3a8-e05e-2860d887aecd'),
  (25, 'URL_25', 'https://accounts.hcaptcha.com/verify_email/ac173a84-82ef-47e3-b4ca-f88d5e1df109'),
  (26, 'URL_26', 'https://accounts.hcaptcha.com/verify_email/9ec84a95-e41e-4960-b699-235250c589a3'),
  (27, 'URL_27', 'https://accounts.hcaptcha.com/verify_email/6af50e79-6101-02be-2f91-82241ed50883'),
  (28, 'URL_28', 'https://accounts.hcaptcha.com/verify_email/d7884703-ac06-4115-ae94-47c4af363b88'),
  (29, 'URL_29', 'https://accounts.hcaptcha.com/verify_email/6af77c7c-e263-4fd4-58c2-f894ad730456'),
  (30, 'URL_30', 'https://accounts.hcaptcha.com/verify_email/6af90d1d-1a25-cef5-3f0a-ecb65d840f68'),
  (31, 'URL_31', 'https://accounts.hcaptcha.com/verify_email/6b268b70-cb1e-4bdb-b9ae-7a75ac67c45d'),
  (32, 'URL_32', 'https://accounts.hcaptcha.com/verify_email/0c71af4f-8b61-4f4b-962c-d08235d8b2e9'),
  (33, 'URL_33', 'https://accounts.hcaptcha.com/verify_email/ec4533c8-b91a-4a0f-90c8-df98d6c3ca6d'),
  (34, 'URL_34', 'https://accounts.hcaptcha.com/verify_email/b1e66167-da72-4e07-bd3a-af09ebe9da19'),
  (35, 'URL_35', 'https://accounts.hcaptcha.com/verify_email/ad572904-0415-4a14-9818-f21e303150f7'),
  (36, 'URL_36', 'https://accounts.hcaptcha.com/verify_email/c37aa11d-1291-4e40-8a83-8e7a13c9ccb6'),
  (37, 'URL_37', 'https://accounts.hcaptcha.com/verify_email/f1e18359-b4a8-45b7-877d-70b6e9667049'),
  (38, 'URL_38', 'https://accounts.hcaptcha.com/verify_email/6aebcd63-8921-5b09-3ff6-55c0e53653f6'),
  (39, 'URL_39', 'https://accounts.hcaptcha.com/verify_email/3c4347dc-9bc3-49b2-a95e-77257e349901'),
  (40, 'URL_40', 'https://accounts.hcaptcha.com/verify_email/7f42fe13-9445-4516-a0b5-7547832fce83')
ON CONFLICT (label) DO NOTHING;

CREATE OR REPLACE FUNCTION assign_hcaptcha_link(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_pos int;
  v_link hcaptcha_links%ROWTYPE;
  v_following int;
BEGIN
  SELECT next_position INTO v_next_pos
  FROM hcaptcha_rotation_state WHERE id = 1 FOR UPDATE;

  SELECT * INTO v_link FROM hcaptcha_links
  WHERE is_active AND position >= v_next_pos
  ORDER BY position LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO v_link FROM hcaptcha_links
    WHERE is_active ORDER BY position LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no active links configured');
  END IF;

  INSERT INTO hcaptcha_assignments (device_id, url_label, assigned_at, status)
  VALUES (p_device_id, v_link.label, now(), 'assigned');

  SELECT position INTO v_following FROM hcaptcha_links
  WHERE is_active AND position > v_link.position
  ORDER BY position LIMIT 1;

  IF NOT FOUND THEN
    SELECT position INTO v_following FROM hcaptcha_links
    WHERE is_active ORDER BY position LIMIT 1;
  END IF;

  UPDATE hcaptcha_rotation_state
  SET next_position = v_following, updated_at = now()
  WHERE id = 1;

  RETURN jsonb_build_object(
    'url', v_link.url,
    'label', v_link.label,
    'position', v_link.position,
    'next_label', (SELECT label FROM hcaptcha_links WHERE position = v_following LIMIT 1),
    'total_available', (SELECT count(*) FROM hcaptcha_links WHERE is_active)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_hcaptcha_link(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_hcaptcha_link(text) TO service_role;

ALTER TABLE hcaptcha_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcaptcha_rotation_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON hcaptcha_links TO anon, authenticated;
GRANT SELECT, UPDATE ON hcaptcha_rotation_state TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hcaptcha_links TO service_role;
GRANT SELECT, UPDATE ON hcaptcha_rotation_state TO service_role;

DROP POLICY IF EXISTS "links_select" ON hcaptcha_links;
CREATE POLICY "links_select" ON hcaptcha_links FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "links_insert" ON hcaptcha_links;
CREATE POLICY "links_insert" ON hcaptcha_links FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "links_update" ON hcaptcha_links;
CREATE POLICY "links_update" ON hcaptcha_links FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "links_delete" ON hcaptcha_links;
CREATE POLICY "links_delete" ON hcaptcha_links FOR DELETE
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "rotation_select" ON hcaptcha_rotation_state;
CREATE POLICY "rotation_select" ON hcaptcha_rotation_state FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "rotation_update" ON hcaptcha_rotation_state;
CREATE POLICY "rotation_update" ON hcaptcha_rotation_state FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);
