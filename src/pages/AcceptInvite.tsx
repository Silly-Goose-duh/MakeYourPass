import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Users, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { acceptOrgInvite, supabase } from '@/lib/supabase'

/**
 * /invite/:token — accept org collaborator invite.
 * User must be signed in with the invited email.
 */
export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'idle' | 'working' | 'ok' | 'err'>(
    !token ? 'err' : 'idle'
  )
  const [message, setMessage] = useState(!token ? 'Invalid invite link' : '')
  const [orgSlug, setOrgSlug] = useState<string | null>(null)
  // One-shot guard: useAuth can re-emit `user` with a new object reference on
  // mount (getSession → getUser → onAuthStateChange). Keying on user?.id and a
  // ref prevents the RPC from firing twice (which flips a success into "already used").
  const firedFor = useRef<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!token) return
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/invite/${token}`)}`, { replace: true })
      return
    }
    // One-shot guard: useAuth can re-emit `user` with a new object reference on
    // mount (getSession → getUser → onAuthStateChange). Keying the guard on the
    // token prevents the RPC from firing twice (which flips success into "already used").
    if (firedFor.current === token) return
    let alive = true
    ;(async () => {
      firedFor.current = token
      setStatus('working')
      const { data, error } = await acceptOrgInvite(token)
      if (!alive) return
      if (error || (data && data.error)) {
        setStatus('err')
        setMessage(String(data?.error || error?.message || 'Could not accept invite'))
        return
      }
      const orgId = data?.organization_id as string | undefined
      if (orgId) {
        const { data: org } = await supabase.from('organizations').select('slug').eq('id', orgId).maybeSingle()
        if (org?.slug) setOrgSlug(org.slug)
      }
      setStatus('ok')
      setMessage("You're on the team! You can scan tickets and help run events.")
    })()
    return () => { alive = false }
  }, [token, user, authLoading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="w-full max-w-md p-8 text-center" style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '6px 6px 0 #14110E' }}>
        {status === 'working' || status === 'idle' ? (
          <>
            <div className="h-8 w-8 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-extrabold" style={{ fontFamily: 'Syne, sans-serif' }}>Accepting invite…</p>
          </>
        ) : status === 'ok' ? (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3" style={{ color: '#14B87A' }} />
            <h1 className="text-xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>Invite accepted</h1>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>{message}</p>
            <Button variant="primary" onClick={() => navigate(orgSlug ? `/${orgSlug}` : '/dashboard')}>
              Open org portal
            </Button>
          </>
        ) : (
          <>
            <AlertCircle className="h-12 w-12 mx-auto mb-3" style={{ color: '#FF4D2E' }} />
            <h1 className="text-xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#FF4D2E' }}>Could not join</h1>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>{message}</p>
            <div className="flex flex-col gap-2">
              <Link to="/login"><Button variant="primary" fullWidth>Sign in with invited email</Button></Link>
              <Link to="/signup"><Button variant="ghost" fullWidth>Create account</Button></Link>
            </div>
          </>
        )}
        <p className="mt-6 text-xs font-semibold flex items-center justify-center gap-1" style={{ color: '#4A4640' }}>
          <Users className="h-3.5 w-3.5" /> Collaborator access
        </p>
      </div>
    </div>
  )
}

export default AcceptInvitePage
