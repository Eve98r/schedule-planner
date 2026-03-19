import { useState } from 'react'
import { format, isSameMonth, isToday } from 'date-fns'
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
  '1PM': { color: '#7a6525', backgroundColor: '#f5f0de' },
}

const bonusPrefixStyles: Record<string, { color: string; backgroundColor: string }> = {
  NB:    { color: '#ffffff', backgroundColor: '#8b74bf' },
  MB:    { color: '#ffffff', backgroundColor: '#c9a033' },
  EB:    { color: '#ffffff', backgroundColor: '#4bae9e' },
  '1PM': { color: '#7a6525', backgroundColor: '#f5f0de' },
}

function getClaimPrefix(idShiftType: string): string {
  return idShiftType.replace(/\s*\d+$/, '')
}

interface DayCellProps {
  date: Date
  currentMonth: Date
  schedule: DefaultSchedule | undefined
  bonusShifts: BonusShift[]
  userClaim: ShiftClaim | undefined
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
  claimedShiftIds,
  monthlyLimitReached,
  onClaim,
  onUnclaim,
}: DayCellProps) {
  const [pickOpen, setPickOpen] = useState(false)
  const [unclaimOpen, setUnclaimOpen] = useState(false)
  const inMonth = isSameMonth(date, currentMonth)
  const today = isToday(date)

  const dayType = schedule?.day_type
  const hasClaim = !!userClaim
  const claimPrefix = hasClaim ? getClaimPrefix(userClaim.id_shift_type) : null
  const claimStyle = claimPrefix ? bonusPrefixStyles[claimPrefix] : null
  const isWReplaced = hasClaim && dayType === 'W'

  const available = bonusShifts.filter((s) => !claimedShiftIds.has(s.id_shift_type))
  const canClaim = !hasClaim && available.length > 0 && !monthlyLimitReached && inMonth

  const cellBg = isWReplaced && claimStyle
    ? { backgroundColor: claimStyle.backgroundColor }
    : (dayType && inMonth && dayTypeStyles[dayType]
      ? { backgroundColor: dayTypeStyles[dayType].backgroundColor }
      : undefined)

  const accentBorder = hasClaim && !isWReplaced && claimStyle
    ? { borderLeft: `3px solid ${claimStyle.backgroundColor}` }
    : undefined

  const isDark = (isWReplaced && !!claimStyle) || !!(dayType && ['MB', 'EB', 'NB'].includes(dayType))

  const handleCellClick = async () => {
    if (!canClaim) return
    if (available.length === 1) {
      const shift = available[0]
      const { error } = await onClaim(shift.id_shift_type, shift.date)
      if (error) {
        toast.error((error as { message?: string }).message ?? 'Failed to claim')
      } else {
        toast.success(`Claimed ${shift.id_shift_type}`)
      }
    } else {
      setPickOpen(true)
    }
  }

  const handlePick = async (shift: BonusShift) => {
    const { error } = await onClaim(shift.id_shift_type, shift.date)
    if (error) {
      toast.error((error as { message?: string }).message ?? 'Failed to claim')
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
        style={inMonth ? { ...cellBg, ...accentBorder } : undefined}
        onClick={handleCellClick}
      >
        {/* Day number — top left */}
        <span className={cn('text-[10px] leading-none', today && 'text-primary font-bold', isDark && inMonth && 'text-white/70')}>
          {format(date, 'd')}
        </span>

        {/* Center badges */}
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
          {dayType && inMonth && !isWReplaced && (
            <span
              className="text-sm font-semibold"
              style={{ color: (dayTypeStyles[dayType] ?? { color: '#666' }).color }}
            >
              {dayType}
            </span>
          )}

          {hasClaim && claimStyle && inMonth && (
            isWReplaced ? (
              <span
                className="text-xs font-semibold"
                style={{ color: claimStyle.color }}
              >
                {userClaim.id_shift_type}
              </span>
            ) : (
              <Badge
                className="text-[10px] font-semibold px-1.5 py-0 border-0"
                style={claimStyle}
              >
                {userClaim.id_shift_type}
              </Badge>
            )
          )}
        </div>

        {/* Unclaim X at bottom */}
        {hasClaim && inMonth && (
          <div className="flex justify-center">
            <button
              className={`p-0 leading-none ${isDark ? 'text-white/50 hover:text-white' : 'text-black/30 hover:text-black'}`}
              onClick={(e) => { e.stopPropagation(); setUnclaimOpen(true) }}
            >
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
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
            {available.map((s) => {
              const prefix = getClaimPrefix(s.id_shift_type)
              const style = bonusPrefixStyles[prefix] ?? { color: '#fff', backgroundColor: '#888' }
              return (
                <button
                  key={s.id_shift_type}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={style}
                  onClick={() => handlePick(s)}
                >
                  {s.id_shift_type}
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Unclaim confirmation dialog */}
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
    </>
  )
}
