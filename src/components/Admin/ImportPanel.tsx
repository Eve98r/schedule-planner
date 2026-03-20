import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Upload, Trash2 } from 'lucide-react'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { supabase } from '@/lib/supabase'
import {
  parseBonusList,
  parseDefaultSchedules,
  type BonusShiftRow,
  type DefaultScheduleRow,
} from '@/lib/parseImport'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/errorMessages'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface ImportedMonth {
  month_year: string
  bonusCount: number
  scheduleCount: number
  bonusFiles: number
  scheduleFiles: number
}

interface FileImportLog {
  [monthYear: string]: { bonus: number; schedules: number }
}

function getImportLog(): FileImportLog {
  try {
    return JSON.parse(localStorage.getItem('sp_import_log') ?? '{}')
  } catch { return {} }
}

function logFileImport(monthYear: string, type: 'bonus' | 'schedules') {
  const log = getImportLog()
  if (!log[monthYear]) log[monthYear] = { bonus: 0, schedules: 0 }
  log[monthYear][type]++
  localStorage.setItem('sp_import_log', JSON.stringify(log))
}

function clearFileImportLog(monthYear: string, type: 'bonus' | 'schedules') {
  const log = getImportLog()
  if (log[monthYear]) {
    log[monthYear][type] = 0
    if (log[monthYear].bonus === 0 && log[monthYear].schedules === 0) delete log[monthYear]
    localStorage.setItem('sp_import_log', JSON.stringify(log))
  }
}

export function ImportPanel() {
  const bonusFileRef = useRef<HTMLInputElement>(null)
  const scheduleFileRef = useRef<HTMLInputElement>(null)

  const [bonusPreview, setBonusPreview] = useState<BonusShiftRow[] | null>(null)
  const [schedulePreview, setSchedulePreview] = useState<DefaultScheduleRow[] | null>(null)
  const [importedMonths, setImportedMonths] = useState<ImportedMonth[]>([])

  const fetchImportedMonths = async () => {
    // Use RPC to get distinct months, or manually paginate
    // First: get all distinct month_year values by selecting with limit high enough for just month_year
    const allBonusMonths = new Set<string>()
    const allSchedMonths = new Set<string>()

    // Paginate bonus_shifts to get all month_year values
    let offset = 0
    while (true) {
      const { data } = await supabase.from('bonus_shifts').select('month_year').range(offset, offset + 999)
      if (!data || data.length === 0) break
      for (const r of data) allBonusMonths.add(r.month_year)
      if (data.length < 1000) break
      offset += 1000
    }

    // Paginate default_schedules
    offset = 0
    while (true) {
      const { data } = await supabase.from('default_schedules').select('month_year').range(offset, offset + 999)
      if (!data || data.length === 0) break
      for (const r of data) allSchedMonths.add(r.month_year)
      if (data.length < 1000) break
      offset += 1000
    }

    const allMonthSet = new Set([...allBonusMonths, ...allSchedMonths])
    const results: ImportedMonth[] = []
    const log = getImportLog()

    for (const m of [...allMonthSet].sort()) {
      const [bCount, sCount] = await Promise.all([
        supabase.from('bonus_shifts').select('id', { count: 'exact', head: true }).eq('month_year', m),
        supabase.from('default_schedules').select('id', { count: 'exact', head: true }).eq('month_year', m),
      ])
      results.push({
        month_year: m,
        bonusCount: bCount.count ?? 0,
        scheduleCount: sCount.count ?? 0,
        bonusFiles: log[m]?.bonus ?? ((bCount.count ?? 0) > 0 ? 1 : 0),
        scheduleFiles: log[m]?.schedules ?? ((sCount.count ?? 0) > 0 ? 1 : 0),
      })
    }
    setImportedMonths(results)
  }

  useEffect(() => { fetchImportedMonths() }, [])
  const [clearMonth, setClearMonth] = useState('')
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    description: string
    action: () => Promise<void>
  } | null>(null)

  const handleBonusFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = await parseBonusList(file)
      setBonusPreview(rows)
    } catch {
      toast.error('Failed to parse bonus list file')
    }
    e.target.value = ''
  }

  const handleScheduleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = await parseDefaultSchedules(file)
      setSchedulePreview(rows)
    } catch {
      toast.error('Failed to parse schedules file')
    }
    e.target.value = ''
  }

  const [bonusConflicts, setBonusConflicts] = useState<{ id_shift_type: string; existing_month: string }[]>([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)

  const insertBonusShifts = async (force = false) => {
    if (!bonusPreview) return

    if (!force) {
      // Check for conflicts with existing data in OTHER months
      const newMonth = bonusPreview[0]?.month_year ?? ''
      const ids = bonusPreview.map(r => r.id_shift_type)
      const { data: existing } = await supabase
        .from('bonus_shifts')
        .select('id_shift_type, month_year')
        .in('id_shift_type', ids)
        .neq('month_year', newMonth)

      if (existing && existing.length > 0) {
        setBonusConflicts(existing.map(e => ({ id_shift_type: e.id_shift_type, existing_month: e.month_year })))
        setShowConflictDialog(true)
        return
      }
    }

    const { error } = await supabase.from('bonus_shifts').upsert(bonusPreview, { onConflict: 'id_shift_type' })
    if (error) {
      toast.error(friendlyError(error))
    } else {
      const monthYear = bonusPreview[0]?.month_year ?? ''
      if (monthYear) logFileImport(monthYear, 'bonus')
      toast.success(`Inserted ${bonusPreview.length} bonus shifts`)
      fetchImportedMonths()
    }
    setBonusPreview(null)
    setBonusConflicts([])
    setShowConflictDialog(false)
  }

  const insertSchedules = async () => {
    if (!schedulePreview) return
    const { error } = await supabase.from('default_schedules').insert(schedulePreview)
    if (error) {
      toast.error(friendlyError(error))
    } else {
      const monthYear = schedulePreview[0]?.month_year ?? ''
      if (monthYear) logFileImport(monthYear, 'schedules')
      toast.success(`Inserted ${schedulePreview.length} schedules`)
      fetchImportedMonths()
    }
    setSchedulePreview(null)
  }

  const clearBonusList = async () => {
    if (!clearMonth) return
    const { error } = await supabase
      .from('bonus_shifts')
      .delete()
      .eq('month_year', clearMonth)
    if (error) toast.error(friendlyError(error))
    else { clearFileImportLog(clearMonth, 'bonus'); toast.success(`Cleared bonus shifts for ${clearMonth}`); fetchImportedMonths() }
  }

  const clearDefaultSchedules = async () => {
    if (!clearMonth) return
    const { error } = await supabase
      .from('default_schedules')
      .delete()
      .eq('month_year', clearMonth)
    if (error) toast.error(friendlyError(error))
    else { clearFileImportLog(clearMonth, 'schedules'); toast.success(`Cleared default schedules for ${clearMonth}`); fetchImportedMonths() }
  }

  return (
    <div className="space-y-3">
      {/* Imported Data Overview */}
      <div className="rounded-lg bg-background py-3 flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-medium text-muted-foreground">Imported Data</h3>
          {importedMonths.length > 0 ? (
            importedMonths.map((m) => {
              const [y, mo] = m.month_year.split('-')
              const label = `${MONTHS[parseInt(mo) - 1]} ${y}`
              return (
                <div key={m.month_year} className="inline-flex items-center gap-1.5 text-[10px]">
                  <span className="font-semibold text-xs text-foreground">{label}</span>
                  <span className="rounded-full bg-[#ece0f5] text-[#3b0f62] px-2 py-0.5 font-medium">
                    {m.bonusFiles} {m.bonusFiles === 1 ? 'file' : 'files'} · {m.bonusCount} shifts
                  </span>
                  <span className="rounded-full bg-[#fdf3d4] text-[#7a6010] px-2 py-0.5 font-medium">
                    {m.scheduleFiles} {m.scheduleFiles === 1 ? 'file' : 'files'} · {m.scheduleCount} schedule days
                  </span>
                </div>
              )
            })
          ) : (
            <span className="text-[10px] text-muted-foreground">0 files · 0 data</span>
          )}
      </div>

      {/* Import Bonus List */}
      <Card className="border-l-4 border-l-[#3b0f62] border border-[#3b0f62]/20 bg-[#ece0f5]">
        <CardHeader className="px-4 py-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-[#3b0f62]">
            <Upload className="h-3.5 w-3.5" />
            Import Bonus List
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <input
            type="file"
            ref={bonusFileRef}
            accept=".xlsx,.csv"
            onChange={handleBonusFile}
            className="hidden"
          />
          <Button
            className="bg-[#3b0f62] hover:bg-[#2d0a4d] text-white shadow-sm"
            onClick={() => bonusFileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload .xlsx / .csv
          </Button>
        </CardContent>
      </Card>

      {/* Import Default Schedules */}
      <Card className="border-l-4 border-l-[#c9a020] border border-[#f8d040]/30 bg-[#fdf3d4]">
        <CardHeader className="px-4 py-3 pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-[#7a6010]">
            <Upload className="h-3.5 w-3.5" />
            Import Default Schedules
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <input
            type="file"
            ref={scheduleFileRef}
            accept=".xlsx,.csv"
            onChange={handleScheduleFile}
            className="hidden"
          />
          <Button
            className="bg-[#c9a020] hover:bg-[#b89018] text-white shadow-sm"
            onClick={() => scheduleFileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload .xlsx / .csv
          </Button>
        </CardContent>
      </Card>

      {/* Clear Month Data */}
      <div className="pt-4 space-y-3">
        <p className="text-xs text-muted-foreground">Select a month to clear its imported data</p>
        <div className="flex items-center gap-3">
          <MonthPicker value={clearMonth} onChange={setClearMonth} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="shadow-sm"
              disabled={!clearMonth}
              onClick={() =>
                setConfirmAction({
                  title: 'Clear Bonus List',
                  description: `Delete all bonus shifts for ${clearMonth}?`,
                  action: clearBonusList,
                })
              }
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Clear Bonus List
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!clearMonth}
              onClick={() =>
                setConfirmAction({
                  title: 'Clear Default Schedules',
                  description: `Delete all default schedules for ${clearMonth}?`,
                  action: clearDefaultSchedules,
                })
              }
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Clear Schedules
            </Button>
          </div>
        </div>
      </div>

      {/* Bonus Preview Dialog */}
      <Dialog open={!!bonusPreview} onOpenChange={(open) => !open && setBonusPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Bonus Shifts</DialogTitle>
            <DialogDescription>
              Showing first 10 of {bonusPreview?.length ?? 0} rows. Confirm to insert all.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Shift Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Row #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">ID Shift Type</th>
                </tr>
              </thead>
              <tbody>
                {bonusPreview?.slice(0, 10).map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'}>
                    <td className="px-3 py-1.5">{r.date}</td>
                    <td className="px-3 py-1.5">{r.shift_type}</td>
                    <td className="px-3 py-1.5">{r.row_number}</td>
                    <td className="px-3 py-1.5">{r.id_shift_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusPreview(null)}>Cancel</Button>
            <Button onClick={() => insertBonusShifts()}>Insert All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedules Preview Dialog */}
      <Dialog open={!!schedulePreview} onOpenChange={(open) => !open && setSchedulePreview(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Default Schedules</DialogTitle>
            <DialogDescription>
              Showing first 10 of {schedulePreview?.length ?? 0} rows. Confirm to insert all.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Employee</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Day Type</th>
                </tr>
              </thead>
              <tbody>
                {schedulePreview?.slice(0, 10).map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'}>
                    <td className="px-3 py-1.5">{r.date}</td>
                    <td className="px-3 py-1.5">{r.employee}</td>
                    <td className="px-3 py-1.5">{r.day_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchedulePreview(null)}>Cancel</Button>
            <Button onClick={insertSchedules}>Insert All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await confirmAction?.action()
                setConfirmAction(null)
              }}
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict warning dialog */}
      <Dialog open={showConflictDialog} onOpenChange={(open) => { if (!open) { setShowConflictDialog(false); setBonusConflicts([]) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-600">⚠ Overlapping Data Detected</DialogTitle>
            <DialogDescription>
              {bonusConflicts.length} shift ID(s) from this file already exist in other months. Importing will overwrite them.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-auto text-xs space-y-1">
            {bonusConflicts.slice(0, 20).map((c) => (
              <div key={c.id_shift_type} className="flex justify-between px-2 py-1 rounded bg-amber-50">
                <span className="font-medium">{c.id_shift_type}</span>
                <span className="text-muted-foreground">exists in {c.existing_month}</span>
              </div>
            ))}
            {bonusConflicts.length > 20 && (
              <p className="text-muted-foreground text-center">...and {bonusConflicts.length - 20} more</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowConflictDialog(false); setBonusConflicts([]) }}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => insertBonusShifts(true)}
            >
              Import Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
