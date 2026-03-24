export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'agent' | 'manager' | 'admin'
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

export interface ShiftLimits {
  eb_limit: number
  mb_limit: number
  nb_limit: number
  total_bonus_limit: number
  pm1_limit: number | null
}

export interface GlobalShiftLimits extends ShiftLimits {
  id: string
  updated_at: string
}

export interface EmployeeShiftLimit extends ShiftLimits {
  id: string
  employee_id: string
  is_custom: boolean
  updated_at: string
}

export interface ScheduleLock {
  id: string
  month_year: string
  is_locked: boolean
  updated_at: string
}
