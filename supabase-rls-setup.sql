-- ============================================================
-- RLS Setup for Schedule Planner
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Helper function: check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read all profiles (needed for calendar view)
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert profiles
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can update profiles
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- Only admins can delete profiles
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- SHIFT_CLAIMS
-- ============================================================
ALTER TABLE public.shift_claims ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read all claims
CREATE POLICY "shift_claims_select" ON public.shift_claims
  FOR SELECT TO authenticated
  USING (true);

-- Users can insert their own claims; admins can insert for anyone
CREATE POLICY "shift_claims_insert" ON public.shift_claims
  FOR INSERT TO authenticated
  WITH CHECK (claimed_by = auth.uid() OR public.is_admin());

-- Users can delete their own claims; admins can delete any
CREATE POLICY "shift_claims_delete" ON public.shift_claims
  FOR DELETE TO authenticated
  USING (claimed_by = auth.uid() OR public.is_admin());

-- ============================================================
-- BONUS_SHIFTS
-- ============================================================
ALTER TABLE public.bonus_shifts ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "bonus_shifts_select" ON public.bonus_shifts
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "bonus_shifts_insert" ON public.bonus_shifts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can update
CREATE POLICY "bonus_shifts_update" ON public.bonus_shifts
  FOR UPDATE TO authenticated
  USING (public.is_admin());

-- Only admins can delete
CREATE POLICY "bonus_shifts_delete" ON public.bonus_shifts
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- DEFAULT_SCHEDULES
-- ============================================================
ALTER TABLE public.default_schedules ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "default_schedules_select" ON public.default_schedules
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "default_schedules_insert" ON public.default_schedules
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Only admins can delete
CREATE POLICY "default_schedules_delete" ON public.default_schedules
  FOR DELETE TO authenticated
  USING (public.is_admin());
