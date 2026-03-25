import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/types'

interface NavbarProps {
  profile: Profile | null
  onSignOut: () => void
}

const navBtnStyle = {
  backgroundColor: 'rgba(232, 224, 240, 0.15)',
  color: '#e8e0f0',
  border: '1px solid rgba(232, 224, 240, 0.3)',
}

export function Navbar({ profile, onSignOut }: NavbarProps) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    onSignOut()
    navigate('/')
  }

  const canManage = profile?.role === 'admin' || profile?.role === 'manager'

  return (
    <nav className="relative flex h-14" style={{ backgroundColor: '#1a1a3e' }}>
      {/* Left corner with logo background + oblique edge */}
      <div
        className="relative flex items-center gap-2.5 pl-4 pr-4 sm:pr-10 shrink-0"
        style={{
          backgroundColor: '#12122e',
          clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 100%, 0 100%)',
        }}
      >
        <Link to="/calendar" className="flex items-center gap-2.5">
          <img src={import.meta.env.BASE_URL + 'logo2.png'} alt="Logo" className="h-10 w-10 rounded-full" />
          <span className="hidden sm:inline text-sm font-semibold uppercase tracking-wider" style={{ color: '#e8e0f0' }}>
            Schedule Planner
          </span>
        </Link>
      </div>

      {/* Right side — desktop */}
      <div className="flex flex-1 items-center justify-end px-4 gap-4">
        {profile && (
          <>
            <span className="hidden sm:inline text-sm" style={{ color: '#e8e0f0' }}>{profile.full_name}</span>

            {/* Desktop nav buttons */}
            <div className="hidden sm:flex gap-4">
              {canManage && (
                <Link to="/master-calendar">
                  <Button size="sm" className="font-semibold hover:opacity-90" style={navBtnStyle}>
                    Overview
                  </Button>
                </Link>
              )}
              {profile.role === 'manager' && (
                <Link to="/shift-limits">
                  <Button size="sm" className="font-semibold hover:opacity-90" style={navBtnStyle}>
                    Limits
                  </Button>
                </Link>
              )}
              {profile.role === 'admin' && (
                <Link to="/admin">
                  <Button size="sm" className="font-semibold hover:opacity-90" style={navBtnStyle}>
                    Admin
                  </Button>
                </Link>
              )}
            </div>

            {/* Sign Out — always visible */}
            <button
              className="hidden sm:block text-sm px-3 py-1 rounded-md border transition-colors"
              style={{ color: '#e8e0f0', borderColor: 'rgba(232, 224, 240, 0.3)' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#e8e0f0'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(232, 224, 240, 0.3)'}
              onClick={handleSignOut}
            >
              Sign Out
            </button>

            {/* Mobile hamburger */}
            <button
              className="sm:hidden p-1.5 rounded-md"
              style={{ color: '#e8e0f0' }}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </>
        )}
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && profile && (
        <div
          className="absolute top-14 left-0 right-0 z-40 flex flex-col gap-1 p-3 sm:hidden"
          style={{ backgroundColor: '#1a1a3e', borderBottom: '1px solid rgba(232, 224, 240, 0.15)' }}
        >
          <div className="px-3 py-1.5 text-xs font-medium" style={{ color: 'rgba(232, 224, 240, 0.5)' }}>
            {profile.full_name}
          </div>
          {canManage && (
            <Link to="/master-calendar" onClick={() => setMobileOpen(false)}>
              <div className="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10" style={{ color: '#e8e0f0' }}>
                Overview
              </div>
            </Link>
          )}
          {profile.role === 'manager' && (
            <Link to="/shift-limits" onClick={() => setMobileOpen(false)}>
              <div className="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10" style={{ color: '#e8e0f0' }}>
                Limits
              </div>
            </Link>
          )}
          {profile.role === 'admin' && (
            <Link to="/admin" onClick={() => setMobileOpen(false)}>
              <div className="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10" style={{ color: '#e8e0f0' }}>
                Admin
              </div>
            </Link>
          )}
          <button
            className="mt-1 px-3 py-2 rounded-md text-sm font-medium text-left hover:bg-white/10"
            style={{ color: '#e8e0f0' }}
            onClick={() => { setMobileOpen(false); handleSignOut() }}
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  )
}
