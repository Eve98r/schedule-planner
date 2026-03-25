import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    <div className="space-y-6 pb-6">
      {/* Month Picker */}
      <div className="flex items-center gap-3">
        <MonthPicker value={selectedMonth} onChange={handleMonthChange} />
        <span className="text-xs text-muted-foreground">Select the month to configure the limits below</span>
      </div>

      {/* Monthly Defaults */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Monthly Default Limits</CardTitle>
          <p className="text-xs text-muted-foreground">
            These limits apply to all agents for the selected month unless they have custom overrides.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 items-end">
            <GlobalLimitField label="EB" value={monthDraft.eb_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, eb_limit: v }))} />
            <GlobalLimitField label="MB" value={monthDraft.mb_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, mb_limit: v }))} />
            <GlobalLimitField label="NB" value={monthDraft.nb_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, nb_limit: v }))} />
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Total Bonus</label>
              <input
                type="number"
                min={0}
                className="h-9 w-full rounded-md border border-input px-2.5 text-sm"
                value={monthDraft.total_bonus_limit}
                onChange={(e) => setMonthDraft((d) => ({ ...d, total_bonus_limit: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <GlobalLimitField label="1-PM" value={monthDraft.pm1_limit} onChange={(v) => setMonthDraft((d) => ({ ...d, pm1_limit: v }))} />
            <div>
              <button
                onClick={handleSaveMonthly}
                disabled={saving === 'monthly' || (!isDirty && !applied)}
                className={`h-9 w-full rounded-md px-3 text-sm font-medium transition-all duration-500 ${
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
        </CardContent>
      </Card>

      {/* Per-Agent Limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-Agent Limits</CardTitle>
          <p className="text-xs text-muted-foreground">
            Enable "Custom" to override monthly defaults for specific agents.
          </p>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2.5 pr-3 font-medium text-muted-foreground">Agent</th>
                    <th className="py-2.5 px-2 font-medium text-muted-foreground text-center w-16">Custom</th>
                    <th className="py-2.5 px-2 font-medium text-muted-foreground text-center w-24">EB</th>
                    <th className="py-2.5 px-2 font-medium text-muted-foreground text-center w-24">MB</th>
                    <th className="py-2.5 px-2 font-medium text-muted-foreground text-center w-24">NB</th>
                    <th className="py-2.5 px-2 font-medium text-muted-foreground text-center w-20">Total</th>
                    <th className="py-2.5 px-2 font-medium text-muted-foreground text-center w-24">1-PM</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const agentLimit = getAgentLimit(agent.id)
                    const isCustom = agentLimit?.is_custom ?? false
                    const effective = getEffective(agent.id)
                    const isSaving = saving === agent.id

                    return (
                      <tr key={agent.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-3 font-medium">{agent.full_name}</td>
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={isCustom}
                            disabled={isSaving}
                            onChange={() => handleToggleCustom(agent.id)}
                            className="h-4 w-4 rounded border-gray-300 accent-[#1a1a3e]"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <AgentNullableCell value={effective.eb_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'eb_limit', v)} />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <AgentNullableCell value={effective.mb_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'mb_limit', v)} />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <AgentNullableCell value={effective.nb_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'nb_limit', v)} />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="number"
                            min={0}
                            className="h-8 w-16 rounded-md border border-input px-1.5 text-sm text-center disabled:opacity-40 disabled:bg-muted"
                            value={effective.total_bonus_limit}
                            disabled={!isCustom || isSaving}
                            onChange={(e) => handleAgentLimitChange(agent.id, 'total_bonus_limit', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <AgentNullableCell value={effective.pm1_limit} isCustom={isCustom} isSaving={isSaving} onChangeValue={(v) => handleAgentLimitChange(agent.id, 'pm1_limit', v)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Global defaults: segmented toggle between "Unlimited" and a number input */
function GlobalLimitField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const isUnlimited = value === null
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
      <div className="flex h-9 rounded-md border border-input overflow-hidden">
        <button
          onClick={() => onChange(null)}
          className={`flex-1 px-2 text-xs font-medium transition-colors ${
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
            className="flex-1 px-2 text-xs text-muted-foreground bg-white hover:bg-muted/50 transition-colors"
          >
            #
          </button>
        ) : (
          <input
            type="number"
            min={0}
            className="w-12 flex-1 text-center text-sm border-0 outline-none focus:ring-0 px-1"
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
