-- Allow null (unlimited) for per-type limit columns in both tables
ALTER TABLE global_shift_limits
  ALTER COLUMN eb_limit DROP NOT NULL,
  ALTER COLUMN mb_limit DROP NOT NULL,
  ALTER COLUMN nb_limit DROP NOT NULL;

ALTER TABLE global_shift_limits
  ALTER COLUMN eb_limit SET DEFAULT NULL,
  ALTER COLUMN mb_limit SET DEFAULT NULL,
  ALTER COLUMN nb_limit SET DEFAULT NULL;

ALTER TABLE employee_shift_limits
  ALTER COLUMN eb_limit DROP NOT NULL,
  ALTER COLUMN mb_limit DROP NOT NULL,
  ALTER COLUMN nb_limit DROP NOT NULL;

ALTER TABLE employee_shift_limits
  ALTER COLUMN eb_limit SET DEFAULT NULL,
  ALTER COLUMN mb_limit SET DEFAULT NULL,
  ALTER COLUMN nb_limit SET DEFAULT NULL;

-- Update existing global defaults to match new defaults
UPDATE global_shift_limits
SET eb_limit = NULL, mb_limit = NULL, nb_limit = NULL;

-- Update trigger: skip per-type check when limit is NULL (unlimited)
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

  -- If no config found at all, use hardcoded defaults (null = unlimited for per-type)
  IF eff_total_limit IS NULL THEN
    eff_total_limit := 4;
    -- eb/mb/nb/pm1 remain NULL = unlimited
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
