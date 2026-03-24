import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/types'

interface NavbarProps {
  profile: Profile | null
  onSignOut: () => void
}

export function Navbar({ profile, onSignOut }: NavbarProps) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    onSignOut()
    navigate('/')
  }

  return (
    <nav className="relative flex h-14" style={{ backgroundColor: '#1a1a3e' }}>
      {/* Left corner with logo background + oblique edge */}
      <div
        className="relative flex items-center gap-2.5 pl-4 pr-10 shrink-0"
        style={{
          backgroundColor: '#12122e',
          clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 100%, 0 100%)',
        }}
      >
        <Link to="/calendar" className="flex items-center gap-2.5">
          <img src={import.meta.env.BASE_URL + 'logo2.png'} alt="Logo" className="h-10 w-10 rounded-full" />
          <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#e8e0f0' }}>
            Schedule Planner
          </span>
        </Link>
      </div>

      {/* Right side */}
      <div className="flex flex-1 items-center justify-end px-4 gap-4">
        {profile && (
          <>
            <span className="text-sm" style={{ color: '#e8e0f0' }}>{profile.full_name}</span>
            {profile.role === 'admin' && (
              <>
                <Link to="/master-calendar">
                  <Button
                    size="sm"
                    className="font-semibold hover:opacity-90"
                    style={{ backgroundColor: 'rgba(232, 224, 240, 0.15)', color: '#e8e0f0', border: '1px solid rgba(232, 224, 240, 0.3)' }}
                  >
                    Overview
                  </Button>
                </Link>
                <Link to="/admin">
                  <Button
                    size="sm"
                    className="font-semibold hover:opacity-90"
                    style={{ backgroundColor: 'rgba(232, 224, 240, 0.15)', color: '#e8e0f0', border: '1px solid rgba(232, 224, 240, 0.3)' }}
                  >
                    Admin
                  </Button>
                </Link>
              </>
            )}
            <button
              className="text-sm px-3 py-1 rounded-md border transition-colors"
              style={{ color: '#e8e0f0', borderColor: 'rgba(232, 224, 240, 0.3)' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#e8e0f0'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(232, 224, 240, 0.3)'}
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
