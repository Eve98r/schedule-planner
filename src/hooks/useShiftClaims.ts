import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ShiftClaim } from '@/types'

export function useShiftClaims(monthYear: string) {
  const [claims, setClaims] = useState<ShiftClaim[]>([])
  const [loading, setLoading] = useState(true)

  const fetchClaims = useCallback(async () => {
    if (!monthYear) return
    const { data } = await supabase
      .from('shift_claims')
      .select('*')
      .eq('month_year', monthYear)
    setClaims(data ?? [])
    setLoading(false)
  }, [monthYear])

  useEffect(() => {
    fetchClaims()

    const channel = supabase
      .channel(`shift_claims_${monthYear}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_claims',
          filter: `month_year=eq.${monthYear}`,
        },
        () => {
          fetchClaims()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [monthYear, fetchClaims])

  const claimShift = async (
    idShiftType: string,
    userId: string,
    date: string
  ) => {
    const { error } = await supabase.from('shift_claims').insert({
      id_shift_type: idShiftType,
      claimed_by: userId,
      month_year: monthYear,
      date,
    })
    if (!error) fetchClaims()
    return { error }
  }

  const unclaimShift = async (idShiftType: string, userId: string) => {
    const { error } = await supabase
      .from('shift_claims')
      .delete()
      .eq('id_shift_type', idShiftType)
      .eq('claimed_by', userId)
    if (!error) fetchClaims()
    return { error }
  }

  const getClaimForShift = (idShiftType: string): ShiftClaim | undefined => {
    return claims.find((c) => c.id_shift_type === idShiftType)
  }

  const getUserClaimsCount = (userId: string): number => {
    return claims.filter((c) => c.claimed_by === userId).length
  }

  const getUserClaimForDate = (userId: string, date: string): ShiftClaim | undefined => {
    return claims.find((c) => c.claimed_by === userId && c.date === date)
  }

  return {
    claims,
    loading,
    claimShift,
    unclaimShift,
    getClaimForShift,
    getUserClaimsCount,
    getUserClaimForDate,
  }
}
