import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'
import { getProfile, supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function OrgAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!user) { setChecking(false); return }
    ;(async () => {
      const { data: profileData } = await getProfile(user.id)
      setProfile(profileData)
      if (profileData?.is_superadmin) {
        setIsOrgAdmin(true)
        setChecking(false)
        return
      }
      // Check if user is a member of any organization
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      setIsOrgAdmin(!!(memberships && memberships.length > 0))
      setChecking(false)
    })()
  }, [user])

  if (loading || checking) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!isOrgAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!user) { setChecking(false); return }
    getProfile(user.id).then(({ data }) => {
      setProfile(data)
      setChecking(false)
    })
  }, [user])

  if (loading || checking) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.is_superadmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-text-muted text-sm">Loading...</p>
    </div>
  )
}
