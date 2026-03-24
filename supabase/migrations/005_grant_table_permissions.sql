-- Fix missing table-level permissions for tables created in migration 004.
-- Supabase no longer auto-grants access to authenticated/anon roles on new tables.

-- schedule_locks: all authenticated users can read, admins insert/update (enforced by RLS)
GRANT SELECT, INSERT, UPDATE ON schedule_locks TO authenticated;

-- global_shift_limits: all authenticated users can read, admins update (enforced by RLS)
GRANT SELECT, UPDATE ON global_shift_limits TO authenticated;

-- employee_shift_limits: all authenticated users can read, admins full access (enforced by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON employee_shift_limits TO authenticated;
