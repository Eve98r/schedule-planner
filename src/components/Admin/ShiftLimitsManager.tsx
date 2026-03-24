import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useShiftLimits } from '@/hooks/useShiftLimits'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { Profile, ShiftLimits } from '@/types'

export function ShiftLimitsManager() {
  const {
    globalLimits,
    employeeLimits,
    loading,
    updateGlobalLimits,
    upsertEmployeeLimit,
    refetch,
  } = useShiftLimits()

  const [employees, setEmployees] = useState<Profile[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  // Local editable state for global defaults
  const [globalDraft, setGlobalDraft] = useState<ShiftLimits>({
    eb_limit: 4, mb_limit: 4, nb_limit: 4, total_bonus_limit: 4, pm1_limit: null,
  })
  const [pm1Unlimited, setPm1Unlimited] = useState(true)

  useEffect(() => {
    if (globalLimits) {
      setGlobalDraft({
        eb_limit: globalLimits.eb_limit,
        mb_limit: globalLimits.mb_limit,
        nb_limit: globalLimits.nb_limit,
        total_bonus_limit: globalLimits.total_bonus_limit,
        pm1_limit: globalLimits.pm1_limit,
      })
      setPm1Unlimited(globalLimits.pm1_limit === null)
    }
  }, [globalLimits])

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .order('full_name')
      setEmployees(data ?? [])
    }
    fetchEmployees()
  }, [])

  const handleSaveGlobal = async () => {
    setSaving('global')
    const limits = { ...globalDraft, pm1_limit: pm1Unlimited ? null : (globalDraft.pm1_limit ?? 0) }
    const result = await updateGlobalLimits(limits)
    if (result?.error) toast.error('Failed to update global defaults')
    else toast.success('Global defaults updated')
    setSaving(null)
  }

  const getEmployeeLimit = (empId: string) => {
    return employeeLimits.find((e) => e.employee_id === empId)
  }

  const getEffective = (empId: string): ShiftLimits => {
    const emp = getEmployeeLimit(empId)
    if (emp?.is_custom) return emp
    return globalDraft
  }

  const handleToggleCustom = async (empId: string) => {
    const existing = getEmployeeLimit(empId)
    const newCustom = !(existing?.is_custom ?? false)
    setSaving(empId)
    if (newCustom && !existing) {
      // Create with current global values
      await upsertEmployeeLimit(empId, {
        ...globalDraft,
        pm1_limit: pm1Unlimited ? null : globalDraft.pm1_limit,
        is_custom: true,
      })
    } else {
      await upsertEmployeeLimit(empId, { is_custom: newCustom })
    }
    toast.success(newCustom ? 'Custom limits enabled' : 'Using global defaults')
    setSaving(null)
  }

  const handleEmployeeLimitChange = async (empId: string, field: keyof ShiftLimits, value: number | null) => {
    setSaving(empId)
    await upsertEmployeeLimit(empId, { [field]: value })
    setSaving(null)
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading shift limits...</div>
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Global Defaults */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Global Default Limits</CardTitle>
          <p className="text-xs text-muted-foreground">
            These limits apply to all employees unless they have custom overrides.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <LimitInput label="EB" value={globalDraft.eb_limit} onChange={(v) => setGlobalDraft((d) => ({ ...d, eb_limit: v }))} />
            <LimitInput label="MB" value={globalDraft.mb_limit} onChange={(v) => setGlobalDraft((d) => ({ ...d, mb_limit: v }))} />
            <LimitInput label="NB" value={globalDraft.nb_limit} onChange={(v) => setGlobalDraft((d) => ({ ...d, nb_limit: v }))} />
            <LimitInput label="Total Bonus" value={globalDraft.total_bonus_limit} onChange={(v) => setGlobalDraft((d) => ({ ...d, total_bonus_limit: v }))} />
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">1-PM</label>
              <div className="flex items-center gap-1.5">
                {pm1Unlimited ? (
                  <span className="text-sm text-muted-foreground italic">Unlimited</span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    className="h-8 w-16 rounded-md border border-input px-2 text-sm"
                    value={globalDraft.pm1_limit ?? 0}
                    onChange={(e) => setGlobalDraft((d) => ({ ...d, pm1_limit: parseInt(e.target.value) || 0 }))}
                  />
                )}
                <button
                  className="text-[10px] text-primary underline"
                  onClick={() => setPm1Unlimited(!pm1Unlimited)}
                >
                  {pm1Unlimited ? 'Set limit' : 'Unlimited'}
                </button>
              </div>
            </div>
            <div className="flex items-end">
              <Button size="sm" onClick={handleSaveGlobal} disabled={saving === 'global'}>
                {saving === 'global' ? 'Saving...' : 'Save Defaults'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Employee Limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-Employee Limits</CardTitle>
          <p className="text-xs text-muted-foreground">
            Enable "Custom" to override global defaults for specific employees.
          </p>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employee accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium text-muted-foreground">Employee</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-center w-16">Custom</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-center w-16">EB</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-center w-16">MB</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-center w-16">NB</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-center w-16">Total</th>
                    <th className="py-2 px-2 font-medium text-muted-foreground text-center w-20">1-PM</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const empLimit = getEmployeeLimit(emp.id)
                    const isCustom = empLimit?.is_custom ?? false
                    const effective = getEffective(emp.id)
                    const isSaving = saving === emp.id

                    return (
                      <tr key={emp.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-medium">{emp.full_name}</td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={isCustom}
                            disabled={isSaving}
                            onChange={() => handleToggleCustom(emp.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="number"
                            min={0}
                            className="h-7 w-14 rounded border border-input px-1.5 text-sm text-center disabled:opacity-50 disabled:bg-muted"
                            value={effective.eb_limit}
                            disabled={!isCustom || isSaving}
                            onChange={(e) => handleEmployeeLimitChange(emp.id, 'eb_limit', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="number"
                            min={0}
                            className="h-7 w-14 rounded border border-input px-1.5 text-sm text-center disabled:opacity-50 disabled:bg-muted"
                            value={effective.mb_limit}
                            disabled={!isCustom || isSaving}
                            onChange={(e) => handleEmployeeLimitChange(emp.id, 'mb_limit', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="number"
                            min={0}
                            className="h-7 w-14 rounded border border-input px-1.5 text-sm text-center disabled:opacity-50 disabled:bg-muted"
                            value={effective.nb_limit}
                            disabled={!isCustom || isSaving}
                            onChange={(e) => handleEmployeeLimitChange(emp.id, 'nb_limit', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <input
                            type="number"
                            min={0}
                            className="h-7 w-14 rounded border border-input px-1.5 text-sm text-center disabled:opacity-50 disabled:bg-muted"
                            value={effective.total_bonus_limit}
                            disabled={!isCustom || isSaving}
                            onChange={(e) => handleEmployeeLimitChange(emp.id, 'total_bonus_limit', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isCustom ? (
                            <div className="flex items-center justify-center gap-1">
                              {effective.pm1_limit === null ? (
                                <button
                                  className="text-[10px] text-primary underline"
                                  disabled={isSaving}
                                  onClick={() => handleEmployeeLimitChange(emp.id, 'pm1_limit', 0)}
                                >
                                  Unlimited
                                </button>
                              ) : (
                                <>
                                  <input
                                    type="number"
                                    min={0}
                                    className="h-7 w-12 rounded border border-input px-1 text-sm text-center"
                                    value={effective.pm1_limit}
                                    disabled={isSaving}
                                    onChange={(e) => handleEmployeeLimitChange(emp.id, 'pm1_limit', parseInt(e.target.value) || 0)}
                                  />
                                  <button
                                    className="text-[10px] text-primary underline"
                                    disabled={isSaving}
                                    onClick={() => handleEmployeeLimitChange(emp.id, 'pm1_limit', null)}
                                  >
                                    &infin;
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">
                              {effective.pm1_limit === null ? '∞' : effective.pm1_limit}
                            </span>
                          )}
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

function LimitInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        min={0}
        className="h-8 w-16 rounded-md border border-input px-2 text-sm"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
      />
    </div>
  )
}
