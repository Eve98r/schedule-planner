import { useState, useEffect, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => value ? parseInt(value.split('-')[0]) : 2026)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectedMonth = value ? parseInt(value.split('-')[1]) - 1 : -1
  const selectedYear = value ? parseInt(value.split('-')[0]) : -1

  const label = value
    ? `${MONTH_FULL[selectedMonth]} ${selectedYear}`
    : 'Select month'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-8 inline-flex items-center gap-2 rounded-md border border-border/40 bg-background px-3 text-sm shadow-sm hover:bg-muted/30 transition-colors"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-lg border border-border/40 bg-card shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setYear(y => Math.max(2026, y - 1))}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground"
              disabled={year <= 2026}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              value={year}
              min={2026}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                if (!isNaN(v)) setYear(v)
              }}
              className="w-16 text-center text-sm font-semibold bg-transparent border-b border-transparent hover:border-border/50 focus:border-[#3b0f62] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setYear(y => y + 1)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const val = `${year}-${String(i + 1).padStart(2, '0')}`
              const isSelected = value === val
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onChange(isSelected ? '' : val); setOpen(false) }}
                  className={`h-8 rounded-md text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-[#3b0f62] text-white'
                      : 'hover:bg-[#3b0f62]/10 text-foreground'
                  }`}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
