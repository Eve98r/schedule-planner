-- ============================================================
-- Schedule Planner — Database Schema
-- ============================================================

-- 1. Profiles
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  full_name   text NOT NULL,
  role        text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('employee', 'admin')),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 2. Bonus Shifts
CREATE TABLE bonus_shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  shift_type    text NOT NULL,
  row_number    integer NOT NULL,
  id_shift_type text NOT NULL UNIQUE,
  month_year    text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE bonus_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bonus_shifts"
  ON bonus_shifts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert bonus_shifts"
  ON bonus_shifts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update bonus_shifts"
  ON bonus_shifts FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete bonus_shifts"
  ON bonus_shifts FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Default Schedules
CREATE TABLE default_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,
  employee    text NOT NULL,
  day_type    text NOT NULL,
  month_year  text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE default_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own schedules"
  ON default_schedules FOR SELECT
  USING (
    employee = (SELECT full_name FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can read all schedules"
  ON default_schedules FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert default_schedules"
  ON default_schedules FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update default_schedules"
  ON default_schedules FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete default_schedules"
  ON default_schedules FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Shift Claims
CREATE TABLE shift_claims (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_shift_type text NOT NULL UNIQUE REFERENCES bonus_shifts(id_shift_type) ON DELETE CASCADE,
  claimed_by    uuid NOT NULL REFERENCES profiles(id),
  claimed_at    timestamptz DEFAULT now(),
  month_year    text NOT NULL,
  date          date NOT NULL,
  CONSTRAINT uq_one_per_day UNIQUE (claimed_by, date)
);

ALTER TABLE shift_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all claims"
  ON shift_claims FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own claims"
  ON shift_claims FOR INSERT
  WITH CHECK (claimed_by = auth.uid());

CREATE POLICY "Users can delete own claims"
  ON shift_claims FOR DELETE
  USING (claimed_by = auth.uid());

CREATE POLICY "Admins can do everything on claims"
  ON shift_claims FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. Trigger: Max 4 claims per month per user
CREATE OR REPLACE FUNCTION check_monthly_claim_limit()
RETURNS TRIGGER AS $$
DECLARE
  claim_count integer;
BEGIN
  SELECT count(*) INTO claim_count
  FROM shift_claims
  WHERE claimed_by = NEW.claimed_by
    AND month_year = NEW.month_year;

  IF claim_count >= 4 THEN
    RAISE EXCEPTION 'Monthly limit of 4 bonus shifts reached for this month.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_monthly_claim_limit
  BEFORE INSERT ON shift_claims
  FOR EACH ROW
  EXECUTE FUNCTION check_monthly_claim_limit();

-- 6. Enable Realtime on shift_claims
ALTER PUBLICATION supabase_realtime ADD TABLE shift_claims;

-- 7. Index for faster month queries
CREATE INDEX idx_bonus_shifts_month ON bonus_shifts(month_year);
CREATE INDEX idx_default_schedules_month ON default_schedules(month_year);
CREATE INDEX idx_shift_claims_month ON shift_claims(month_year);
CREATE INDEX idx_shift_claims_user_month ON shift_claims(claimed_by, month_year);
