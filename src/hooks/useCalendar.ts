import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { DefaultSchedule, BonusShift } from '@/types'

export function useCalendar(monthYear: string, employeeName: string | undefined) {
  const [schedules, setSchedules] = useState<DefaultSchedule[]>([])
  const [bonusShifts, setBonusShifts] = useState<BonusShift[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!monthYear || !employeeName) {
      setSchedules([])
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)

      const [schedRes, bonusRes] = await Promise.all([
        supabase
          .from('default_schedules')
          .select('*')
          .eq('month_year', monthYear)
          .eq('employee', employeeName),
        supabase
          .from('bonus_shifts')
          .select('*')
          .eq('month_year', monthYear),
      ])

      setSchedules(schedRes.data ?? [])
      setBonusShifts(bonusRes.data ?? [])
      setLoading(false)
    }

    fetchData()
  }, [monthYear, employeeName])

  const getScheduleForDate = (date: Date): DefaultSchedule | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return schedules.find((s) => s.date === dateStr)
  }

  const getBonusShiftsForDate = (date: Date): BonusShift[] => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return bonusShifts.filter((b) => b.date === dateStr)
  }

  return { schedules, bonusShifts, loading, getScheduleForDate, getBonusShiftsForDate }
}
