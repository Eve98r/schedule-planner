import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { useShiftLimits } from '@/hooks/useShiftLimits'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Profile, ShiftLimits } from '@/types'

export function ShiftLimitsManager() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return localStorage.getItem('sp_shift_limits_month') || format(new Date(), 'yyyy-MM')
  })

  const handleMonthChange = (v: string) => {
    if (!v) return // Don't allow deselection
    setSelectedMonth(v)
    localStorage.setItem('sp_shift_limits_month', v)
  }

  const {
    monthlyLimits,
    employeeLimits,
    loading,
    updateMonthlyLimits,
    upsertEmployeeLimit,
  } = useShiftLimits(selectedMonth)

  const [agents, setAgents] = useState<Profile[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  const [monthDraft, setMonthDraft] = useState<ShiftLimits>({
    eb_limit: null, mb_limit: null, nb_limit: null, total_bonus_limit: 4, pm1_limit: null,
  })

  useEffect(() => {
    if (monthlyLimits) {
      setMonthDraft({
        eb_limit: monthlyLimits.eb_limit,
        mb_limit: monthlyLimits.mb_limit,
        nb_limit: monthlyLimits.nb_limit,
        total_bonus_limit: monthlyLimits.total_bonus_limit,
        pm1_limit: monthlyLimits.pm1_limit,
      })
      setApplied(false)
    }
  }, [monthlyLimits])

  const savedLimits: ShiftLimits = monthlyLimits ?? {
    eb_limit: null, mb_limit: null, nb_limit: null, total_bonus_limit: 4, pm1_limit: null,
  }
  const isDirty =
    monthDraft.eb_limit !== savedLimits.eb_limit ||
    monthDraft.mb_limit !== savedLimits.mb_limit ||
    monthDraft.nb_limit !== savedLimits.nb_limit ||
    monthDraft.total_bonus_limit !== savedLimits.total_bonus_limit ||
    monthDraft.pm1_limit !== savedLimits.pm1_limit

  useEffect(() => {
    const fetchAgents = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'agent')
        .order('full_name')
      setAgents(data ?? [])
    }
    fetchAgents()
  }, [])

  const handleSaveMonthly = async () => {
    setSaving('monthly')
    const result = await updateMonthlyLimits(monthDraft)
    if (result?.error) {
      toast.error('Failed to update monthly limits')
      setSaving(null)
      return
    }
    // Apply defaults to non-custom agents
    const nonCustom = employeeLimits.filter((e) => !e.is_custom)
    for (const emp of nonCustom) {
      await upsertEmployeeLimit(emp.employee_id, {
        eb_limit: monthDraft.eb_limit,
        mb_limit: monthDraft.mb_limit,
        nb_limit: monthDraft.nb_limit,
        total_bonus_limit: monthDraft.total_bonus_limit,
        pm1_limit: monthDraft.pm1_limit,
      })
    }
    setSaving(null)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  const getAgentLimit = (agentId: string) => {
    return employeeLimits.find((e) => e.employee_id === agentId)
  }

  const getEffective = (agentId: string): ShiftLimits => {
    const agent = getAgentLimit(agentId)
    if (agent?.is_custom) return agent
    return monthDraft
  }

  const handleToggleCustom = async (agentId: string) => {
    const existing = getAgentLimit(agentId)
    const newCustom = !(existing?.is_custom ?? false)
    setSaving(agentId)
    if (newCustom && !existing) {
      await upsertEmployeeLimit(agentId, {
        ...monthDraft,
        is_custom: true,
      })
    } else {
      await upsertEmployeeLimit(agentId, { is_custom: newCustom })
    }
    toast.success(newCustom ? 'Custom limits enabled' : 'Using monthly defaults')
    setSaving(null)
  }

  const handleAgentLimitChange = async (agentId: string, field: keyof ShiftLimits, value: number | null) => {
    setSaving(agentId)
    await upsertEmployeeLimit(agentId, { [field]: value })
    setSaving(null)
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading limits...</div>
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden sm:overflow-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Top section — never scrolls horizontally */}
      <div className="sm:shrink-0 space-y-4">
        {/* Monthly Defaults */}
        <Card>
          <CardHeader className="px-4 py-2 sm:pb-2 sticky top-0 z-10 bg-card rounded-t-lg sm:static">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm">Monthly Default Limits</CardTitle>
              <MonthPicker value={selectedMonth} onChange={handleMonthChange} />
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 items-end sm:max-w-[660px]">
              <GlobalLimitField label="EB" value={monthDraft.eb_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, eb_limit: v }))} />
              <GlobalLimitField label="MB" value={monthDraft.mb_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, mb_limit: v }))} />
              <GlobalLimitField label="NB" value={monthDraft.nb_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, nb_limit: v }))} />
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5 text-center">Total Bonus Shifts</label>
                <input
                  type="number"
                  min={0}
                  className="h-7 sm:h-8 w-full rounded-md border border-input px-2 text-xs text-center"
                  value={monthDraft.total_bonus_limit}
                  onChange={(e) => setMonthDraft((d) => ({ ...d, total_bonus_limit: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <GlobalLimitField label="1-PM" value={monthDraft.pm1_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, pm1_limit: v }))} />
              <div>
                <button
                  onClick={handleSaveMonthly}
                  disabled={saving === 'monthly' || (!isDirty && !applied)}
                  className={`h-7 sm:h-8 w-full rounded-md px-2 text-xs font-medium transition-all duration-500 ${
                    applied
                      ? 'bg-emerald-600 text-white'
                      : isDirty
                        ? 'bg-[#1a1a3e] text-white hover:opacity-90'
                        : 'bg-muted/40 text-muted-foreground/40 cursor-default'
                  }`}
                >
                  {saving === 'monthly' ? 'Applying...' : applied ? 'Applied' : isDirty ? 'Apply Limits' : 'Limits Applied'}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/50 mt-2">
              These limits apply to all agents unless they have custom overrides.
            </p>
          </CardContent>
        </Card>

        {/* Per-Agent header */}
        <div className="pt-2 pb-2">
          <h3 className="text-base font-semibold">Per-Agent Limits</h3>
          <p className="text-xs text-muted-foreground/50 mt-1 mb-1">
            Enable "Custom" to override monthly defaults for specific agents.
          </p>
        </div>
      </div>

      {/* Desktop: separate header + scrollable body. Mobile: single scrollable table */}
      {/* Desktop header (hidden on mobile) */}
      {agents.length > 0 && (
        <div className="hidden sm:block shrink-0 border-b border-border/30 bg-gradient-to-b from-[#f0ede9] to-[#e6e3de] shadow-[0_1px_2px_rgba(0,0,0,0.06)] rounded-t-md overflow-x-auto" style={{ scrollbarGutter: 'stable' }}>
        <table className="w-full min-w-[640px] text-sm table-fixed">
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '12.5%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="py-2.5 pl-3 pr-3 text-left text-sm font-medium text-muted-foreground/80 whitespace-nowrap">Agent</th>
              <th className="py-2.5 px-2 text-center text-sm font-medium text-muted-foreground/80">Custom</th>
              <th className="py-2.5 px-2 text-center text-sm font-medium text-muted-foreground/80">EB</th>
              <th className="py-2.5 px-2 text-center text-sm font-medium text-muted-foreground/80">MB</th>
              <th className="py-2.5 px-2 text-center text-sm font-medium text-muted-foreground/80">NB</th>
              <th className="py-2.5 px-2 text-center text-sm font-medium text-muted-foreground/80">Total</th>
              <th className="py-2.5 px-2 text-center text-sm font-medium text-muted-foreground/80">1-PM</th>
            </tr>
          </thead>
        </table>
        </div>
      )}

      {/* Agent rows */}
      <div className="sm:flex-1 sm:overflow-auto sm:min-h-0 overflow-x-auto" style={{ scrollbarGutter: 'stable', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent accounts found.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm table-fixed">
            <colgroup>
              <col style={{ width: '25%' }} />
              <col style={{ width: '12.5%' }} />
              <col style={{ width: '12.5%' }} />
              <col style={{ width: '12.5%' }} />
              <col style={{ width: '12.5%' }} />
              <col style={{ width: '12.5%' }} />
              <col style={{ width: '12.5%' }} />
            </colgroup>
                {/* Mobile sticky header inside the same table */}
                <thead className="sm:hidden sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f0ede9] to-[#e6e3de] border-b border-border/30 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                    <th className="py-2 pl-3 pr-1 text-left text-sm font-medium text-muted-foreground/80 sticky left-0 z-30 bg-gradient-to-b from-[#f0ede9] to-[#e6e3de] border-r border-border/20" style={{ touchAction: 'pan-y' }}>Agent</th>
                    <th className="py-2 px-2 text-center text-sm font-medium text-muted-foreground/80" style={{ touchAction: 'pan-x' }}>Custom</th>
                    <th className="py-2 px-2 text-center text-sm font-medium text-muted-foreground/80" style={{ touchAction: 'pan-x' }}>EB</th>
                    <th className="py-2 px-2 text-center text-sm font-medium text-muted-foreground/80" style={{ touchAction: 'pan-x' }}>MB</th>
                    <th className="py-2 px-2 text-center text-sm font-medium text-muted-foreground/80" style={{ touchAction: 'pan-x' }}>NB</th>
                    <th className="py-2 px-2 text-center text-sm font-medium text-muted-foreground/80" style={{ touchAction: 'pan-x' }}>Total</th>
                    <th className="py-2 px-2 text-center text-sm font-medium text-muted-foreground/80" style={{ touchAction: 'pan-x' }}>1-PM</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const agentLimit = getAgentLimit(agent.id)
                    const isCustom = agentLimit?.is_custom ?? false
                    const effective = getEffective(agent.id)
                    const isSaving = saving === agent.id

                    return (
                      <tr key={agent.id} className={`group/row hover:bg-[#1a1a3e]/10 transition-colors rounded ${selectedAgentId === agent.id ? 'bg-[#1a1a3e]/10' : ''}`}>
                        <td className="py-2.5 pl-3 pr-1 font-medium cursor-pointer sticky left-0 z-10 truncate border-r border-border/20 max-w-[120px] sm:max-w-none group-hover/row:!bg-[#e4e0dc] transition-colors" style={{ backgroundColor: selectedAgentId === agent.id ? '#e0dde8' : '#f0ede9', touchAction: 'pan-y' }} onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}>{agent.full_name}</td>
                        <td className="py-2.5 px-2 text-center" style={{ touchAction: 'pan-x' }}>
                          <button
                            disabled={isSaving}
                            onClick={() => handleToggleCustom(agent.id)}
                            className={`h-7 px-2.5 rounded-full text-[11px] font-medium transition-all ${
                              isCustom
                                ? 'bg-[#1a1a3e] text-white shadow-sm'
                                : 'bg-muted/50 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground'
                            } disabled:opacity-40`}
                          >
                            {isCustom ? 'Custom' : 'Default'}
                          </button>
                        </td>
                        <td className={`py-2.5 px-2 text-center transition-opacity ${isCustom ? 'opacity-100' : 'opacity-20'}`} style={{ touchAction: 'pan-x' }}>
                          <AgentNullableCell value={effective.eb_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'eb_limit', v)} />
                        </td>
                        <td className={`py-2.5 px-2 text-center transition-opacity ${isCustom ? 'opacity-100' : 'opacity-20'}`} style={{ touchAction: 'pan-x' }}>
                          <AgentNullableCell value={effective.mb_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'mb_limit', v)} />
                        </td>
                        <td className={`py-2.5 px-2 text-center transition-opacity ${isCustom ? 'opacity-100' : 'opacity-20'}`} style={{ touchAction: 'pan-x' }}>
                          <AgentNullableCell value={effective.nb_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'nb_limit', v)} />
                        </td>
                        <td className={`py-2.5 px-2 text-center transition-opacity ${isCustom ? 'opacity-100' : 'opacity-20'}`} style={{ touchAction: 'pan-x' }}>
                          <input
                            type="number"
                            min={0}
                            className="h-8 w-16 rounded-md border border-input px-1.5 text-sm text-center disabled:opacity-100 disabled:bg-muted"
                            value={effective.total_bonus_limit}
                            disabled={!isCustom || isSaving}
                            onChange={(e) => handleAgentLimitChange(agent.id, 'total_bonus_limit', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className={`py-2.5 px-2 text-center transition-opacity ${isCustom ? 'opacity-100' : 'opacity-20'}`} style={{ touchAction: 'pan-x' }}>
                          <AgentNullableCell value={effective.pm1_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'pm1_limit', v)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
          )}
      </div>
    </div>
  )
}

/** Global defaults: segmented toggle between "Unlimited" and a number input */
function GlobalLimitField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const isUnlimited = value === null
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5 text-center">{label}</label>
      <div className="flex h-7 sm:h-8 rounded-md border border-input overflow-hidden">
        <button
          onClick={() => onChange(null)}
          className={`flex-1 px-1.5 text-xs font-medium transition-colors ${
            isUnlimited
              ? 'bg-[#1a1a3e] text-white'
              : 'bg-white text-muted-foreground hover:bg-muted/50'
          }`}
        >
          &infin;
        </button>
        <div className="w-px bg-input" />
        {isUnlimited ? (
          <button
            onClick={() => onChange(0)}
            className="flex-1 px-1.5 text-xs text-muted-foreground bg-white hover:bg-muted/50 transition-colors"
          >
            #
          </button>
        ) : (
          <input
            type="number"
            min={0}
            className="w-10 flex-1 text-center text-xs border-0 outline-none focus:ring-0 px-1"
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          />
        )}
      </div>
    </div>
  )
}

/** Per-agent nullable cell: read-only display when not custom, toggle+input when custom */
function AgentNullableCell({
  value,
  isCustom,
  isSaving,
  onChangeValue,
}: {
  value: number | null
  isCustom: boolean
  isSaving: boolean
  onChangeValue: (v: number | null) => void
}) {
  if (!isCustom) {
    return (
      <span className="inline-flex h-8 items-center justify-center rounded-md px-2 text-sm text-muted-foreground bg-muted/40">
        {value === null ? (
          <span className="flex items-center gap-1">
            <span className="text-base leading-none">&infin;</span>
          </span>
        ) : value}
      </span>
    )
  }

  const isUnlimited = value === null

  return (
    <div className="flex h-8 rounded-md border border-input overflow-hidden mx-auto" style={{ width: 'fit-content', minWidth: '5rem' }}>
      <button
        onClick={() => onChangeValue(isUnlimited ? 0 : null)}
        disabled={isSaving}
        className={`px-2 text-xs font-medium transition-colors disabled:opacity-40 ${
          isUnlimited
            ? 'bg-[#1a1a3e] text-white'
            : 'bg-white text-muted-foreground hover:bg-muted/50'
        }`}
      >
        &infin;
      </button>
      <div className="w-px bg-input" />
      {isUnlimited ? (
        <button
          onClick={() => onChangeValue(0)}
          disabled={isSaving}
          className="flex-1 px-2 text-xs text-muted-foreground bg-white hover:bg-muted/50 transition-colors disabled:opacity-40"
        >
          #
        </button>
      ) : (
        <input
          type="number"
          min={0}
          className="w-10 text-center text-sm border-0 outline-none focus:ring-0 px-1 disabled:opacity-40"
          value={value}
          disabled={isSaving}
          onChange={(e) => onChangeValue(parseInt(e.target.value) || 0)}
        />
      )}
    </div>
  )
}
