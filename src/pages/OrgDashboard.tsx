import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, Clock, Plus, Sparkles, CheckCircle2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, getUserOrganizations, getUserRequests } from '@/lib/supabase'
import type { Profile, Organization, OrgRegistrationRequest } from '@/types'

/**
 * /dashboard hub:
 * - Approved org membership → redirect to /{org-slug}
 * - Pending org request → "request is pending, please wait"
 * - Neither → soft CTA to request an organization
 */
export function OrgDashboard() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [pending, setPending] = useState<OrgRegistrationRequest | null>(null)
  const [rejected, setRejected] = useState<OrgRegistrationRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      const [{ data: profileData }, { data: memberships }, { data: requests }] = await Promise.all([
        getProfile(user.id),
        getUserOrganizations(),
        getUserRequests(),
      ])
      if (!alive) return
      if (profileData) setProfile(profileData)
      const orgList = (memberships || []).map((m) => m.organizations).filter(Boolean) as Organization[]
      setOrgs(orgList)
      const reqs = requests || []
      setPending(reqs.find((r) => r.status === 'pending') || null)
      setRejected(reqs.find((r) => r.status === 'rejected') || null)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE1' }}>
        <div className="h-8 w-8 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Approved org(s) → real dashboard is /:orgSlug
  const approved = orgs.filter((o) => o?.slug && o.is_approved !== false)
  const dest = approved.find((o) => o.is_approved === true) || approved[0]
  if (dest?.slug) {
    return <Navigate to={`/${dest.slug}`} replace />
  }

  const isSuper = !!profile?.is_superadmin
  // Superadmin only auto-jumps to MC when nothing is pending for them
  if (isSuper && !pending && !rejected) {
    return <Navigate to="/mc" replace />
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-16" style={{ background: '#F4EFE1' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto p-8 sm:p-10 text-center"
        style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
      >
        {pending ? (
          <>
            <div
              className="h-16 w-16 flex items-center justify-center mx-auto mb-6"
              style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}
            >
              <Clock className="h-8 w-8" strokeWidth={2.5} style={{ color: '#14110E' }} />
            </div>
            <span className="zine-sticker mb-4" style={{ background: '#FFD23F' }}>
              Please wait
            </span>
            <h1
              className="text-2xl sm:text-3xl font-extrabold mt-4 mb-3"
              style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}
            >
              Request is pending — please wait
            </h1>
            <p className="text-sm font-semibold mb-2" style={{ color: '#4A4640' }}>
              Your request for{' '}
              <strong style={{ color: '#14110E' }}>{pending.organization_name}</strong> is with the
              superadmin for review.
            </p>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
              Hang tight. Once approved, your club dashboard opens at{' '}
              <strong style={{ color: '#14110E' }}>
                makeyourpass.vercel.app/{pending.organization_slug}
              </strong>
            </p>
            <div
              className="p-3 mb-6 text-left text-xs font-semibold"
              style={{ background: '#FFF6D6', border: '2px solid #14110E', color: '#14110E' }}
            >
              No action needed right now. Submitted{' '}
              {new Date(pending.created_at).toLocaleString()}. You can close this tab and come back
              later — we&apos;ll unlock the portal when it&apos;s approved.
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link to="/">
                <Button variant="secondary">Browse events</Button>
              </Link>
              {isSuper && (
                <Link to="/mc">
                  <Button variant="primary">
                    <Sparkles className="h-4 w-4" /> MC Panel
                  </Button>
                </Link>
              )}
            </div>
            <p className="mt-8 text-[11px] font-semibold flex items-center justify-center gap-1" style={{ color: '#7A756B' }}>
              <CheckCircle2 className="h-3 w-3" /> Signed in as {user?.email}
            </p>
            <p className="mt-2 text-[11px] font-semibold" style={{ color: '#7A756B' }}>
              <ExternalLink className="inline h-3 w-3 mr-1" />
              Portal reserved: /{pending.organization_slug}
            </p>
          </>
        ) : rejected ? (
          <>
            <div
              className="h-16 w-16 flex items-center justify-center mx-auto mb-6"
              style={{ background: '#FFE9E3', border: '2.5px solid #14110E' }}
            >
              <Building2 className="h-8 w-8" strokeWidth={2.5} style={{ color: '#FF4D2E' }} />
            </div>
            <h1 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
              Request wasn&apos;t approved
            </h1>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
              Your request for <strong>{rejected.organization_name}</strong> was not approved. You can
              submit a new one when you&apos;re ready.
            </p>
            <Link to="/signup?step=organization">
              <Button variant="primary" size="lg">
                <Plus className="h-5 w-5" /> Submit a new request
              </Button>
            </Link>
          </>
        ) : (
          <>
            <div
              className="h-16 w-16 flex items-center justify-center mx-auto mb-6"
              style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}
            >
              <Clock className="h-8 w-8" strokeWidth={2.5} style={{ color: '#14110E' }} />
            </div>
            <h1 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
              Almost there
            </h1>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
              You&apos;re signed in. To get a club dashboard, send a short organization request.
              After superadmin approves it, your portal at{' '}
              <code style={{ color: '#14110E' }}>/your-club</code> becomes the live dashboard.
              If you already sent one, hang tight — it may still be pending.
            </p>
            <Link to="/signup?step=organization">
              <Button variant="primary" size="lg">
                <Plus className="h-5 w-5" /> Request organization
              </Button>
            </Link>
            {isSuper && (
              <div className="mt-4">
                <Link to="/mc" className="text-sm font-extrabold" style={{ color: '#FF4D2E' }}>
                  Open MC Panel →
                </Link>
              </div>
            )}
            <p className="mt-8 text-[11px] font-semibold" style={{ color: '#7A756B' }}>
              Signed in as {user?.email}
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
