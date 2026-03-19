import { useState, useEffect, useCallback, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) fetchProfile(s.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        if (s?.user) {
          fetchProfile(s.user.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // Periodically try to refresh the session (every 30s).
  // If admin reset the password, the refresh token becomes invalid
  // and this will force the user back to the login screen.
  // Skip for admins — they control the resets themselves.
  useEffect(() => {
    if (!session || !profile || profile.role === 'admin') return
    const interval = setInterval(async () => {
      const { error } = await supabase.auth.refreshSession()
      if (error) {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setSession(null)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [session, profile])

  // Idle timeout: sign out after 30 minutes of no user interaction
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!session) return

    const resetTimer = () => {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(async () => {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setSession(null)
      }, IDLE_TIMEOUT_MS)
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, resetTimer))
    resetTimer()

    return () => {
      clearTimeout(idleTimer.current)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [session])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
  }

  return { user, profile, session, loading, signIn, signOut }
}
