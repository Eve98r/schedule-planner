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
  claimedShiftIds: Set<string>
  monthlyLimitReached: boolean
  isDark?: boolean
  hideClaimedBadge?: boolean
  onClaim: (idShiftType: string, date: string) => Promise<{ error: unknown }>
  onUnclaim: (idShiftType: string) => Promise<{ error: unknown }>
}

export function ShiftDropdown({
  bonusShifts,
  userClaim,
  claimedShiftIds,
  monthlyLimitReached,
  isDark = false,
  hideClaimedBadge = false,
  onClaim,
  onUnclaim,
}: ShiftDropdownProps) {
  const [unclaimOpen, setUnclaimOpen] = useState(false)

  const claimColors: Record<string, { color: string; backgroundColor: string }> = {
    NB:    { color: '#ffffff', backgroundColor: '#8b74bf' },
    MB:    { color: '#ffffff', backgroundColor: '#c9a033' },
    EB:    { color: '#ffffff', backgroundColor: '#4bae9e' },
    '1PM': { color: '#7a6525', backgroundColor: '#f5f0de' },
  }

  if (userClaim) {
    const prefix = userClaim.id_shift_type.replace(/\s*\d+$/, '')
    const style = claimColors[prefix] ?? { color: '#ffffff', backgroundColor: '#6366f1' }

    return (
      <div className="flex items-center justify-center gap-1">
        {!hideClaimedBadge && (
          <Badge className="text-xs font-semibold px-2 py-0.5 border-0" style={style}>
            {userClaim.id_shift_type}
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
                Are you sure you want to unclaim "{userClaim.id_shift_type}"?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUnclaimOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const { error } = await onUnclaim(userClaim.id_shift_type)
                  if (error) {
                    toast.error('Failed to unclaim shift')
                  } else {
                    toast.success('Shift unclaimed')
                  }
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

  const available = bonusShifts.filter((s) => !claimedShiftIds.has(s.id_shift_type))
  if (available.length === 0) return null

  if (monthlyLimitReached) {
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
          const shift = available.find((s) => s.id_shift_type === val)
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
          {available.map((s) => (
            <SelectItem key={s.id_shift_type} value={s.id_shift_type}>
              {s.id_shift_type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
