import * as XLSX from 'xlsx'
import { format as formatDate } from 'date-fns'
import type { BonusShift, ShiftClaim } from '@/types'

interface ProfileMap {
  [userId: string]: string
}

export function exportAssignments(
  bonusShifts: BonusShift[],
  claims: ShiftClaim[],
  profiles: ProfileMap,
  monthYear: string
) {
  const claimMap = new Map<string, ShiftClaim>()
  for (const c of claims) {
    claimMap.set(c.id_shift_type, c)
  }

  const rows = bonusShifts
    .sort((a, b) => a.date.localeCompare(b.date) || a.row_number - b.row_number)
    .map((shift) => {
      const claim = claimMap.get(shift.id_shift_type)
      return {
        Date: shift.date,
        'Shift Type': shift.shift_type,
        'ID Shift Type': shift.id_shift_type,
        'Claimed By': claim ? (profiles[claim.claimed_by] ?? 'Unknown') : '',
        'Claimed At': claim
          ? formatDate(new Date(claim.claimed_at), 'yyyy-MM-dd HH:mm')
          : '',
      }
    })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Assignments')
  XLSX.writeFile(wb, `bonus-assignments-${monthYear}.xlsx`)
}
