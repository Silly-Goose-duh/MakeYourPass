import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEffect, useState } from 'react'
import { getProfile, supabase } from '@/lib/supabase'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function OrgAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)
  const [profileDone, setProfileDone] = useState(false)

  useEffect(() => {
    if (!user) return
    (async () => {
      const { data: profileData } = await getProfile(user.id)
      if (profileData?.is_superadmin) {
        setIsOrgAdmin(true)
      } else {
        const { data: memberships } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
        setIsOrgAdmin(!!(memberships && memberships.length > 0))
      }
      setProfileDone(true)
    })()
  }, [user])

  const checking = user !== undefined && !(user === null || profileDone)
  if (loading || checking) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!isOrgAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [profileDone, setProfileDone] = useState(false)

  useEffect(() => {
    if (!user) return
    getProfile(user.id).then(({ data }) => {
      setIsSuperAdmin(!!data?.is_superadmin)
      setProfileDone(true)
    })
  }, [user])

  const checking = !!user && !profileDone

  if (loading || checking) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export function HostRoute({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user || !eventId) return
    ;(async () => {
      const { data: profile } = await getProfile(user.id)
      if (profile?.is_superadmin) { setAllowed(true); return }
      const { data: ev } = await supabase
        .from('events').select('organization_id').eq('id', eventId).single()
      if (!ev) { setAllowed(false); return }
      // admin OR host can scan / live-admit
      const { data: mem } = await supabase
        .from('organization_members')
        .select('id, role')
        .eq('organization_id', ev.organization_id)
        .eq('user_id', user.id)
        .in('role', ['admin', 'host'])
        .limit(1)
      setAllowed(!!(mem && mem.length > 0))
    })()
  }, [user, eventId])

  if (loading || allowed === null) return <div className="min-h-screen bg-background flex items-center justify-center"><LoadingSpinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!allowed) return <Navigate to="/dashboard" replace />
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
