import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import type { BonusShift, ShiftClaim } from '@/types'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/errorMessages'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useState } from 'react'

interface ShiftDropdownProps {
  bonusShifts: BonusShift[]
  userClaim: ShiftClaim | undefined
  user1PMClaim: ShiftClaim | undefined
  claimedShiftIds: Set<string>
  monthlyLimitReached: boolean
  dayType?: string
  isDark?: boolean
  hideClaimedBadge?: boolean
  onClaim: (idShiftType: string, date: string) => Promise<{ error: unknown }>
  onUnclaim: (idShiftType: string) => Promise<{ error: unknown }>
}

function ShiftLabel({ id }: { id: string }) {
  const match = id.match(/^(.+?)\s*(\d+)$/)
  if (!match) return <>{id}</>
  return <>{match[1]}</>
}

function is1PMShift(id: string): boolean {
  return id.startsWith('1-PM') || id.startsWith('1PM')
}

function getClaimPrefix(idShiftType: string): string {
  return idShiftType.replace(/\s*\d+$/, '')
}

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
  if (blocked.includes(dayType)) return false
  if (existingClaimPrefix && blocked.includes(existingClaimPrefix)) return false
  return true
}

const claimColors: Record<string, { color: string; backgroundColor: string }> = {
  NB:    { color: '#ffffff', backgroundColor: '#8b74bf' },
  MB:    { color: '#ffffff', backgroundColor: '#c9a033' },
  EB:    { color: '#ffffff', backgroundColor: '#4bae9e' },
  '1PM':  { color: '#ffffff', backgroundColor: '#333333' },
  '1-PM': { color: '#ffffff', backgroundColor: '#333333' },
}

function ClaimBadge({ claim, isDark, onUnclaim, hideClaimedBadge }: {
  claim: ShiftClaim
  isDark: boolean
  onUnclaim: (id: string) => Promise<{ error: unknown }>
  hideClaimedBadge: boolean
}) {
  const [unclaimOpen, setUnclaimOpen] = useState(false)
  const prefix = claim.id_shift_type.replace(/\s*\d+$/, '')
  const style = claimColors[prefix] ?? { color: '#ffffff', backgroundColor: '#6366f1' }

  return (
    <div className="flex items-center justify-center gap-1">
      {!hideClaimedBadge && (
        <Badge className="text-xs font-semibold px-2 py-0.5 border-0" style={style}>
          <ShiftLabel id={claim.id_shift_type} />
        </Badge>
      )}
      <Dialog open={unclaimOpen} onOpenChange={setUnclaimOpen}>
        <DialogTrigger asChild>
          <button className={`p-0 leading-none ${isDark ? 'text-white/50 hover:text-white' : 'text-black/30 hover:text-black'}`}>
            <X className="h-3 w-3" strokeWidth={3} />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unclaim Shift</DialogTitle>
            <DialogDescription>
              Are you sure you want to unclaim "{claim.id_shift_type}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnclaimOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const { error } = await onUnclaim(claim.id_shift_type)
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
    </div>
  )
}

export function ShiftDropdown({
  bonusShifts,
  userClaim,
  user1PMClaim,
  claimedShiftIds,
  monthlyLimitReached,
  dayType,
  isDark = false,
  hideClaimedBadge = false,
  onClaim,
  onUnclaim,
}: ShiftDropdownProps) {
  const hasClaim = !!userClaim
  const has1PMClaim = !!user1PMClaim

  // If both claims exist, show both badges
  if (hasClaim && has1PMClaim) {
    return (
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <ClaimBadge claim={userClaim} isDark={isDark} onUnclaim={onUnclaim} hideClaimedBadge={hideClaimedBadge} />
        <ClaimBadge claim={user1PMClaim} isDark={isDark} onUnclaim={onUnclaim} hideClaimedBadge={hideClaimedBadge} />
      </div>
    )
  }

  // If only one claim, show it + possibly a select for the other type
  if (hasClaim || has1PMClaim) {
    const claim = (hasClaim ? userClaim : user1PMClaim)!
    const existingPrefix = hasClaim ? getClaimPrefix(userClaim!.id_shift_type) : null
    const allAvailable = bonusShifts.filter((s) => !claimedShiftIds.has(s.id_shift_type) && isShiftAllowedOnDay(s.id_shift_type, dayType, existingPrefix))
    // Can still claim the other type
    const canClaim1PM = !has1PMClaim && allAvailable.some((s) => is1PMShift(s.id_shift_type))
    const canClaimNon1PM = !hasClaim && !monthlyLimitReached && allAvailable.some((s) => !is1PMShift(s.id_shift_type))
    const remainingAvailable = allAvailable.filter((s) =>
      (canClaim1PM && is1PMShift(s.id_shift_type)) || (canClaimNon1PM && !is1PMShift(s.id_shift_type))
    )

    return (
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <ClaimBadge claim={claim} isDark={isDark} onUnclaim={onUnclaim} hideClaimedBadge={hideClaimedBadge} />
        {remainingAvailable.length > 0 && (
          <Select
            onValueChange={async (val) => {
              const shift = remainingAvailable.find((s) => s.id_shift_type === val)
              if (!shift) return
              const { error } = await onClaim(shift.id_shift_type, shift.date)
              if (error) toast.error(friendlyError(error))
              else toast.success(`Claimed ${shift.id_shift_type}`)
            }}
          >
            <SelectTrigger className={`h-6 text-[10px] w-20 min-w-0 px-1 ${isDark ? 'text-white border-white/40' : ''}`}>
              <SelectValue placeholder="+" />
            </SelectTrigger>
            <SelectContent>
              {remainingAvailable.map((s) => (
                <SelectItem key={s.id_shift_type} value={s.id_shift_type}>
                  {s.id_shift_type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }

  // No claims — show available shifts
  const available = bonusShifts.filter((s) => !claimedShiftIds.has(s.id_shift_type) && isShiftAllowedOnDay(s.id_shift_type, dayType))
  if (available.length === 0) return null

  // Filter: non-1PM blocked by limit, 1PM always available
  const claimable = available.filter((s) =>
    is1PMShift(s.id_shift_type) || !monthlyLimitReached
  )

  if (claimable.length === 0) {
    return (
      <div className={`text-[10px] text-center ${isDark ? 'text-white/70' : 'text-muted-foreground'}`}>
        Limit reached (4/4)
      </div>
    )
  }

  return (
    <div>
      <Select
        onValueChange={async (val) => {
          const shift = claimable.find((s) => s.id_shift_type === val)
          if (!shift) return
          const { error } = await onClaim(shift.id_shift_type, shift.date)
          if (error) {
            toast.error(friendlyError(error))
          } else {
            toast.success(`Claimed ${shift.id_shift_type}`)
          }
        }}
      >
        <SelectTrigger className={`h-6 text-[10px] w-full min-w-0 px-1 ${isDark ? 'text-white border-white/40' : ''}`}>
          <SelectValue placeholder="" />
        </SelectTrigger>
        <SelectContent>
          {claimable.map((s) => (
            <SelectItem key={s.id_shift_type} value={s.id_shift_type}>
              {s.id_shift_type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
