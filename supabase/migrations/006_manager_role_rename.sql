-- =============================================================================
-- Migration 006: Rename 'employee' role to 'agent', add 'manager' role
-- =============================================================================

-- 1. Update role constraint and existing data
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
UPDATE profiles SET role = 'agent' WHERE role = 'employee';
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'agent';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('agent', 'manager', 'admin'));

-- 2. Helper function: check if current user is admin or manager
CREATE OR REPLACE FUNCTION is_admin_or_manager() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- 3. Update RLS policies to include manager where appropriate
-- =============================================================================

-- profiles: "Authenticated users can read profiles" already allows all users to read
-- No change needed for profiles SELECT policy

-- default_schedules: managers can read all schedules
DROP POLICY "Admins can read all schedules" ON default_schedules;
CREATE POLICY "Admins and managers can read all schedules"
  ON default_schedules FOR SELECT
  USING (is_admin_or_manager());

-- shift_claims: managers can do everything on claims (edit calendars on behalf)
DROP POLICY "Admins can do everything on claims" ON shift_claims;
CREATE POLICY "Admins and managers can do everything on claims"
  ON shift_claims FOR ALL
  USING (is_admin_or_manager());

-- global_shift_limits: managers can update
DROP POLICY "Admins can update global limits" ON global_shift_limits;
CREATE POLICY "Admins and managers can update global limits"
  ON global_shift_limits FOR UPDATE
  USING (is_admin_or_manager());

-- employee_shift_limits: managers full access
DROP POLICY "Admins full access on employee limits" ON employee_shift_limits;
CREATE POLICY "Admins and managers full access on employee limits"
  ON employee_shift_limits FOR ALL
  USING (is_admin_or_manager());

-- NOTE: schedule_locks INSERT/UPDATE stays admin-only (managers cannot lock/unlock)
-- NOTE: bonus_shifts INSERT/UPDATE/DELETE stays admin-only (managers have no import access)
-- NOTE: default_schedules INSERT/UPDATE/DELETE stays admin-only

-- =============================================================================
-- 4. Update triggers to skip lock check for admin/manager
-- =============================================================================

CREATE OR REPLACE FUNCTION check_monthly_claim_limit()
RETURNS TRIGGER AS $$
DECLARE
  locked boolean;
  caller_role text;
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
  -- Check caller role for lock bypass
  SELECT p.role INTO caller_role
  FROM profiles p
  WHERE p.id = auth.uid();

  -- Check schedule lock (only enforced for agents)
  IF caller_role IS NULL OR caller_role = 'agent' THEN
    SELECT sl.is_locked INTO locked
    FROM schedule_locks sl
    WHERE sl.month_year = NEW.month_year;

    IF locked IS TRUE THEN
      RAISE EXCEPTION 'Schedule is currently locked by administrator.';
    END IF;
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

CREATE OR REPLACE FUNCTION check_schedule_lock_on_delete()
RETURNS TRIGGER AS $$
DECLARE
  locked boolean;
  caller_role text;
BEGIN
  -- Check caller role for lock bypass
  SELECT p.role INTO caller_role
  FROM profiles p
  WHERE p.id = auth.uid();

  -- Only enforce lock for agents
  IF caller_role IS NULL OR caller_role = 'agent' THEN
    SELECT sl.is_locked INTO locked
    FROM schedule_locks sl
    WHERE sl.month_year = OLD.month_year;

    IF locked IS TRUE THEN
      RAISE EXCEPTION 'Schedule is currently locked by administrator.';
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
