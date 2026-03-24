import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { GlobalShiftLimits, EmployeeShiftLimit, ShiftLimits } from '@/types'

const DEFAULT_LIMITS: ShiftLimits = {
  eb_limit: 4,
  mb_limit: 4,
  nb_limit: 4,
  total_bonus_limit: 4,
  pm1_limit: null,
}

export function useShiftLimits() {
  const [globalLimits, setGlobalLimits] = useState<GlobalShiftLimits | null>(null)
  const [employeeLimits, setEmployeeLimits] = useState<EmployeeShiftLimit[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGlobalLimits = useCallback(async () => {
    const { data } = await supabase
      .from('global_shift_limits')
      .select('*')
      .limit(1)
      .single()
    if (data) setGlobalLimits(data)
  }, [])

  const fetchEmployeeLimits = useCallback(async () => {
    const { data } = await supabase
      .from('employee_shift_limits')
      .select('*')
    setEmployeeLimits(data ?? [])
  }, [])

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchGlobalLimits(), fetchEmployeeLimits()])
      setLoading(false)
    }
    load()
  }, [fetchGlobalLimits, fetchEmployeeLimits])

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
      if (globalLimits) {
        return {
          eb_limit: globalLimits.eb_limit,
          mb_limit: globalLimits.mb_limit,
          nb_limit: globalLimits.nb_limit,
          total_bonus_limit: globalLimits.total_bonus_limit,
          pm1_limit: globalLimits.pm1_limit,
        }
      }
      return DEFAULT_LIMITS
    },
    [globalLimits, employeeLimits]
  )

  const updateGlobalLimits = async (limits: Partial<ShiftLimits>) => {
    if (!globalLimits) return
    const { error } = await supabase
      .from('global_shift_limits')
      .update({ ...limits, updated_at: new Date().toISOString() })
      .eq('id', globalLimits.id)
    if (!error) await fetchGlobalLimits()
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
      if (!error) await fetchEmployeeLimits()
      return { error }
    } else {
      const defaults = globalLimits ?? DEFAULT_LIMITS
      const { error } = await supabase.from('employee_shift_limits').insert({
        employee_id: employeeId,
        eb_limit: defaults.eb_limit,
        mb_limit: defaults.mb_limit,
        nb_limit: defaults.nb_limit,
        total_bonus_limit: defaults.total_bonus_limit,
        pm1_limit: defaults.pm1_limit,
        is_custom: false,
        ...limits,
      })
      if (!error) await fetchEmployeeLimits()
      return { error }
    }
  }

  return {
    globalLimits,
    employeeLimits,
    loading,
    getEffectiveLimits,
    updateGlobalLimits,
    upsertEmployeeLimit,
    refetch: () => Promise.all([fetchGlobalLimits(), fetchEmployeeLimits()]),
  }
}
