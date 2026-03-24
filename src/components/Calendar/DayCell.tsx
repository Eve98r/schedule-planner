import { useState } from 'react'
import { format, isSameMonth, isToday } from 'date-fns'
import { friendlyError } from '@/lib/errorMessages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { toast } from 'sonner'
import type { BonusShift, DefaultSchedule, ShiftClaim } from '@/types'

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

const bonusPrefixStyles: Record<string, { color: string; backgroundColor: string }> = {
  NB:     { color: '#ffffff', backgroundColor: '#8b74bf' },
  MB:     { color: '#ffffff', backgroundColor: '#c9a033' },
  EB:     { color: '#ffffff', backgroundColor: '#4bae9e' },
  '1PM':  { color: '#ffffff', backgroundColor: '#333333' },
  '1-PM': { color: '#ffffff', backgroundColor: '#333333' },
}

function getClaimPrefix(idShiftType: string): string {
  return idShiftType.replace(/\s*\d+$/, '')
}

function is1PMShift(idShiftType: string): boolean {
  return idShiftType.startsWith('1-PM') || idShiftType.startsWith('1PM')
}

// Bonus shift types that are blocked on certain day types
const blockedOnDayType: Record<string, string[]> = {
  EB:     ['E', 'T'],
  MB:     ['M', 'T'],
  NB:     ['N'],
  '1PM':  ['N', 'NB', 'M', 'MB', 'T'],
  '1-PM': ['N', 'NB', 'M', 'MB', 'T'],
}

function isShiftAllowedOnDay(shiftId: string, dayType: string | undefined, existingClaimPrefix?: string | null): boolean {
  if (!dayType) return true
  const prefix = getClaimPrefix(shiftId)
  const blocked = blockedOnDayType[prefix]
  if (!blocked) return true
  // Check against day type
  if (blocked.includes(dayType)) return false
  // For 1-PM: also check against existing claim type (e.g. NB claim on a W day)
  if (existingClaimPrefix && blocked.includes(existingClaimPrefix)) return false
  return true
}

function ShiftLabel({ id }: { id: string }) {
  const match = id.match(/^(.+?)\s*(\d+)$/)
  if (!match) return <>{id}</>
  return <>{match[1]}</>
}

interface DayCellProps {
  date: Date
  currentMonth: Date
  schedule: DefaultSchedule | undefined
  bonusShifts: BonusShift[]
  userClaim: ShiftClaim | undefined        // non-1PM claim
  user1PMClaim: ShiftClaim | undefined     // 1-PM claim
  claimedShiftIds: Set<string>
  monthlyLimitReached: boolean
  onClaim: (idShiftType: string, date: string) => Promise<{ error: unknown }>
  onUnclaim: (idShiftType: string) => Promise<{ error: unknown }>
}

export function DayCell({
  date,
  currentMonth,
  schedule,
  bonusShifts,
  userClaim,
  user1PMClaim,
  claimedShiftIds,
  monthlyLimitReached,
  onClaim,
  onUnclaim,
}: DayCellProps) {
  const [pickOpen, setPickOpen] = useState(false)
  const [unclaimOpen, setUnclaimOpen] = useState(false)
  const [unclaim1PMOpen, setUnclaim1PMOpen] = useState(false)
  const inMonth = isSameMonth(date, currentMonth)
  const today = isToday(date)

  const dayType = schedule?.day_type
  const hasClaim = !!userClaim
  const has1PMClaim = !!user1PMClaim
  const claimPrefix = hasClaim ? getClaimPrefix(userClaim.id_shift_type) : null
  const claimStyle = claimPrefix ? bonusPrefixStyles[claimPrefix] : null
  const isWReplaced = hasClaim && dayType === 'W'

  // Available shifts: exclude already-claimed ones
  // For non-1PM: can claim if no non-1PM claim exists and limit not reached
  // For 1PM: can claim if no 1PM claim exists (no limit check)
  const allAvailable = bonusShifts.filter((s) => !claimedShiftIds.has(s.id_shift_type) && isShiftAllowedOnDay(s.id_shift_type, dayType, claimPrefix))
  const available1PM = allAvailable.filter((s) => is1PMShift(s.id_shift_type))
  const availableNon1PM = allAvailable.filter((s) => !is1PMShift(s.id_shift_type))

  const canClaimNon1PM = !hasClaim && availableNon1PM.length > 0 && !monthlyLimitReached && inMonth
  const canClaim1PM = !has1PMClaim && available1PM.length > 0 && inMonth
  const canClaim = canClaimNon1PM || canClaim1PM

  // What shifts to show in the picker
  const claimableShifts = [
    ...(canClaimNon1PM ? availableNon1PM : []),
    ...(canClaim1PM ? available1PM : []),
  ]

  const cellBg = isWReplaced && claimStyle
    ? { backgroundColor: claimStyle.backgroundColor }
    : (dayType && inMonth && dayTypeStyles[dayType]
      ? { backgroundColor: dayTypeStyles[dayType].backgroundColor }
      : undefined)

  const isDark = (isWReplaced && !!claimStyle && claimStyle.backgroundColor !== 'transparent') || !!(dayType && ['MB', 'EB', 'NB'].includes(dayType))

  // 1-PM on W day: override to black text, transparent bg
  const claim1PMPrefix = has1PMClaim ? getClaimPrefix(user1PMClaim.id_shift_type) : null
  const claim1PMStyle = claim1PMPrefix ? bonusPrefixStyles[claim1PMPrefix] : null

  const handleCellClick = async () => {
    if (!canClaim || claimableShifts.length === 0) return
    setPickOpen(true)
  }

  const handlePick = async (shift: BonusShift) => {
    const { error } = await onClaim(shift.id_shift_type, shift.date)
    if (error) {
      toast.error(friendlyError(error))
    } else {
      toast.success(`Claimed ${shift.id_shift_type}`)
    }
    setPickOpen(false)
  }

  return (
    <>
      <div
        className={cn(
          'min-h-[80px] border-b border-r border-border/15 p-1 flex flex-col',
          !inMonth && 'opacity-20',
          today && 'ring-2 ring-primary ring-inset',
          canClaim && 'cursor-pointer hover:brightness-95 transition-all'
        )}
        style={inMonth ? cellBg : undefined}
        onClick={handleCellClick}
      >
        {/* Day number — top left */}
        <span className={cn('text-[10px] leading-none', today ? 'text-primary font-bold' : isDark && inMonth ? 'text-white/40' : 'text-black/25')}>
          {format(date, 'd')}
        </span>

        {/* Center badges */}
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
          {/* Day type label (hidden when W is replaced by non-1PM claim) */}
          {dayType && inMonth && !isWReplaced && (
            <span
              className="text-sm font-semibold"
              style={{ color: (dayTypeStyles[dayType] ?? { color: '#666' }).color }}
            >
              {dayType}
            </span>
          )}

          {/* Non-1PM claim badge */}
          {hasClaim && claimStyle && inMonth && (
            isWReplaced ? (
              <span
                className="text-xs font-semibold"
                style={{ color: claimStyle.color }}
              >
                <ShiftLabel id={userClaim.id_shift_type} />
              </span>
            ) : (
              <Badge
                className="text-xs font-semibold px-2 py-0.5 border-0"
                style={claimStyle}
              >
                <ShiftLabel id={userClaim.id_shift_type} />
              </Badge>
            )
          )}

          {/* 1-PM claim badge */}
          {has1PMClaim && claim1PMStyle && inMonth && (
            dayType === 'W' && !hasClaim ? (
              <span
                className="text-xs font-semibold"
                style={{ color: '#000000' }}
              >
                <ShiftLabel id={user1PMClaim.id_shift_type} />
              </span>
            ) : (
              <Badge
                className="text-xs font-semibold px-2 py-0.5 border-0"
                style={claim1PMStyle}
              >
                <ShiftLabel id={user1PMClaim.id_shift_type} />
              </Badge>
            )
          )}
        </div>

        {/* Unclaim buttons at bottom */}
        {(hasClaim || has1PMClaim) && inMonth && (
          <div className="flex justify-center gap-1">
            {hasClaim && (
              <button
                className={`p-0 leading-none ${isDark ? 'text-white/50 hover:text-white' : 'text-black/30 hover:text-black'}`}
                onClick={(e) => { e.stopPropagation(); setUnclaimOpen(true) }}
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            )}
            {has1PMClaim && (
              <button
                className="p-0 leading-none text-black/30 hover:text-black"
                onClick={(e) => { e.stopPropagation(); setUnclaim1PMOpen(true) }}
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pick shift dialog (multiple available) */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Claim Bonus Shift</DialogTitle>
            <DialogDescription>
              Pick a shift for {format(date, 'EEEE, MMM d')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {claimableShifts.map((s) => {
              const prefix = getClaimPrefix(s.id_shift_type)
              const style = bonusPrefixStyles[prefix] ?? { color: '#fff', backgroundColor: '#888' }
              return (
                <button
                  key={s.id_shift_type}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={style}
                  onClick={() => handlePick(s)}
                >
                  <ShiftLabel id={s.id_shift_type} />
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unclaim non-1PM confirmation dialog */}
      <Dialog open={unclaimOpen} onOpenChange={setUnclaimOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unclaim Shift</DialogTitle>
            <DialogDescription>
              Are you sure you want to unclaim "{userClaim?.id_shift_type}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnclaimOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!userClaim) return
                const { error } = await onUnclaim(userClaim.id_shift_type)
                if (error) toast.error('Failed to unclaim shift')
                else toast.success('Shift unclaimed')
                setUnclaimOpen(false)
              }}
            >
              Unclaim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unclaim 1-PM confirmation dialog */}
      <Dialog open={unclaim1PMOpen} onOpenChange={setUnclaim1PMOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unclaim Shift</DialogTitle>
            <DialogDescription>
              Are you sure you want to unclaim "{user1PMClaim?.id_shift_type}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnclaim1PMOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!user1PMClaim) return
                const { error } = await onUnclaim(user1PMClaim.id_shift_type)
                if (error) toast.error('Failed to unclaim shift')
                else toast.success('Shift unclaimed')
                setUnclaim1PMOpen(false)
              }}
            >
              Unclaim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
