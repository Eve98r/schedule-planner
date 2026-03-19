import * as XLSX from 'xlsx'
import { format } from 'date-fns'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 10_000
const ALLOWED_EXTENSIONS = ['.xlsx', '.csv']
const VALID_SHIFT_TYPES = ['NB', 'MB', 'EB', '1PM']
const VALID_DAY_TYPES = ['N', 'M', 'E', 'T', 'OFF', 'V', 'W']

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

function validateFile(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed: 5 MB.`)
  }
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid file type "${ext}". Only .xlsx and .csv files are accepted.`)
  }
}

function sanitizeString(value: string, maxLength = 100): string {
  return value
    .replace(/[<>"'`]/g, '') // strip characters that could be used for injection
    .trim()
    .substring(0, maxLength)
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(new Date(dateStr).getTime())
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
  validateFile(file)
  const buffer = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })

  if (raw.length > MAX_ROWS) {
    throw new Error(`File contains too many rows (${raw.length}). Maximum allowed: ${MAX_ROWS}.`)
  }

  const rows: BonusShiftRow[] = []
  const warnings: string[] = []
  let monthYear = ''

  for (let i = 0; i < raw.length; i++) {
    const arr = raw[i] as unknown[]
    if (!arr[0] && !arr[1]) continue
    // Skip header row
    const first = String(arr[0]).trim().toLowerCase()
    if (first === 'date' || first === 'datum') continue

    const dateStr = excelDateToString(arr[0])
    if (!isValidDate(dateStr)) {
      warnings.push(`Row ${i + 1}: invalid date "${String(arr[0])}"`)
      continue
    }
    if (!monthYear) {
      monthYear = dateStr.substring(0, 7)
    }

    const shiftType = sanitizeString(String(arr[1] ?? ''), 10)
    if (shiftType && !VALID_SHIFT_TYPES.includes(shiftType)) {
      warnings.push(`Row ${i + 1}: unknown shift type "${shiftType}"`)
    }

    const idShiftType = sanitizeString(String(arr[3] ?? ''), 50)
    if (!idShiftType) {
      warnings.push(`Row ${i + 1}: missing id_shift_type`)
      continue
    }

    rows.push({
      date: dateStr,
      shift_type: shiftType,
      row_number: Number(arr[2]) || 0,
      id_shift_type: idShiftType,
      month_year: monthYear,
    })
  }

  if (rows.length === 0) {
    throw new Error('No valid rows found in file.' + (warnings.length > 0 ? ` Issues: ${warnings.slice(0, 3).join('; ')}` : ''))
  }

  return rows.map((r) => ({ ...r, month_year: monthYear }))
}

export async function parseDefaultSchedules(file: File): Promise<DefaultScheduleRow[]> {
  validateFile(file)
  const buffer = await readFileAsArrayBuffer(file)
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })

  if (raw.length > MAX_ROWS) {
    throw new Error(`File contains too many rows (${raw.length}). Maximum allowed: ${MAX_ROWS}.`)
  }

  const rows: DefaultScheduleRow[] = []
  const warnings: string[] = []
  let monthYear = ''

  for (let i = 0; i < raw.length; i++) {
    const arr = raw[i] as unknown[]
    if (!arr[0] && !arr[1]) continue
    // Skip header row
    const first = String(arr[0]).trim().toLowerCase()
    if (first === 'date' || first === 'datum') continue

    const dateStr = excelDateToString(arr[0])
    if (!isValidDate(dateStr)) {
      warnings.push(`Row ${i + 1}: invalid date "${String(arr[0])}"`)
      continue
    }
    if (!monthYear) {
      monthYear = dateStr.substring(0, 7)
    }

    const employee = sanitizeString(String(arr[1] ?? ''), 100)
    if (!employee) {
      warnings.push(`Row ${i + 1}: missing employee name`)
      continue
    }

    const dayType = sanitizeString(String(arr[2] ?? ''), 10).toUpperCase()
    if (dayType && !VALID_DAY_TYPES.includes(dayType)) {
      warnings.push(`Row ${i + 1}: unknown day type "${dayType}"`)
    }

    rows.push({
      date: dateStr,
      employee,
      day_type: dayType,
      month_year: monthYear,
    })
  }

  if (rows.length === 0) {
    throw new Error('No valid rows found in file.' + (warnings.length > 0 ? ` Issues: ${warnings.slice(0, 3).join('; ')}` : ''))
  }

  return rows.map((r) => ({ ...r, month_year: monthYear }))
}
