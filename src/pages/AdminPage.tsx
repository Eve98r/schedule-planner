import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Lock, Unlock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { ImportPanel } from '@/components/Admin/ImportPanel'
import { AssignmentTable } from '@/components/Admin/AssignmentTable'
import { UserManager } from '@/components/Admin/UserManager'
import { ShiftLimitsManager } from '@/components/Admin/ShiftLimitsManager'
import { useScheduleLock } from '@/hooks/useScheduleLock'
import { toast } from 'sonner'
import type { Profile } from '@/types'

interface AdminPageProps {
  profile: Profile
}

export function AdminPage({ profile }: AdminPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'import'

  const [lockMonth, setLockMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const { isLocked, toggleLock } = useScheduleLock(lockMonth)
  const [toggling, setToggling] = useState(false)

  if (profile.role !== 'admin') {
    return <Navigate to="/calendar" replace />
  }

  const handleToggleLock = async () => {
    setToggling(true)
    const { error } = await toggleLock()
    if (error) toast.error('Failed to toggle lock')
    else toast.success(isLocked ? `${lockMonth} unlocked` : `${lockMonth} locked`)
    setToggling(false)
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-4 py-4">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <div className="flex items-center gap-2">
          <MonthPicker value={lockMonth} onChange={setLockMonth} />
          <Button
            size="sm"
            disabled={toggling}
            onClick={handleToggleLock}
            className="font-semibold gap-1.5"
            style={{
              backgroundColor: isLocked ? '#dc2626' : '#16a34a',
              color: '#ffffff',
            }}
          >
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {isLocked ? 'Locked' : 'Editing Enabled'}
          </Button>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="shrink-0 -ml-3">
          <TabsTrigger value="import">Data Import</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="assignments">Assignment Overview</TabsTrigger>
          <TabsTrigger value="limits">Shift Limits</TabsTrigger>
        </TabsList>
        <TabsContent value="import" className="flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
          <ImportPanel />
        </TabsContent>
        <TabsContent value="users" className="flex-1 overflow-hidden data-[state=inactive]:hidden" forceMount>
          <UserManager profile={profile} />
        </TabsContent>
        <TabsContent value="assignments" className="flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
          <AssignmentTable />
        </TabsContent>
        <TabsContent value="limits" className="flex-1 overflow-auto data-[state=inactive]:hidden" forceMount>
          <ShiftLimitsManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
