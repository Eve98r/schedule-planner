import { Navigate } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImportPanel } from '@/components/Admin/ImportPanel'
import { AssignmentTable } from '@/components/Admin/AssignmentTable'
import { UserManager } from '@/components/Admin/UserManager'
import type { Profile } from '@/types'

interface AdminPageProps {
  profile: Profile
}

export function AdminPage({ profile }: AdminPageProps) {
  if (profile.role !== 'admin') {
    return <Navigate to="/calendar" replace />
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-4 py-4">
      <h1 className="mb-4 text-2xl font-semibold shrink-0">Admin Panel</h1>
      <Tabs defaultValue="import" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="shrink-0 -ml-3">
          <TabsTrigger value="import">Data Import</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="assignments">Assignment Overview</TabsTrigger>
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
      </Tabs>
    </div>
  )
}
