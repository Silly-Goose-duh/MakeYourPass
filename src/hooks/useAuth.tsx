/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true })

/**
 * Wraps the app so all children share the same auth state.
 * Reads the session from localStorage instantly on mount,
 * then validates the token in the background.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthState()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

/**
 * Hook to read auth state from context.
 * Use this in any component that needs the current user.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

/**
 * Internal hook that manages the actual auth state.
 * - getSession() reads from localStorage immediately (no network)
 * - getUser() validates the JWT with Supabase servers in background
 * - onAuthStateChange handles login/logout/token refresh in real-time
 */
function useAuthState(): AuthContextValue {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // 1. Instantly hydrate from localStorage (no network call)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session?.user) {
        setUser(session.user)
      }
      setLoading(false)
    })

    // 2. Validate the token against Supabase in the background.
    //    If expired, this will set user to null and trigger re-login.
    supabase.auth.getUser().then(({ data: { user: validatedUser } }) => {
      if (!mounted) return
      setUser(validatedUser)
    })

    // 3. Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
