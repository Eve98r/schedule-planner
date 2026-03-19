import * as XLSX from 'xlsx'
import { format } from 'date-fns'

export interface BonusShiftRow {
  date: string
  shift_type: string
  row_number: number
  id_shift_type: string
  month_year: string
}

export interface DefaultScheduleRow {
  date: string
  employee: string
  day_type: string
  month_year: string
}

function excelDateToString(value: unknown): string {
  if (value instanceof Date) {
    return format(value, 'yyyy-MM-dd')
  }
  const str = String(value).trim()
  // Already yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }
  // Excel serial number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  // Try parsing other date formats
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return format(parsed, 'yyyy-MM-dd')
  }
  return str
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export async function parseBonusList(file: File): Promise<BonusShiftRow[]> {
  const buffer = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })

  const rows: BonusShiftRow[] = []
  let monthYear = ''

  for (const row of raw) {
    const arr = row as unknown[]
    if (!arr[0] && !arr[1]) continue
    // Skip header row
    const first = String(arr[0]).trim().toLowerCase()
    if (first === 'date' || first === 'datum') continue

    const dateStr = excelDateToString(arr[0])
    if (!monthYear && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      monthYear = dateStr.substring(0, 7)
    }

    rows.push({
      date: dateStr,
      shift_type: String(arr[1] ?? '').trim(),
      row_number: Number(arr[2]) || 0,
      id_shift_type: String(arr[3] ?? '').trim(),
      month_year: monthYear,
    })
  }

  return rows.map((r) => ({ ...r, month_year: monthYear }))
}

export async function parseDefaultSchedules(file: File): Promise<DefaultScheduleRow[]> {
  const buffer = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })

  const rows: DefaultScheduleRow[] = []
  let monthYear = ''

  for (const row of raw) {
    const arr = row as unknown[]
    if (!arr[0] && !arr[1]) continue
    // Skip header row
    const first = String(arr[0]).trim().toLowerCase()
    if (first === 'date' || first === 'datum') continue

    const dateStr = excelDateToString(arr[0])
    if (!monthYear && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      monthYear = dateStr.substring(0, 7)
    }

    rows.push({
      date: dateStr,
      employee: String(arr[1] ?? '').trim(),
      day_type: String(arr[2] ?? '').trim(),
      month_year: monthYear,
    })
  }

  return rows.map((r) => ({ ...r, month_year: monthYear }))
}
