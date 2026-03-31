import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Layout/Navbar'
import { LoginPage } from '@/pages/LoginPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { AdminPage } from '@/pages/AdminPage'
import { MasterCalendarPage } from '@/pages/MasterCalendarPage'
import { ShiftLimitsPage } from '@/pages/ShiftLimitsPage'

function App() {
  const { profile, loading, signIn, signInWithGoogle, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#1a1a3e' }}>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    )
  }

  if (!profile) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage onSignIn={signIn} onGoogleSignIn={signInWithGoogle} />} />
      </Routes>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      <Navbar profile={profile} onSignOut={signOut} />
      <div className="flex-1 overflow-auto overscroll-none" style={{ WebkitOverflowScrolling: 'touch' }}>
        <Routes>
          <Route path="/calendar" element={<CalendarPage profile={profile} />} />
          <Route path="/admin" element={<AdminPage profile={profile} />} />
          <Route path="/master-calendar" element={<MasterCalendarPage profile={profile} />} />
          <Route path="/shift-limits" element={<ShiftLimitsPage profile={profile} />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
