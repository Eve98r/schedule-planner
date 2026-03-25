import { Navigate } from 'react-router-dom'
import { ShiftLimitsManager } from '@/components/Admin/ShiftLimitsManager'
import type { Profile } from '@/types'

interface ShiftLimitsPageProps {
  profile: Profile
}

export function ShiftLimitsPage({ profile }: ShiftLimitsPageProps) {
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    return <Navigate to="/calendar" replace />
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-4 py-4">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-semibold">Limits</h1>
      </div>
      <div className="flex-1 overflow-hidden">
        <ShiftLimitsManager />
      </div>
    </div>
  )
}
