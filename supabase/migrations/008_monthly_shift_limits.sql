-- Convert global shift limits to per-month shift limits
-- Convert per-agent overrides to per-month as well

-- =============================================================================
-- 1. Rename global_shift_limits → monthly_shift_limits, add month_year
-- =============================================================================
ALTER TABLE global_shift_limits RENAME TO monthly_shift_limits;

ALTER TABLE monthly_shift_limits ADD COLUMN month_year text;
UPDATE monthly_shift_limits SET month_year = to_char(now(), 'YYYY-MM');
ALTER TABLE monthly_shift_limits ALTER COLUMN month_year SET NOT NULL;
ALTER TABLE monthly_shift_limits ADD CONSTRAINT monthly_shift_limits_month_year_key UNIQUE (month_year);

-- Drop old RLS policies (referencing old table name)
DROP POLICY IF EXISTS "Everyone can read global limits" ON monthly_shift_limits;
DROP POLICY IF EXISTS "Admins can update global limits" ON monthly_shift_limits;
DROP POLICY IF EXISTS "Admins and managers can update global limits" ON monthly_shift_limits;

-- New RLS policies for monthly_shift_limits
CREATE POLICY "Everyone can read monthly limits"
  ON monthly_shift_limits FOR SELECT
  USING (true);

CREATE POLICY "Admins and managers can insert monthly limits"
  ON monthly_shift_limits FOR INSERT
  WITH CHECK (is_admin_or_manager());

CREATE POLICY "Admins and managers can update monthly limits"
  ON monthly_shift_limits FOR UPDATE
  USING (is_admin_or_manager());

CREATE POLICY "Admins can delete monthly limits"
  ON monthly_shift_limits FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Grant INSERT permission (old table only had SELECT, UPDATE)
GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_shift_limits TO authenticated;

-- =============================================================================
-- 2. Add month_year to employee_shift_limits
-- =============================================================================
ALTER TABLE employee_shift_limits DROP CONSTRAINT IF EXISTS employee_shift_limits_employee_id_key;

ALTER TABLE employee_shift_limits ADD COLUMN month_year text;
UPDATE employee_shift_limits SET month_year = to_char(now(), 'YYYY-MM');
ALTER TABLE employee_shift_limits ALTER COLUMN month_year SET NOT NULL;
ALTER TABLE employee_shift_limits ADD CONSTRAINT employee_shift_limits_employee_month_key UNIQUE (employee_id, month_year);

-- =============================================================================
-- 3. Updated trigger: lookup limits by month_year from the claim
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
  type_count integer;
  total_count integer;
  shift_prefix text;
BEGIN
  -- Check schedule lock
  SELECT sl.is_locked INTO locked
  FROM schedule_locks sl
  WHERE sl.month_year = NEW.month_year;

  IF locked IS TRUE THEN
    RAISE EXCEPTION 'Schedule is currently locked by administrator.';
  END IF;

  -- Determine shift prefix
  IF NEW.id_shift_type LIKE '1-PM%' OR NEW.id_shift_type LIKE '1PM%' THEN
    shift_prefix := '1PM';
  ELSE
    shift_prefix := split_part(NEW.id_shift_type, ' ', 1);
  END IF;

  -- Resolve effective limits: per-agent monthly override > monthly defaults > hardcoded
  SELECT esl.is_custom, esl.eb_limit, esl.mb_limit, esl.nb_limit, esl.total_bonus_limit, esl.pm1_limit
  INTO is_custom, eff_eb_limit, eff_mb_limit, eff_nb_limit, eff_total_limit, eff_pm1_limit
  FROM employee_shift_limits esl
  WHERE esl.employee_id = NEW.claimed_by
    AND esl.month_year = NEW.month_year
    AND esl.is_custom = true;

  IF NOT FOUND THEN
    SELECT msl.eb_limit, msl.mb_limit, msl.nb_limit, msl.total_bonus_limit, msl.pm1_limit
    INTO eff_eb_limit, eff_mb_limit, eff_nb_limit, eff_total_limit, eff_pm1_limit
    FROM monthly_shift_limits msl
    WHERE msl.month_year = NEW.month_year;
  END IF;

  -- Hardcoded fallback if no config found for this month
  IF eff_total_limit IS NULL THEN
    eff_total_limit := 4;
  END IF;

  -- Handle 1-PM shifts separately
  IF shift_prefix = '1PM' THEN
    IF eff_pm1_limit IS NOT NULL THEN
      SELECT count(*) INTO type_count
      FROM shift_claims
      WHERE claimed_by = NEW.claimed_by
        AND month_year = NEW.month_year
        AND (id_shift_type LIKE '1-PM%' OR id_shift_type LIKE '1PM%');

      IF type_count >= eff_pm1_limit THEN
        RAISE EXCEPTION 'You have reached your 1-PM shift limit (%) for this month.', eff_pm1_limit;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Non-1-PM shifts: check type-specific limit only if NOT NULL
  IF shift_prefix = 'EB' AND eff_eb_limit IS NOT NULL THEN
    SELECT count(*) INTO type_count
    FROM shift_claims
    WHERE claimed_by = NEW.claimed_by
      AND month_year = NEW.month_year
      AND id_shift_type LIKE 'EB%'
      AND id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';
    IF type_count >= eff_eb_limit THEN
      RAISE EXCEPTION 'You have reached your EB shift limit (%) for this month.', eff_eb_limit;
    END IF;
  ELSIF shift_prefix = 'MB' AND eff_mb_limit IS NOT NULL THEN
    SELECT count(*) INTO type_count
    FROM shift_claims
    WHERE claimed_by = NEW.claimed_by
      AND month_year = NEW.month_year
      AND id_shift_type LIKE 'MB%'
      AND id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';
    IF type_count >= eff_mb_limit THEN
      RAISE EXCEPTION 'You have reached your MB shift limit (%) for this month.', eff_mb_limit;
    END IF;
  ELSIF shift_prefix = 'NB' AND eff_nb_limit IS NOT NULL THEN
    SELECT count(*) INTO type_count
    FROM shift_claims
    WHERE claimed_by = NEW.claimed_by
      AND month_year = NEW.month_year
      AND id_shift_type LIKE 'NB%'
      AND id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';
    IF type_count >= eff_nb_limit THEN
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
