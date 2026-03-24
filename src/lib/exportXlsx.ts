import * as XLSX from 'xlsx'
import { format as formatDate, getDay } from 'date-fns'
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

// Color hex -> XLSX fill color (strip leading #)
function hexToArgb(hex: string): string {
  return 'FF' + hex.replace('#', '')
}

const masterColors: Record<string, { fg: string; bg: string }> = {
  N:     { fg: '5b4a80', bg: 'eee9f5' },
  M:     { fg: '7a6525', bg: 'f5f0de' },
  E:     { fg: '2d6050', bg: 'e3f0ea' },
  T:     { fg: '7a4a7a', bg: 'f2e8f2' },
  OFF:   { fg: '999999', bg: 'f5f5f5' },
  V:     { fg: '999999', bg: 'f5f5f5' },
  W:     { fg: 'bbbbbb', bg: 'fafafa' },
  WO:    { fg: 'c09090', bg: 'f5f2f2' },
  VW:    { fg: 'c09090', bg: 'f5f2f2' },
  NB:    { fg: 'ffffff', bg: '8b74bf' },
  MB:    { fg: 'ffffff', bg: 'c9a033' },
  EB:    { fg: 'ffffff', bg: '4bae9e' },
  '1PM': { fg: 'ffffff', bg: '555555' },
}

function is1PMId(id: string): boolean {
  return id.startsWith('1-PM') || id.startsWith('1PM')
}

function getPrefix(id: string): string {
  return id.replace(/\s*\d+$/, '')
}

export function exportMasterCalendar(
  employeeNames: string[],
  days: Date[],
  scheduleMap: Record<string, string>,
  claimMap: Record<string, string[]>,
  monthYear: string
) {
  // Build array of arrays: first row = header with day-of-week, second row = day numbers
  const headerRow1 = ['Employee', ...days.map((d) => formatDate(d, 'EEE'))]
  const headerRow2 = ['', ...days.map((d) => formatDate(d, 'd'))]

  const dataRows = employeeNames.map((name) => {
    const row: string[] = [name]
    for (const day of days) {
      const dateStr = formatDate(day, 'yyyy-MM-dd')
      const dayType = scheduleMap[`${name}|${dateStr}`] ?? ''
      const claimedIds = claimMap[`${name}|${dateStr}`] ?? []
      const non1PM = claimedIds.filter((id) => !is1PMId(id))
      const pm1 = claimedIds.filter((id) => is1PMId(id))

      let text = dayType
      if (non1PM.length > 0) text = getPrefix(non1PM[0])
      if (pm1.length > 0) text = text ? `${text}\n1PM` : '1PM'
      row.push(text)
    }
    return row
  })

  const allRows = [headerRow1, headerRow2, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  // Column widths
  const cols: XLSX.ColInfo[] = [{ wch: 20 }, ...days.map(() => ({ wch: 5 }))]
  ws['!cols'] = cols

  // Apply cell styling
  for (let r = 2; r < allRows.length; r++) {
    for (let c = 1; c <= days.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      const cell = ws[cellRef]
      if (!cell) continue

      const value = String(cell.v ?? '')
      const primary = value.split('\n')[0]
      const colorKey = primary in masterColors ? primary : null

      if (colorKey) {
        const mc = masterColors[colorKey]
        cell.s = {
          fill: { fgColor: { rgb: mc.bg } },
          font: { color: { rgb: mc.fg }, bold: true, sz: 9 },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        }
      } else {
        cell.s = {
          alignment: { horizontal: 'center', vertical: 'center' },
          font: { sz: 9 },
        }
      }

      // Weekend tint
      const dow = getDay(days[c - 1])
      if ((dow === 0 || dow === 6) && !colorKey) {
        cell.s = {
          ...cell.s,
          fill: { fgColor: { rgb: 'f2f0ec' } },
        }
      }
    }
  }

  // Style header rows
  for (let c = 0; c <= days.length; c++) {
    for (let r = 0; r < 2; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      const cell = ws[cellRef]
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: 'f0ede9' } },
          font: { bold: true, sz: 9 },
          alignment: { horizontal: 'center' },
        }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Master Calendar')
  XLSX.writeFile(wb, `master-calendar-${monthYear}.xlsx`)
}
