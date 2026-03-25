import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Download, Trash2 } from 'lucide-react'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/errorMessages'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { exportAssignments } from '@/lib/exportXlsx'
import type { BonusShift, ShiftClaim, Profile } from '@/types'

export function AssignmentTable() {
  const [monthYear, setMonthYear] = useState(() => {
    return localStorage.getItem('sp_assignments_month') ?? format(new Date(), 'yyyy-MM')
  })

  useEffect(() => {
    localStorage.setItem('sp_assignments_month', monthYear)
  }, [monthYear])
  const [search, setSearch] = useState('')
  const [showFilter, setShowFilter] = useState<'all' | 'claimed' | 'unclaimed'>('all')
  const [bonusShifts, setBonusShifts] = useState<BonusShift[]>([])
  const [claims, setClaims] = useState<ShiftClaim[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const [bRes, cRes, pRes] = await Promise.all([
        supabase.from('bonus_shifts').select('*').eq('month_year', monthYear),
        supabase.from('shift_claims').select('*').eq('month_year', monthYear),
        supabase.from('profiles').select('*'),
      ])
      setBonusShifts(bRes.data ?? [])
      setClaims(cRes.data ?? [])
      setProfiles(pRes.data ?? [])
      setLoading(false)
    }
    fetchData()
  }, [monthYear])

  const claimMap = new Map<string, ShiftClaim>()
  for (const c of claims) {
    claimMap.set(c.id_shift_type, c)
  }

  const profileMap: Record<string, string> = {}
  for (const p of profiles) {
    profileMap[p.id] = p.full_name
  }

  const sorted = [...bonusShifts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.row_number - b.row_number
  )

  const afterFilter = showFilter === 'all'
    ? sorted
    : showFilter === 'claimed'
      ? sorted.filter((s) => claimMap.has(s.id_shift_type))
      : sorted.filter((s) => !claimMap.has(s.id_shift_type))

  const searchLower = search.toLowerCase()
  const filtered = search
    ? afterFilter.filter((s) => {
        const claim = claimMap.get(s.id_shift_type)
        const claimedBy = claim ? (profileMap[claim.claimed_by] ?? '').toLowerCase() : ''
        return (
          s.id_shift_type.toLowerCase().includes(searchLower) ||
          claimedBy.includes(searchLower)
        )
      })
    : afterFilter

  const claimedCount = sorted.filter((s) => claimMap.has(s.id_shift_type)).length
  const unclaimedCount = sorted.length - claimedCount

  const [showUnclaimAll, setShowUnclaimAll] = useState(false)
  const [unclaiming, setUnclaiming] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)

  const handleExport = () => {
    exportAssignments(bonusShifts, claims, profileMap, monthYear)
  }

  const handleUnclaimAll = async () => {
    setUnclaiming(true)
    const { error } = await supabase
      .from('shift_claims')
      .delete()
      .eq('month_year', monthYear)
    if (error) {
      toast.error(friendlyError(error))
    } else {
      toast.success(`Unclaimed all shifts for ${monthYear}`)
      setClaims([])
    }
    setUnclaiming(false)
    setShowUnclaimAll(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <MonthPicker value={monthYear} onChange={setMonthYear} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ID Shift Type or Claimed By..."
          className="flex h-9 flex-1 min-w-[200px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex gap-1">
          <Button
            variant={showFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilter('all')}
            style={showFilter === 'all' ? { backgroundColor: '#1a1a3e' } : undefined}
          >
            All
          </Button>
          <Button
            variant={showFilter === 'claimed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilter('claimed')}
            style={showFilter === 'claimed' ? { backgroundColor: '#1a1a3e' } : undefined}
          >
            Claimed
          </Button>
          <Button
            variant={showFilter === 'unclaimed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilter('unclaimed')}
            style={showFilter === 'unclaimed' ? { backgroundColor: '#1a1a3e' } : undefined}
          >
            Unclaimed
          </Button>
        </div>
        <Button
          variant="destructive"
          disabled={claimedCount === 0}
          onClick={() => setShowUnclaimAll(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Unclaim All
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading assignments...
        </div>
      ) : (
        <>
          <div className="flex flex-col max-h-[60vh] rounded-lg border border-border/10 overflow-hidden">
            <div className="border-b border-border/30 bg-gradient-to-b from-[#f0ede9] to-[#e6e3de] shadow-[0_1px_2px_rgba(0,0,0,0.06)] shrink-0">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr>
                    <th className="w-[15%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Date</th>
                    <th className="w-[12%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Shift Type</th>
                    <th className="w-[18%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">ID Shift Type</th>
                    <th className="w-[30%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Claimed By</th>
                    <th className="w-[25%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Claimed At</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="overflow-auto flex-1">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[30%]" />
                <col className="w-[25%]" />
              </colgroup>
              <tbody>
                {filtered.map((shift, idx) => {
                  const claim = claimMap.get(shift.id_shift_type)
                  return (
                    <tr key={shift.id} className={`transition-colors hover:bg-[#1a1a3e]/10 ${selectedShiftId === shift.id ? 'bg-[#1a1a3e]/10' : idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'}`}>
                      <td className="px-3 py-2">{shift.date}</td>
                      <td className="px-3 py-2">{shift.shift_type}</td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => setSelectedShiftId(selectedShiftId === shift.id ? null : shift.id)}>{shift.id_shift_type}</td>
                      <td className="px-3 py-2">
                        {claim ? (profileMap[claim.claimed_by] ?? 'Unknown') : ''}
                      </td>
                      <td className="px-3 py-2">
                        {claim ? format(new Date(claim.claimed_at), 'yyyy-MM-dd HH:mm') : ''}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      {search ? 'No matching shifts found.' : 'No bonus shifts for this month.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          {sorted.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Total shifts: {sorted.length} | Claimed: {claimedCount} | Unclaimed: {unclaimedCount}
              </div>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export to XLSX
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog open={showUnclaimAll} onOpenChange={setShowUnclaimAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unclaim All Bonus Shifts</DialogTitle>
            <DialogDescription>
              This will remove all {claimedCount} claims for {monthYear}. All bonus shifts will become available again. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnclaimAll(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleUnclaimAll} disabled={unclaiming}>
              {unclaiming ? 'Unclaiming...' : 'Unclaim All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
