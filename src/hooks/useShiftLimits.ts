import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MonthlyShiftLimits, EmployeeShiftLimit, ShiftLimits } from '@/types'

const DEFAULT_LIMITS: ShiftLimits = {
  eb_limit: null,
  mb_limit: null,
  nb_limit: null,
  total_bonus_limit: 4,
  pm1_limit: null,
}

export function useShiftLimits(monthYear: string) {
  const [monthlyLimits, setMonthlyLimits] = useState<MonthlyShiftLimits | null>(null)
  const [employeeLimits, setEmployeeLimits] = useState<EmployeeShiftLimit[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMonthlyLimits = useCallback(async (my: string) => {
    const { data } = await supabase
      .from('monthly_shift_limits')
      .select('*')
      .eq('month_year', my)
      .maybeSingle()

    if (data) {
      setMonthlyLimits(data)
    } else {
      // Auto-create with defaults for this month
      const { data: created } = await supabase
        .from('monthly_shift_limits')
        .insert({
          month_year: my,
          eb_limit: DEFAULT_LIMITS.eb_limit,
          mb_limit: DEFAULT_LIMITS.mb_limit,
          nb_limit: DEFAULT_LIMITS.nb_limit,
          total_bonus_limit: DEFAULT_LIMITS.total_bonus_limit,
          pm1_limit: DEFAULT_LIMITS.pm1_limit,
        })
        .select()
        .single()
      if (created) setMonthlyLimits(created)
    }
  }, [])

  const fetchEmployeeLimits = useCallback(async (my: string) => {
    const { data } = await supabase
      .from('employee_shift_limits')
      .select('*')
      .eq('month_year', my)
    setEmployeeLimits(data ?? [])
  }, [])

  useEffect(() => {
    if (!monthYear) return
    setLoading(true)
    const load = async () => {
      await Promise.all([fetchMonthlyLimits(monthYear), fetchEmployeeLimits(monthYear)])
      setLoading(false)
    }
    load()
  }, [monthYear, fetchMonthlyLimits, fetchEmployeeLimits])

  const getEffectiveLimits = useCallback(
    (employeeId: string): ShiftLimits => {
      const emp = employeeLimits.find((e) => e.employee_id === employeeId)
      if (emp?.is_custom) {
        return {
          eb_limit: emp.eb_limit,
          mb_limit: emp.mb_limit,
          nb_limit: emp.nb_limit,
          total_bonus_limit: emp.total_bonus_limit,
          pm1_limit: emp.pm1_limit,
        }
      }
      if (monthlyLimits) {
        return {
          eb_limit: monthlyLimits.eb_limit,
          mb_limit: monthlyLimits.mb_limit,
          nb_limit: monthlyLimits.nb_limit,
          total_bonus_limit: monthlyLimits.total_bonus_limit,
          pm1_limit: monthlyLimits.pm1_limit,
        }
      }
      return DEFAULT_LIMITS
    },
    [monthlyLimits, employeeLimits]
  )

  const updateMonthlyLimits = async (limits: Partial<ShiftLimits>) => {
    if (!monthlyLimits) return
    const { error } = await supabase
      .from('monthly_shift_limits')
      .update({ ...limits, updated_at: new Date().toISOString() })
      .eq('id', monthlyLimits.id)
    if (!error) await fetchMonthlyLimits(monthYear)
    return { error }
  }

  const upsertEmployeeLimit = async (
    employeeId: string,
    limits: Partial<ShiftLimits> & { is_custom?: boolean }
  ) => {
    const existing = employeeLimits.find((e) => e.employee_id === employeeId)
    if (existing) {
      const { error } = await supabase
        .from('employee_shift_limits')
        .update({ ...limits, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (!error) await fetchEmployeeLimits(monthYear)
      return { error }
    } else {
      const defaults = monthlyLimits ?? DEFAULT_LIMITS
      const { error } = await supabase.from('employee_shift_limits').insert({
        employee_id: employeeId,
        month_year: monthYear,
        eb_limit: defaults.eb_limit,
        mb_limit: defaults.mb_limit,
        nb_limit: defaults.nb_limit,
        total_bonus_limit: defaults.total_bonus_limit,
        pm1_limit: defaults.pm1_limit,
        is_custom: false,
        ...limits,
      })
      if (!error) await fetchEmployeeLimits(monthYear)
      return { error }
    }
  }

  return {
    monthlyLimits,
    employeeLimits,
    loading,
    getEffectiveLimits,
    updateMonthlyLimits,
    upsertEmployeeLimit,
    refetch: () => Promise.all([fetchMonthlyLimits(monthYear), fetchEmployeeLimits(monthYear)]),
  }
}
