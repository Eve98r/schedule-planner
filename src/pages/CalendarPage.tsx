import { CalendarGrid } from '@/components/Calendar/CalendarGrid'
import type { Profile } from '@/types'

interface CalendarPageProps {
  profile: Profile
}

export function CalendarPage({ profile }: CalendarPageProps) {
  return <CalendarGrid profile={profile} />
}
