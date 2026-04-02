import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isToday,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { DefaultSchedule, BonusShift, ShiftClaim, Profile } from '@/types'

// ── Color Palette ───────────────────────────────────────────────────
const SHIFT_COLORS: Record<string, { color: string; bg: string }> = {
  N:   { color: '#5b4a80', bg: '#ece5f5' },
  M:   { color: '#7a6525', bg: '#f5efd8' },
  E:   { color: '#2d6050', bg: '#dff0e8' },
  T:   { color: '#7a4a7a', bg: '#f0e5f0' },
  OFF: { color: '#aaa',    bg: '#f2f2f2' },
  V:   { color: '#aaa',    bg: '#f2f2f2' },
  W:   { color: '#ccc',    bg: 'transparent' },
  WO:  { color: '#c09090', bg: '#f5f2f2' },
  VW:  { color: '#c09090', bg: '#f5f2f2' },
}
const CLAIM_COLORS: Record<string, { color: string; bg: string }> = {
  NB:     { color: '#fff', bg: '#8b74bf' },
  MB:     { color: '#fff', bg: '#c9a033' },
  EB:     { color: '#fff', bg: '#4bae9e' },
  '1PM':  { color: '#fff', bg: '#555' },
  '1-PM': { color: '#fff', bg: '#555' },
}
const COVERAGE_TYPES = ['M', 'E', 'N', 'T'] as const
const COVERAGE_COLORS: Record<string, string> = { N: '#8b74bf', M: '#c9a033', E: '#4bae9e', T: '#b07ab0' }
const COVERAGE_LIGHT: Record<string, { bg: string; fg: string }> = {
  M: { bg: '#f5efd8', fg: '#7a6525' },
  E: { bg: '#dff0e8', fg: '#2d6050' },
  N: { bg: '#ece5f5', fg: '#5b4a80' },
  T: { bg: '#f0e5f0', fg: '#7a4a7a' },
}
const COVERAGE_LABELS: Record<string, string> = { N: 'Night', M: 'Morning', E: 'Evening', T: 'Training' }

function getClaimPrefix(id: string) { return id.replace(/\s*\d+$/, '') }
function is1PM(id: string) { return id.startsWith('1-PM') || id.startsWith('1PM') }

// ── Main Component ──────────────────────────────────────────────────
export function MasterCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const saved = localStorage.getItem('sp_master_month')
    return saved ? new Date(saved + '-01') : new Date()
  })
  const monthYear = format(currentMonth, 'yyyy-MM')
  const [schedules, setSchedules] = useState<DefaultSchedule[]>([])
  const [bonusShifts, setBonusShifts] = useState<BonusShift[]>([])
  const [claims, setClaims] = useState<ShiftClaim[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  // Crosshair hover via DOM — no re-renders
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => { localStorage.setItem('sp_master_month', monthYear) }, [monthYear])

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      // Supabase limits to 1000 rows per query — fetch in pages for large datasets
      const fetchAll = async (table: string, filter: Record<string, string>) => {
        const rows: any[] = []
        let from = 0
        const pageSize = 1000
        while (true) {
          let q = supabase.from(table).select('*').range(from, from + pageSize - 1)
          for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
          const { data } = await q
          if (!data || data.length === 0) break
          rows.push(...data)
          if (data.length < pageSize) break
          from += pageSize
        }
        return rows
      }
      const [schedData, bonusData, claimsData, profRes] = await Promise.all([
        fetchAll('default_schedules', { month_year: monthYear }),
        fetchAll('bonus_shifts', { month_year: monthYear }),
        fetchAll('shift_claims', { month_year: monthYear }),
        supabase.from('profiles').select('*').order('full_name'),
      ])
      setSchedules(schedData)
      setBonusShifts(bonusData)
      setClaims(claimsData)
      setProfiles(profRes.data ?? [])
      setLoading(false)
    }
    fetchAll()
    setSelectedDay(null)
  }, [monthYear])

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }), [currentMonth])
  // Sort employees by dominant shift type: M → T → E → N → rest
  // Within N: auto-detect teams by overlapping work days and group them together
  const SHIFT_ORDER: Record<string, number> = { M: 0, T: 1, E: 2, N: 3 }
  const employeeNames = useMemo(() => {
    const names = [...new Set(schedules.map((s) => s.employee))]

    // Count shift types and collect N-shift dates per employee
    const shiftCounts: Record<string, Record<string, number>> = {}
    const nDays: Record<string, Set<string>> = {}
    for (const s of schedules) {
      if (!shiftCounts[s.employee]) shiftCounts[s.employee] = {}
      shiftCounts[s.employee][s.day_type] = (shiftCounts[s.employee][s.day_type] ?? 0) + 1
      if (s.day_type === 'N') {
        if (!nDays[s.employee]) nDays[s.employee] = new Set()
        nDays[s.employee].add(s.date)
      }
    }

    const getDominant = (name: string): string => {
      const counts = shiftCounts[name] ?? {}
      let best = ''
      let bestCount = 0
      for (const t of ['M', 'T', 'E', 'N']) {
        if ((counts[t] ?? 0) > bestCount) { best = t; bestCount = counts[t] }
      }
      return best
    }

    // Cluster N workers into teams by overlapping days
    // Two employees are on the same team if they share >50% of their N days
    const nightWorkers = names.filter((n) => getDominant(n) === 'N')
    const teamMap: Record<string, number> = {}
    const teams: string[][] = []
    for (const name of nightWorkers) {
      const myDays = nDays[name] ?? new Set()
      let bestTeam = -1
      let bestOverlap = 0
      for (let t = 0; t < teams.length; t++) {
        const rep = teams[t][0]
        const repDays = nDays[rep] ?? new Set()
        let overlap = 0
        for (const d of myDays) if (repDays.has(d)) overlap++
        const pct = myDays.size > 0 ? overlap / myDays.size : 0
        if (pct > 0.5 && overlap > bestOverlap) { bestTeam = t; bestOverlap = overlap }
      }
      if (bestTeam >= 0) {
        teams[bestTeam].push(name)
        teamMap[name] = bestTeam
      } else {
        teamMap[name] = teams.length
        teams.push([name])
      }
    }

    return names.sort((a, b) => {
      const da = getDominant(a)
      const db = getDominant(b)
      const oa = SHIFT_ORDER[da] ?? 99
      const ob = SHIFT_ORDER[db] ?? 99
      if (oa !== ob) return oa - ob
      // Within N: sort by team, then alphabetically
      if (da === 'N' && db === 'N') {
        const ta = teamMap[a] ?? 99
        const tb = teamMap[b] ?? 99
        if (ta !== tb) return ta - tb
      }
      return a.localeCompare(b)
    })
  }, [schedules])
  const profileNameMap = useMemo(() => { const m: Record<string, string> = {}; for (const p of profiles) m[p.id] = p.full_name; return m }, [profiles])
  const scheduleMap = useMemo(() => { const m: Record<string, string> = {}; for (const s of schedules) m[`${s.employee}|${s.date}`] = s.day_type; return m }, [schedules])
  const claimMap = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const c of claims) { const n = profileNameMap[c.claimed_by] ?? '?'; const k = `${n}|${c.date}`; if (!m[k]) m[k] = []; m[k].push(c.id_shift_type) }
    return m
  }, [claims, profileNameMap])

  // Unclaimed bonus shifts per day per type: { '2026-04-01': { EB: 2, MB: 0, NB: 1 } }
  const claimedShiftIds = useMemo(() => new Set(claims.map((c) => c.id_shift_type)), [claims])
  const unclaimedPerDay = useMemo(() => {
    const result: Record<string, Record<string, number>> = {}
    for (const bs of bonusShifts) {
      if (claimedShiftIds.has(bs.id_shift_type)) continue
      if (is1PM(bs.id_shift_type)) continue // skip 1PM for coverage
      const prefix = getClaimPrefix(bs.id_shift_type) // EB, MB, NB
      if (!result[bs.date]) result[bs.date] = { EB: 0, MB: 0, NB: 0 }
      if (prefix in result[bs.date]) result[bs.date][prefix]++
    }
    return result
  }, [bonusShifts, claimedShiftIds])

  const dailyCoverage = useMemo(() => {
    const result: Record<string, Record<string, string[]>> = {}
    for (const day of days) {
      const d = format(day, 'yyyy-MM-dd')
      const cov: Record<string, string[]> = {}
      for (const t of [...COVERAGE_TYPES, 'OFF', 'V', 'W']) cov[t] = []
      for (const name of employeeNames) { const dt = scheduleMap[`${name}|${d}`]; if (dt) { if (!cov[dt]) cov[dt] = []; cov[dt].push(name) } }
      result[d] = cov
    }
    return result
  }, [days, employeeNames, scheduleMap])




  const prev = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  const next = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))

  // DOM-based crosshair hover — no React re-renders
  const lastHover = useRef<{ row: string; col: string } | null>(null)

  const handleGridHover = useCallback((e: React.MouseEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-row][data-col]')
    if (!cell) return
    const row = cell.dataset.row!
    const col = cell.dataset.col!
    if (lastHover.current?.row === row && lastHover.current?.col === col) return
    const grid = gridRef.current
    if (!grid) return

    // Clear previous
    if (lastHover.current) {
      grid.querySelectorAll('.grid-hov-row').forEach((el) => el.classList.remove('grid-hov-row'))
      grid.querySelectorAll('.grid-hov-col').forEach((el) => el.classList.remove('grid-hov-col'))
      grid.querySelectorAll('.grid-hov-name').forEach((el) => el.classList.remove('grid-hov-name'))
    }

    // Highlight row cells + name cell
    const tr = cell.closest('tr')
    if (tr) {
      tr.querySelectorAll('.grid-cell').forEach((el) => el.classList.add('grid-hov-row'))
      const nameCell = tr.querySelector('.grid-name')
      if (nameCell) nameCell.classList.add('grid-hov-name')
    }
    // Highlight column cells + header
    grid.querySelectorAll(`[data-col="${col}"]`).forEach((el) => el.classList.add('grid-hov-col'))

    lastHover.current = { row, col }
  }, [])

  const handleGridLeave = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return
    grid.querySelectorAll('.grid-hov-row').forEach((el) => el.classList.remove('grid-hov-row'))
    grid.querySelectorAll('.grid-hov-col').forEach((el) => el.classList.remove('grid-hov-col'))
    grid.querySelectorAll('.grid-hov-name').forEach((el) => el.classList.remove('grid-hov-name'))
    lastHover.current = null
  }, [])

  // Touch direction locking for All Schedules grid (Issue 2)
  const touchRef = useRef<{ startX: number; startY: number; locked: 'h' | 'v' | null }>({ startX: 0, startY: 0, locked: null })
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = { startX: t.clientX, startY: t.clientY, locked: null }
  }, [])
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    const tr = touchRef.current
    if (!tr.locked) {
      const dx = Math.abs(t.clientX - tr.startX)
      const dy = Math.abs(t.clientY - tr.startY)
      if (dx < 5 && dy < 5) return // not enough movement to decide
      tr.locked = dx > dy ? 'h' : 'v'
    }
    const el = gridRef.current
    if (!el) return
    if (tr.locked === 'h') {
      // Lock to horizontal — prevent vertical scroll
      el.style.overflowY = 'hidden'
    } else {
      // Lock to vertical — prevent horizontal scroll
      el.style.overflowX = 'hidden'
    }
  }, [])
  const handleTouchEnd = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    el.style.overflowX = ''
    el.style.overflowY = ''
    touchRef.current = { startX: 0, startY: 0, locked: null }
  }, [])

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>

  if (employeeNames.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-5">
        <PageHeader currentMonth={currentMonth} prev={prev} next={next} />
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">No schedule data for {format(currentMonth, 'MMMM yyyy')}.</div>
      </div>
    )
  }

  const selectedCov = selectedDay ? dailyCoverage[selectedDay] : null
  const selectedClaims = selectedDay ? claims.filter((c) => c.date === selectedDay).map((c) => ({ name: profileNameMap[c.claimed_by] ?? '?', prefix: getClaimPrefix(c.id_shift_type) })) : []

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-3 sm:px-5 sm:py-5 overflow-auto">
      <PageHeader currentMonth={currentMonth} prev={prev} next={next} />

      {/* ═══ Daily Coverage ═══ */}
      <div className="mb-6 rounded-xl border border-border/25 bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-1 flex items-center justify-between" style={{ backgroundColor: '#1a1a3e' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Daily Coverage</span>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            {COVERAGE_TYPES.map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: COVERAGE_COLORS[t], opacity: 0.8 }} />
                <span className="hidden sm:inline text-[9px] text-white/50 font-medium">{COVERAGE_LABELS[t]}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Day labels + coverage data — single horizontal scroll */}
        <div className="overflow-x-auto" style={{ overscrollBehaviorX: 'none', backgroundColor: '#eeeeee' }}>
        <div className="flex border-y-2 border-border/30" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.08), inset 0 2px 4px rgba(0,0,0,0.04)', minWidth: `${days.length * 40}px` }}>
          {days.map((day) => {
            const dow = getDay(day)
            const isWeekend = dow === 0 || dow === 6
            const isSel = selectedDay === format(day, 'yyyy-MM-dd')
            return (
              <div
                key={format(day, 'dd') + 'h'}
                className="flex flex-col items-center flex-1 min-w-[40px] py-1.5 border-r border-border/15 last:border-r-0"
                style={{ backgroundColor: isSel ? '#e0e0e0' : isWeekend ? '#e8e8e8' : '#eeeeee' }}
              >
                <span className={`text-[9px] leading-none ${isWeekend ? 'text-red-400/50' : 'text-muted-foreground/50'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`text-[12px] font-semibold leading-tight mt-0.5 ${isToday(day) ? 'text-primary font-bold' : 'text-foreground/80'}`}>
                  {format(day, 'd')}
                </span>
              </div>
            )
          })}
        </div>
        {/* Coverage data rows */}
        <div className="flex" style={{ minWidth: `${days.length * 40}px` }}>
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const isSel = selectedDay === dateStr
            const cov = dailyCoverage[dateStr] ?? {}

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDay(isSel ? null : dateStr)}
                className="flex flex-col items-center flex-1 min-w-[40px] py-1.5 transition-colors border-r border-border/10 last:border-r-0"
                style={{
                  backgroundColor: isSel ? 'rgba(26,26,62,0.04)' : 'transparent',
                  boxShadow: isSel ? 'inset 0 -2px 0 #1a1a3e' : 'none',
                }}
              >
                <div className="flex flex-col gap-[2px] mt-1.5 w-full px-0.5">
                  {COVERAGE_TYPES.map((t) => {
                    const count = (cov[t] ?? []).length
                    const bonusKey = t === 'N' ? 'NB' : t === 'M' ? 'MB' : t === 'E' ? 'EB' : null
                    const unclaimed = bonusKey ? (unclaimedPerDay[dateStr]?.[bonusKey] ?? 0) : 0
                    const hasOpenSlots = unclaimed > 0
                    const isComplete = !hasOpenSlots
                    return (
                      <div
                        key={t}
                        className="flex items-center justify-center rounded-[3px] h-[20px] group/cov"
                        style={{
                          backgroundColor: isComplete ? 'transparent' : (COVERAGE_LIGHT[t]?.bg ?? '#f0f0f0'),
                        }}
                        title={`${COVERAGE_LABELS[t]}: ${unclaimed} open · ${count} staff`}
                      >
                        <span className="text-[11px] font-bold leading-none group-hover/cov:hidden" style={{ color: isComplete ? '#ccc' : (COVERAGE_LIGHT[t]?.fg ?? '#666') }}>
                          {isComplete ? '✓' : unclaimed}
                        </span>
                        <span className="text-[11px] font-bold leading-none hidden group-hover/cov:inline" style={{ color: isComplete ? '#aaa' : (COVERAGE_LIGHT[t]?.fg ?? '#666') }}>
                          {count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
        </div>
      </div>

      {/* ═══ Day Detail ═══ */}
      {selectedDay && selectedCov && (
        <div className="mb-6 rounded-xl border border-border/25 bg-card shadow-sm p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {format(new Date(selectedDay + 'T00:00'), 'EEEE, MMMM d')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {[...COVERAGE_TYPES, 'OFF' as const].map((t) => {
              const people = selectedCov[t] ?? []
              const c = t === 'OFF' ? { bg: '#e8e8e8', fg: '#888' } : { bg: COVERAGE_COLORS[t], fg: '#fff' }
              return (
                <div key={t} className="rounded-lg overflow-hidden border border-border/15">
                  <div className="px-2.5 py-1 flex items-center justify-between" style={{ backgroundColor: c.bg }}>
                    <span className="text-[11px] font-bold" style={{ color: c.fg }}>{COVERAGE_LABELS[t] ?? t}</span>
                    <span className="text-[11px] font-bold" style={{ color: c.fg }}>{people.length}</span>
                  </div>
                  <div className="px-2.5 py-1.5 space-y-px">
                    {people.length > 0 ? people.map((n) => (
                      <div key={n} className="text-[11px] text-foreground/80 truncate leading-snug">{n}</div>
                    )) : <div className="text-[11px] text-muted-foreground/40 italic">—</div>}
                  </div>
                </div>
              )
            })}
            {selectedClaims.length > 0 && (
              <div className="rounded-lg overflow-hidden border border-border/15">
                <div className="px-2.5 py-1 flex items-center justify-between" style={{ backgroundColor: '#3b0f62' }}>
                  <span className="text-[11px] font-bold text-white">Bonus</span>
                  <span className="text-[11px] font-bold text-white">{selectedClaims.length}</span>
                </div>
                <div className="px-2.5 py-1.5 space-y-px">
                  {selectedClaims.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 leading-snug">
                      <span className="text-[9px] font-bold px-1 rounded" style={CLAIM_COLORS[c.prefix] ? { color: CLAIM_COLORS[c.prefix].color, backgroundColor: CLAIM_COLORS[c.prefix].bg } : {}}>{c.prefix}</span>
                      <span className="text-[11px] text-foreground/80 truncate">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ All Schedules Grid ═══ */}
      <div className="mb-6 rounded-xl border border-border/25 bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-0.5" style={{ backgroundColor: '#1a1a3e' }}>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">All Schedules</span>
        </div>
        <div
          ref={gridRef}
          className="overflow-auto schedule-grid"
          style={{ maxHeight: 'calc(26px * 20 + 40px)', overscrollBehavior: 'none', backgroundColor: '#f5f3f0' }}
          onMouseMove={handleGridHover}
          onMouseLeave={handleGridLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <table className="border-collapse w-full" style={{ minWidth: `${days.length * 34 + 140}px` }}>
            <thead className="sticky top-0 z-30" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.08), inset 0 2px 4px rgba(0,0,0,0.04)' }}>
              <tr>
                <th className="sticky left-0 z-30 border-y-2 border-border/30 border-r border-border/15 px-3 py-2 text-left text-[11px] font-semibold text-foreground/70" style={{ minWidth: 140, backgroundColor: '#eeeeee', touchAction: 'pan-y' }}>
                  Agent
                </th>
                {days.map((day, colIdx) => {
                  const dow = getDay(day)
                  const isSat = dow === 6
                  const isSun = dow === 0
                  return (
                    <th
                      key={format(day, 'dd')}
                      data-col={colIdx}
                      className="grid-th border-y-2 border-border/30 border-r border-border/15 px-0 py-1.5 text-center"
                      style={{ backgroundColor: isSat || isSun ? '#e8e8e8' : '#eeeeee', minWidth: 32, touchAction: 'pan-x' }}
                    >
                      <div className={`text-[9px] leading-none font-medium ${isSat || isSun ? 'text-red-400/50' : 'text-muted-foreground/50'}`}>{format(day, 'EEE')}</div>
                      <div className={`text-[11px] leading-tight font-semibold ${isToday(day) ? 'text-primary font-bold' : 'text-foreground/80'}`}>{format(day, 'd')}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {employeeNames.map((name, rowIdx) => {
                return (
                  <tr key={name} data-row={rowIdx}>
                    <td
                      className="grid-name sticky left-0 z-10 border-b border-r border-border/10 px-3 py-0.5 text-[11px] font-medium whitespace-nowrap"
                      style={{ backgroundColor: '#f5f3f0', color: 'rgba(0,0,0,0.8)', touchAction: 'pan-y' }}
                    >
                      {name}
                    </td>
                    {days.map((day, colIdx) => {
                      const dateStr = format(day, 'yyyy-MM-dd')
                      const dayType = scheduleMap[`${name}|${dateStr}`]
                      const ids = claimMap[`${name}|${dateStr}`] ?? []
                      const non1PM = ids.filter((id) => !is1PM(id))
                      const has1PM = ids.some((id) => is1PM(id))
                      const hasNon1PM = non1PM.length > 0

                      // Determine base shift display
                      let baseBg = '#f5f3f0'
                      let baseFg = '#ccc'
                      let baseText = ''
                      const isWType = dayType === 'W' || dayType === 'WO' || dayType === 'OFF' || dayType === 'VW' || dayType === 'V'
                      if (dayType) {
                        if (isWType) {
                          baseText = dayType === 'W' ? '' : dayType
                        } else {
                          const s = SHIFT_COLORS[dayType]
                          if (s) { baseBg = s.bg; baseFg = s.color }
                          baseText = dayType
                        }
                      }

                      // Determine bonus shift display
                      let bonusText = ''
                      let bonusBg = ''
                      let bonusFg = ''
                      if (hasNon1PM) {
                        const prefix = getClaimPrefix(non1PM[0])
                        bonusText = prefix
                        const s = CLAIM_COLORS[prefix]
                        if (s) { bonusBg = s.bg; bonusFg = s.color }
                      }

                      // W is replaced by bonus; other base types show alongside
                      const showBase = baseText && !(dayType === 'W' && hasNon1PM)
                      const showBonus = hasNon1PM
                      const cellBg = showBonus && !showBase ? bonusBg : baseBg

                      return (
                        <td
                          key={dateStr}
                          data-row={rowIdx}
                          data-col={colIdx}
                          className="grid-cell border-b border-r border-border/6 text-center p-0"
                          style={{ backgroundColor: cellBg, touchAction: 'pan-x' }}
                        >
                          <div className="flex flex-col items-center justify-center h-[26px]">
                            {showBase && <span className="text-[10px] font-bold leading-none" style={{ color: baseFg }}>{baseText}</span>}
                            {showBonus && (
                              <span
                                className="font-bold leading-none"
                                style={{
                                  color: showBase ? bonusFg : bonusFg,
                                  backgroundColor: showBase ? bonusBg : 'transparent',
                                  fontSize: showBase ? '7px' : '10px',
                                  borderRadius: showBase ? '2px' : undefined,
                                  padding: showBase ? '0 2px' : undefined,
                                }}
                              >
                                {bonusText}
                              </span>
                            )}
                            {has1PM && (
                              <span
                                className="font-semibold leading-none"
                                style={{
                                  color: (showBonus && !showBase) ? 'rgba(255,255,255,0.6)' : '#888',
                                  backgroundColor: (showBase || (!showBonus && !showBase)) ? '#555' : 'transparent',
                                  fontSize: '7px',
                                  borderRadius: (showBase || (!showBonus && !showBase)) ? '2px' : undefined,
                                  padding: (showBase || (!showBonus && !showBase)) ? '0 2px' : undefined,
                                }}
                              >
                                1PM
                              </span>
                            )}
                            {!showBase && !showBonus && !has1PM && dayType === 'W' && (
                              <span className="text-[10px] font-bold leading-none" style={{ color: '#ccc' }}>W</span>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────
function PageHeader({ currentMonth, prev, next }: { currentMonth: Date; prev: () => void; next: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-foreground">Overview</h1>
      <div className="flex items-center gap-3">
        <button onClick={prev} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold tracking-wide min-w-[140px] text-center text-foreground/90">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button onClick={next} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

