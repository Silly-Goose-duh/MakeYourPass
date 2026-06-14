import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Wraps routes that require authentication.
 * Shows a loading spinner while checking session,
 * then redirects to /login if not authenticated.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Checking session...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

/**
 * Wraps routes that should only be visible to unauthenticated users
 * (login, signup). Redirects to dashboard if already logged in.
 */
export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
