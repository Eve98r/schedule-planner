import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ScheduleLock } from '@/types'

export function useScheduleLock(monthYear: string) {
  const [lock, setLock] = useState<ScheduleLock | null>(null)
  const [loading, setLoading] = useState(true)

  const isLocked = lock?.is_locked ?? false

  const fetchLock = useCallback(async () => {
    if (!monthYear) return
    const { data } = await supabase
      .from('schedule_locks')
      .select('*')
      .eq('month_year', monthYear)
      .maybeSingle()
    setLock(data)
    setLoading(false)
  }, [monthYear])

  useEffect(() => {
    setLoading(true)
    fetchLock()

    const channel = supabase
      .channel(`schedule_locks_${monthYear}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_locks',
          filter: `month_year=eq.${monthYear}`,
        },
        () => {
          fetchLock()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [monthYear, fetchLock])

  const toggleLock = async () => {
    const newLocked = !isLocked
    if (lock) {
      const { error } = await supabase
        .from('schedule_locks')
        .update({ is_locked: newLocked, updated_at: new Date().toISOString() })
        .eq('id', lock.id)
      if (!error) await fetchLock()
      return { error }
    } else {
      const { error } = await supabase.from('schedule_locks').insert({
        month_year: monthYear,
        is_locked: newLocked,
      })
      if (!error) await fetchLock()
      return { error }
    }
  }

  return { isLocked, loading, toggleLock }
}
