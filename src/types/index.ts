export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'employee' | 'admin'
  created_at: string
}

export interface BonusShift {
  id: string
  date: string
  shift_type: string
  row_number: number
  id_shift_type: string
  month_year: string
  created_at: string
}

export interface DefaultSchedule {
  id: string
  date: string
  employee: string
  day_type: string
  month_year: string
  created_at: string
}

export interface ShiftClaim {
  id: string
  id_shift_type: string
  claimed_by: string
  claimed_at: string
  month_year: string
  date: string
}

export type DayType = 'OFF' | 'N' | 'M' | 'E' | 'T' | 'V' | 'W'
