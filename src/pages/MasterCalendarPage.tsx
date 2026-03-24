import { Navigate } from 'react-router-dom'
import { MasterCalendar } from '@/components/Admin/MasterCalendar'
import type { Profile } from '@/types'

interface MasterCalendarPageProps {
  profile: Profile
}

export function MasterCalendarPage({ profile }: MasterCalendarPageProps) {
  if (profile.role !== 'admin') {
    return <Navigate to="/calendar" replace />
  }

  return <MasterCalendar />
}
