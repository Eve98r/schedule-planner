-- 1-PM shifts are exempt from the one-claim-per-day constraint and 4/month limit.
-- They can stack with other bonus shifts (NB, MB, EB) on the same date.

-- Replace the strict unique constraint with a partial index that only applies to non-1-PM claims
ALTER TABLE shift_claims DROP CONSTRAINT uq_one_per_day;
CREATE UNIQUE INDEX uq_one_per_day_non_1pm
  ON shift_claims (claimed_by, date)
  WHERE id_shift_type NOT LIKE '1-PM%' AND id_shift_type NOT LIKE '1PM%';

-- Also add a partial unique index so a user can only have one 1-PM claim per date
CREATE UNIQUE INDEX uq_one_1pm_per_day
  ON shift_claims (claimed_by, date)
  WHERE id_shift_type LIKE '1-PM%' OR id_shift_type LIKE '1PM%';

-- Update the monthly limit trigger to skip 1-PM shifts entirely
CREATE OR REPLACE FUNCTION check_monthly_claim_limit()
RETURNS TRIGGER AS $$
DECLARE
  claim_count integer;
BEGIN
  -- 1-PM shifts are exempt from the monthly limit
  IF NEW.id_shift_type LIKE '1-PM%' OR NEW.id_shift_type LIKE '1PM%' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO claim_count
  FROM shift_claims
  WHERE claimed_by = NEW.claimed_by
    AND month_year = NEW.month_year
    AND id_shift_type NOT LIKE '1-PM%'
    AND id_shift_type NOT LIKE '1PM%';

  IF claim_count >= 4 THEN
    RAISE EXCEPTION 'Monthly limit of 4 bonus shifts reached for this month.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
