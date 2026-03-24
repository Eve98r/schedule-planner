import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
} from 'date-fns'
import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, User, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DayCell } from './DayCell'
import { ShiftDropdown } from './ShiftDropdown'
import { useCalendar } from '@/hooks/useCalendar'
import { useShiftClaims } from '@/hooks/useShiftClaims'
import { useShiftLimits } from '@/hooks/useShiftLimits'
import { useScheduleLock } from '@/hooks/useScheduleLock'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const dayTypeStyles: Record<string, { color: string; backgroundColor: string }> = {
  N:     { color: '#5b4a80', backgroundColor: '#eee9f5' },
  M:     { color: '#7a6525', backgroundColor: '#f5f0de' },
  E:     { color: '#2d6050', backgroundColor: '#e3f0ea' },
  T:     { color: '#7a4a7a', backgroundColor: '#f2e8f2' },
  OFF:   { color: '#bbbbbb', backgroundColor: '#f5f5f5' },
  V:     { color: '#bbbbbb', backgroundColor: '#f5f5f5' },
  W:     { color: '#cccccc', backgroundColor: 'transparent' },
  WO:    { color: '#c09090', backgroundColor: '#f5f2f2' },
  VW:    { color: '#c09090', backgroundColor: '#f5f2f2' },
  NB:    { color: '#ffffff', backgroundColor: '#8b74bf' },
  MB:    { color: '#ffffff', backgroundColor: '#c9a033' },
  EB:    { color: '#ffffff', backgroundColor: '#4bae9e' },
  '1PM':  { color: '#000000', backgroundColor: 'transparent' },
  '1-PM': { color: '#000000', backgroundColor: 'transparent' },
}

interface CalendarGridProps {
  profile: Profile
}

export function CalendarGrid({ profile }: CalendarGridProps) {
  const canManage = profile.role === 'admin' || profile.role === 'manager'
  const [currentMonth, setCurrentMonth] = useState(() => {
    const saved = localStorage.getItem('sp_calendar_month')
    return saved ? new Date(saved + '-01') : new Date()
  })
  const [employeeNames, setEmployeeNames] = useState<string[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState(() => {
    const saved = localStorage.getItem('sp_calendar_employee')
    return saved || profile.full_name
  })
  // Map employee name -> profile id (for users who have accounts)
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const monthYear = format(currentMonth, 'yyyy-MM')

  useEffect(() => {
    localStorage.setItem('sp_calendar_month', monthYear)
  }, [monthYear])

  useEffect(() => {
    localStorage.setItem('sp_calendar_employee', selectedEmployee)
  }, [selectedEmployee])

  // Fetch all employee names from default_schedules + profiles for admin
  useEffect(() => {
    if (!canManage) return
    const fetch = async () => {
      const [schedRes, profRes] = await Promise.all([
        supabase.from('default_schedules').select('employee'),
        supabase.from('profiles').select('id, full_name'),
      ])
      const names = [...new Set((schedRes.data ?? []).map((r) => r.employee))].sort()
      setEmployeeNames(names)

      const map: Record<string, string> = {}
      for (const p of profRes.data ?? []) {
        map[p.full_name] = p.id
      }
      setProfileMap(map)
    }
    fetch()
  }, [canManage])

  const isBlank = canManage && selectedEmployee === '__blank__'
  const viewingName = isBlank ? '' : (canManage ? selectedEmployee : profile.full_name)
  const viewingUserId = viewingName ? (profileMap[viewingName] ?? null) : null
  const isViewingOther = canManage && viewingName !== profile.full_name

  const { loading: calLoading, getScheduleForDate, getBonusShiftsForDate } =
    useCalendar(monthYear, viewingName)
  const {
    claims,
    loading: claimsLoading,
    claimShift,
    unclaimShift,
    getUserClaimsCount,
    getUserClaimForDate,
    getUser1PMClaimForDate,
  } = useShiftClaims(monthYear)
  const { getEffectiveLimits, loading: limitsLoading } = useShiftLimits()
  const { isLocked } = useScheduleLock(monthYear)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const claimedShiftIds = new Set(claims.map((c) => c.id_shift_type))
  const effectiveUserId = isViewingOther ? (viewingUserId ?? '') : profile.id
  const userClaimsCount = effectiveUserId ? getUserClaimsCount(effectiveUserId) : 0
  const user1PMCount = effectiveUserId
    ? claims.filter((c) => c.claimed_by === effectiveUserId && (c.id_shift_type.startsWith('1-PM') || c.id_shift_type.startsWith('1PM'))).length
    : 0

  // Dynamic limits
  const limits = effectiveUserId ? getEffectiveLimits(effectiveUserId) : null
  const totalLimit = limits?.total_bonus_limit ?? 4
  const monthlyLimitReached = userClaimsCount >= totalLimit || (isLocked && !canManage)

  // Per-type claim counts
  const userClaims = effectiveUserId ? claims.filter((c) => c.claimed_by === effectiveUserId) : []
  const ebCount = userClaims.filter((c) => c.id_shift_type.startsWith('EB')).length
  const mbCount = userClaims.filter((c) => c.id_shift_type.startsWith('MB')).length
  const nbCount = userClaims.filter((c) => c.id_shift_type.startsWith('NB')).length

  const shiftTypeLimitReached: Record<string, boolean> = {
    EB: limits ? ebCount >= limits.eb_limit : false,
    MB: limits ? mbCount >= limits.mb_limit : false,
    NB: limits ? nbCount >= limits.nb_limit : false,
    '1-PM': limits?.pm1_limit != null ? user1PMCount >= limits.pm1_limit : false,
    '1PM': limits?.pm1_limit != null ? user1PMCount >= limits.pm1_limit : false,
  }

  // Admin can manage shifts for any user who has an account
  const canManageShifts = !isViewingOther || (canManage && !!viewingUserId)

  const loading = calLoading || claimsLoading || limitsLoading

  const noopClaim = async () => ({ error: null as unknown })
  const noopUnclaim = async () => ({ error: null as unknown })

  const handleClaim = async (idShiftType: string, date: string) => {
    if (!effectiveUserId) return { error: 'No user account' as unknown }
    return claimShift(idShiftType, effectiveUserId, date)
  }

  const handleUnclaim = async (idShiftType: string) => {
    if (!effectiveUserId) return { error: 'No user account' as unknown }
    return unclaimShift(idShiftType, effectiveUserId)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header bar */}
      <div className="mb-5 rounded-xl bg-gradient-to-r from-[#3b0f62]/5 to-[#f8d040]/5 px-5 py-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-wide">{format(currentMonth, 'MMMM yyyy')}</h2>
            {/* Claims counter as progress dots */}
            {!isBlank && (
              <div className="flex items-center justify-center gap-1.5 mt-1">
                {Array.from({ length: totalLimit }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-6 rounded-full transition-colors ${
                      i < userClaimsCount ? 'bg-[#3b0f62]' : 'bg-black/10'
                    }`}
                  />
                ))}
                <span className="text-[10px] text-muted-foreground ml-1">{userClaimsCount}/{totalLimit}</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Admin user selector */}
        {canManage && employeeNames.length > 0 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-56 h-8 text-sm bg-transparent border-border/20 [&>span:first-child]:flex-1 [&>span:first-child]:text-center">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__blank__">— Blank Calendar —</SelectItem>
                {employeeNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 1-PM count */}
        {!isBlank && user1PMCount > 0 && (
          <div className="mt-2 text-xs text-center text-muted-foreground font-medium">
            1-PM: {user1PMCount}{limits?.pm1_limit != null ? `/${limits.pm1_limit}` : ''}
          </div>
        )}
        {isBlank && (
          <div className="mt-2 text-xs text-center text-muted-foreground">
            Blank calendar — no employee selected
          </div>
        )}
      </div>

      {/* Lock banner */}
      {isLocked && !canManage && (
        <div className="mb-4 flex items-center justify-center gap-2 px-4 py-2 text-sm" style={{ color: '#9a8fb0' }}>
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>The schedule is currently locked by your manager. You'll be notified once changes are available.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Loading calendar...
        </div>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="rounded-xl overflow-hidden shadow-sm border border-border/20">
          <div className="grid grid-cols-7 gap-0">
            {WEEKDAYS.map((d) => (
              <div key={d} className="border-b border-r last:border-r-0 border-border/20 bg-gradient-to-b from-[#f0ede9] to-[#e6e3de] px-2 py-2 text-center text-xs font-semibold text-muted-foreground/70 tracking-wide">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              return (
                <DayCell
                  key={dateStr}
                  date={day}
                  currentMonth={currentMonth}
                  schedule={getScheduleForDate(day)}
                  bonusShifts={canManageShifts ? getBonusShiftsForDate(day) : []}
                  userClaim={effectiveUserId ? getUserClaimForDate(effectiveUserId, dateStr) : undefined}
                  user1PMClaim={effectiveUserId ? getUser1PMClaimForDate(effectiveUserId, dateStr) : undefined}
                  claimedShiftIds={claimedShiftIds}
                  monthlyLimitReached={canManageShifts ? monthlyLimitReached : true}
                  shiftTypeLimitReached={shiftTypeLimitReached}
                  isLocked={isLocked && !canManage}
                  onClaim={canManageShifts ? handleClaim : noopClaim}
                  onUnclaim={canManageShifts ? handleUnclaim : noopUnclaim}
                />
              )
            })}
          </div>
          </div>

          {/* Mobile list (only on very small screens) */}
          <div className="space-y-1 sm:hidden">
            {days
              .filter((day) => format(day, 'yyyy-MM') === monthYear)
              .map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const schedule = getScheduleForDate(day)
                const bonusShifts = canManageShifts ? getBonusShiftsForDate(day) : []
                const userClaim = effectiveUserId ? getUserClaimForDate(effectiveUserId, dateStr) : undefined
                const user1PMClaim = effectiveUserId ? getUser1PMClaimForDate(effectiveUserId, dateStr) : undefined

                return (
                  <div
                    key={dateStr}
                    className="flex items-center gap-3 rounded-md border border-border p-2"
                  >
                    <div className="w-16 shrink-0 text-sm font-medium">
                      {format(day, 'EEE d')}
                    </div>
                    {schedule && (
                      <Badge
                        className="text-[10px] px-1.5 py-0 border-0"
                        style={dayTypeStyles[schedule.day_type] ?? { color: '#666', backgroundColor: '#eee' }}
                      >
                        {schedule.day_type}
                      </Badge>
                    )}
                    {bonusShifts.length > 0 && (
                      <div className="flex-1">
                        <ShiftDropdown
                          bonusShifts={bonusShifts}
                          userClaim={userClaim}
                          user1PMClaim={user1PMClaim}
                          claimedShiftIds={claimedShiftIds}
                          monthlyLimitReached={monthlyLimitReached}
                          shiftTypeLimitReached={shiftTypeLimitReached}
                          isLocked={isLocked && !canManage}
                          dayType={schedule?.day_type}
                          onClaim={handleClaim}
                          onUnclaim={handleUnclaim}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
