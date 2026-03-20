import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Navbar } from '@/components/Layout/Navbar'
import { LoginPage } from '@/pages/LoginPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { AdminPage } from '@/pages/AdminPage'

function App() {
  const { profile, loading, signIn, signInWithGoogle, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar profile={profile} onSignOut={signOut} />
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="/calendar" element={<CalendarPage profile={profile} />} />
          <Route path="/admin" element={<AdminPage profile={profile} />} />
          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
