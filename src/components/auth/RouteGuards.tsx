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
    ;(async () => {
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
  // null = still checking; only used when user is present
  const [hostOk, setHostOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user || !eventId) {
      // Don't setState here — render path handles !user / !eventId
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data: profile } = await getProfile(user.id)
        if (!alive) return
        if (profile?.is_superadmin) {
          setHostOk(true)
          return
        }
        const { data: ev } = await supabase
          .from('events')
          .select('organization_id')
          .eq('id', eventId)
          .maybeSingle()
        if (!alive) return
        if (!ev) {
          setHostOk(false)
          return
        }
        const { data: mem } = await supabase
          .from('organization_members')
          .select('id, role')
          .eq('organization_id', ev.organization_id)
          .eq('user_id', user.id)
          .in('role', ['admin', 'host'])
          .limit(1)
        if (!alive) return
        setHostOk(!!(mem && mem.length > 0))
      } catch {
        if (alive) setHostOk(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [user, eventId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!eventId) return <Navigate to="/dashboard" replace />
  if (hostOk === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }
  if (!hostOk) return <Navigate to="/dashboard" replace />
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
