-- Feature 1 & 2: Per-employee shift limits (EB, MB, NB, 1-PM)
-- Feature 3: Per-month schedule lock

-- =============================================================================
-- Global shift limit defaults (single config row)
-- =============================================================================
CREATE TABLE global_shift_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eb_limit integer NOT NULL DEFAULT 4,
  mb_limit integer NOT NULL DEFAULT 4,
  nb_limit integer NOT NULL DEFAULT 4,
  total_bonus_limit integer NOT NULL DEFAULT 4,
  pm1_limit integer DEFAULT NULL,  -- null = unlimited
  updated_at timestamptz DEFAULT now()
);

INSERT INTO global_shift_limits (eb_limit, mb_limit, nb_limit, total_bonus_limit, pm1_limit)
VALUES (4, 4, 4, 4, NULL);

-- RLS: everyone reads, only admins update
ALTER TABLE global_shift_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read global limits"
  ON global_shift_limits FOR SELECT
  USING (true);

CREATE POLICY "Admins can update global limits"
  ON global_shift_limits FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================================================
-- Per-employee shift limit overrides
-- =============================================================================
CREATE TABLE employee_shift_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_custom boolean NOT NULL DEFAULT false,
  eb_limit integer NOT NULL DEFAULT 4,
  mb_limit integer NOT NULL DEFAULT 4,
  nb_limit integer NOT NULL DEFAULT 4,
  total_bonus_limit integer NOT NULL DEFAULT 4,
  pm1_limit integer DEFAULT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id)
);

ALTER TABLE employee_shift_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can read own limits"
  ON employee_shift_limits FOR SELECT
  USING (employee_id = auth.uid());

CREATE POLICY "Admins full access on employee limits"
  ON employee_shift_limits FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- =============================================================================
-- Per-month schedule locks
-- =============================================================================
CREATE TABLE schedule_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year text NOT NULL UNIQUE,
  is_locked boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE schedule_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read schedule locks"
  ON schedule_locks FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert schedule locks"
  ON schedule_locks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can update schedule locks"
  ON schedule_locks FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Enable realtime for schedule_locks so employees see changes instantly
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_locks;

-- =============================================================================
-- Updated claim limit trigger: dynamic limits + lock check
-- =============================================================================
CREATE OR REPLACE FUNCTION check_monthly_claim_limit()
RETURNS TRIGGER AS $$
DECLARE
  locked boolean;
  eff_eb_limit integer;
  eff_mb_limit integer;
  eff_nb_limit integer;
  eff_total_limit integer;
  eff_pm1_limit integer;
  is_custom boolean;
  eb_count integer;
  mb_count integer;
  nb_count integer;
  total_count integer;
  pm1_count integer;
  shift_prefix text;
BEGIN
  -- Check schedule lock
  SELECT sl.is_locked INTO locked
  FROM schedule_locks sl
  WHERE sl.month_year = NEW.month_year;

  IF locked IS TRUE THEN
    RAISE EXCEPTION 'Schedule is currently locked by administrator.';
  END IF;

  -- Determine shift prefix (e.g., 'EB', 'MB', 'NB', '1-PM')
  IF NEW.id_shift_type LIKE '1-PM%' OR NEW.id_shift_type LIKE '1PM%' THEN
    shift_prefix := '1PM';
  ELSE
    shift_prefix := split_part(NEW.id_shift_type, ' ', 1);
  END IF;

  -- Resolve effective limits: check employee override first, then global
  SELECT esl.is_custom, esl.eb_limit, esl.mb_limit, esl.nb_limit, esl.total_bonus_limit, esl.pm1_limit
  INTO is_custom, eff_eb_limit, eff_mb_limit, eff_nb_limit, eff_total_limit, eff_pm1_limit
  FROM employee_shift_limits esl
  WHERE esl.employee_id = NEW.claimed_by AND esl.is_custom = true;

  IF NOT FOUND THEN
    SELECT gsl.eb_limit, gsl.mb_limit, gsl.nb_limit, gsl.total_bonus_limit, gsl.pm1_limit
    INTO eff_eb_limit, eff_mb_limit, eff_nb_limit, eff_total_limit, eff_pm1_limit
    FROM global_shift_limits gsl
    LIMIT 1;
  END IF;

  -- If no config found at all, use hardcoded defaults
  IF eff_total_limit IS NULL THEN
    eff_eb_limit := 4;
    eff_mb_limit := 4;
    eff_nb_limit := 4;
    eff_total_limit := 4;
    eff_pm1_limit := NULL;
  END IF;

  -- Handle 1-PM shifts separately
  IF shift_prefix = '1PM' THEN
    IF eff_pm1_limit IS NOT NULL THEN
      SELECT count(*) INTO pm1_count
      FROM shift_claims
      WHERE claimed_by = NEW.claimed_by
        AND month_year = NEW.month_year
        AND (id_shift_type LIKE '1-PM%' OR id_shift_type LIKE '1PM%');

      IF pm1_count >= eff_pm1_limit THEN
        RAISE EXCEPTION 'You have reached your 1-PM shift limit (%) for this month.', eff_pm1_limit;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Non-1-PM shifts: check type-specific limit
  IF shift_prefix = 'EB' THEN
    SELECT count(*) INTO eb_count
    FROM shift_claims
    WHERE claimed_by = NEW.claimed_by
      AND month_year = NEW.month_year
      AND id_shift_type LIKE 'EB%'
      AND id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';
    IF eb_count >= eff_eb_limit THEN
      RAISE EXCEPTION 'You have reached your EB shift limit (%) for this month.', eff_eb_limit;
    END IF;
  ELSIF shift_prefix = 'MB' THEN
    SELECT count(*) INTO mb_count
    FROM shift_claims
    WHERE claimed_by = NEW.claimed_by
      AND month_year = NEW.month_year
      AND id_shift_type LIKE 'MB%'
      AND id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';
    IF mb_count >= eff_mb_limit THEN
      RAISE EXCEPTION 'You have reached your MB shift limit (%) for this month.', eff_mb_limit;
    END IF;
  ELSIF shift_prefix = 'NB' THEN
    SELECT count(*) INTO nb_count
    FROM shift_claims
    WHERE claimed_by = NEW.claimed_by
      AND month_year = NEW.month_year
      AND id_shift_type LIKE 'NB%'
      AND id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';
    IF nb_count >= eff_nb_limit THEN
      RAISE EXCEPTION 'You have reached your NB shift limit (%) for this month.', eff_nb_limit;
    END IF;
  END IF;

  -- Check total non-1PM limit
  SELECT count(*) INTO total_count
  FROM shift_claims
  WHERE claimed_by = NEW.claimed_by
    AND month_year = NEW.month_year
    AND id_shift_type NOT LIKE '1-PM%'
    AND id_shift_type NOT LIKE '1PM%';

  IF total_count >= eff_total_limit THEN
    RAISE EXCEPTION 'You have reached your total bonus shift limit (%) for this month.', eff_total_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Lock check on DELETE (prevent unclaiming when locked)
-- =============================================================================
CREATE OR REPLACE FUNCTION check_schedule_lock_on_delete()
RETURNS TRIGGER AS $$
DECLARE
  locked boolean;
BEGIN
  SELECT sl.is_locked INTO locked
  FROM schedule_locks sl
  WHERE sl.month_year = OLD.month_year;

  IF locked IS TRUE THEN
    RAISE EXCEPTION 'Schedule is currently locked by administrator.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_schedule_lock_on_delete
  BEFORE DELETE ON shift_claims
  FOR EACH ROW
  EXECUTE FUNCTION check_schedule_lock_on_delete();
