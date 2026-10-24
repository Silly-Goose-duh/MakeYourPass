import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Building2, Clock, ExternalLink, Image as ImageIcon, Plus, RefreshCw, Sparkles, CheckCircle2, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, getUserOrganizations, getUserRequests, getEventsByOrganization } from '@/lib/supabase'
import { RegistrantsReport } from '@/components/org/RegistrantsReport'
import { TicketTemplateUpload } from '@/components/org/TicketTemplateUpload'
import type { Profile, Organization, OrgRegistrationRequest, OrganizationMember, CampusEvent } from '@/types'

/**
 * /dashboard hub:
 * - Approved org membership → redirect to /{org-slug}
 * - Pending org request → "request is pending, please wait"
 * - Neither → soft CTA to request an organization
 * - Approved org *admins* → org workspace (registrants + ticket design)
 */
export function OrgDashboard() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [memberRows, setMemberRows] = useState<(OrganizationMember & { organizations: Organization | null })[]>([])
  const [pending, setPending] = useState<OrgRegistrationRequest | null>(null)
  const [rejected, setRejected] = useState<OrgRegistrationRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadAttempt = useRef(0)

  const loadDashboard = useCallback(async (silent = false) => {
    if (!user) return
    const attempt = ++loadAttempt.current
    if (!silent) setLoading(true)
    setLoadError(null)

    try {
      const [profileResult, membershipResult, requestResult] = await Promise.all([
        getProfile(user.id),
        getUserOrganizations(),
        getUserRequests(),
      ])

      if (attempt !== loadAttempt.current) return
      const failed = [profileResult, membershipResult, requestResult].find((result) => result.error)
      if (failed?.error) {
        const message = failed.error instanceof Error
          ? failed.error.message
          : typeof failed.error === 'object' && failed.error !== null && 'message' in failed.error
            ? String((failed.error as { message: unknown }).message)
            : 'The dashboard data could not be loaded.'
        setLoadError(message)
        return
      }

      if (profileResult.data) setProfile(profileResult.data)
      const rows = (membershipResult.data || []) as (OrganizationMember & { organizations: Organization | null })[]
      setMemberRows(rows)
      setOrgs(rows.map((m) => m.organizations).filter(Boolean) as Organization[])
      const reqs = requestResult.data || []
      setPending(reqs.find((r) => r.status === 'pending') || null)
      setRejected(reqs.find((r) => r.status === 'rejected') || null)
    } catch (error) {
      if (attempt !== loadAttempt.current) return
      setLoadError(error instanceof Error ? error.message : 'The dashboard data could not be loaded.')
    } finally {
      if (attempt === loadAttempt.current) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
    return () => { loadAttempt.current += 1 }
  }, [loadDashboard])

  // While a request is pending, poll quietly so an approved club sees its
  // portal go live without a manual refresh (this page has no realtime hook).
  useEffect(() => {
    if (!user || !pending) return
    const tick = () => {
      if (document.visibilityState === 'visible') void loadDashboard(true)
    }
    const timer = window.setInterval(tick, 20_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [user, pending, loadDashboard])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE1' }}>
        <div className="h-8 w-8 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F4EFE1' }}>
        <div
          className="max-w-lg w-full p-8 sm:p-10 text-center"
          style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
        >
          <div
            className="h-16 w-16 flex items-center justify-center mx-auto mb-6"
            style={{ background: '#FFE9E3', border: '2.5px solid #14110E' }}
          >
            <RefreshCw className="h-8 w-8" strokeWidth={2.5} style={{ color: '#FF4D2E' }} />
          </div>
          <h1 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            Dashboard unavailable
          </h1>
          <p className="text-sm font-semibold mb-3" style={{ color: '#4A4640' }}>
            We couldn&apos;t load your organizations and requests. Your dashboard has not been treated as empty.
          </p>
          <p className="text-xs font-semibold mb-6" style={{ color: '#FF4D2E' }} role="alert">
            {loadError}
          </p>
          <Button variant="primary" size="lg" onClick={() => void loadDashboard()}>
            <RefreshCw className="h-5 w-5" /> Try again
          </Button>
        </div>
      </div>
    )
  }

  const isSuper = !!profile?.is_superadmin
  const approvedAny = orgs.filter((o) => o?.slug && o.is_approved !== false)
  // Same destination rule as before, so plain members keep landing on their portal
  const dest = approvedAny.find((o) => o.is_approved === true) || approvedAny[0]
  // Admin memberships unlock this workspace instead of the plain redirect
  const adminOrgs = memberRows
    .filter((m) => m.role === 'admin' && m.organizations && m.organizations.slug && m.organizations.is_approved !== false)
    .map((m) => m.organizations as Organization)

  if (dest && adminOrgs.length === 0) {
    return <Navigate to={`/${dest.slug}`} replace />
  }
  // Superadmin only auto-jumps to MC when nothing is pending for them
  if (isSuper && !pending && !rejected) {
    return <Navigate to="/mc" replace />
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-16" style={{ background: '#F4EFE1' }}>
      {dest && adminOrgs.length > 0 ? (
        <OrgWorkspace orgs={adminOrgs} />
      ) : (
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
      )}
    </div>
  )
}

/** Org header card + workspace entry for approved admins. */
function OrgWorkspace({ orgs }: { orgs: Organization[] }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? '')
  const active = orgs.find((o) => o.id === orgId) || orgs[0]

  if (!active) return null
  return (
    <div className="max-w-lg mx-auto space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 sm:p-8"
        style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
      >
        <p className="text-[10px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#4A4640' }}>
          Org workspace
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            {active.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Link to={`/${active.slug}`} className="zine-sticker" style={{ background: '#fff' }}>
              Public portal <ExternalLink className="inline h-3 w-3 ml-1" />
            </Link>
          </div>
        </div>
        {orgs.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: '2px dashed rgba(20,17,14,0.25)' }}>
            {orgs.map((o) => {
              const selected = o.id === orgId
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOrgId(o.id)}
                  className="px-3 py-1.5 text-xs font-extrabold border-2 border-[#14110E] shadow-[2px_2px_0_#14110E]"
                  style={{ background: selected ? '#FFD23F' : '#fff', color: '#14110E' }}
                >
                  {o.name}
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
      <OrgEventsPanel key={active.id} org={active} />
    </div>
  )
}

/** Events of one org; the selected event carries the two admin sections. */
function OrgEventsPanel({ org }: { org: Organization }) {
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [eventId, setEventId] = useState<string | null>(null)
  const [tab, setTab] = useState<'registrants' | 'ticket'>('registrants')

  const loadEvents = useCallback(async () => {
    const { data, error } = await getEventsByOrganization(org.id)
    if (error) setLoadErr(error.message)
    else setLoadErr(null)
    const list = data || []
    setEvents(list)
    setEventId((prev) => (prev && list.some((e) => e.id === prev) ? prev : list[0]?.id ?? null))
    setLoadingEvents(false)
  }, [org.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents()
  }, [loadEvents])

  const replaceEvent = (updated: CampusEvent) => {
    setEvents((list) => list.map((e) => (e.id === updated.id ? updated : e)))
  }

  const selected = events.find((e) => e.id === eventId) || null

  return (
    <div
      className="p-4 sm:p-5"
      style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
          Events
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void loadEvents()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Link to="/dashboard/events/new">
            <Button variant="primary" size="sm">
              <Plus className="h-4 w-4" /> New event
            </Button>
          </Link>
        </div>
      </div>

      {loadingEvents ? (
        <div className="py-8 flex items-center justify-center">
          <div className="h-6 w-6 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadErr ? (
        <p className="py-4 text-xs font-bold" style={{ color: '#FF4D2E' }} role="alert">
          {loadErr}
        </p>
      ) : events.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm font-semibold mb-3" style={{ color: '#4A4640' }}>
            No events yet — create your first event to manage registrants and ticket design.
          </p>
          <Link to="/dashboard/events/new">
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" /> New event
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {events.map((e) => {
              const isSelected = e.id === eventId
              const dot = e.status === 'published' ? '#14B87A' : e.status === 'cancelled' ? '#FF4D2E' : '#7A756B'
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEventId(e.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold border-2 border-[#14110E] shadow-[2px_2px_0_#14110E] max-w-full"
                  style={{ background: isSelected ? '#FFD23F' : '#fff', color: '#14110E' }}
                  title={e.status}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />
                  <span className="truncate">{e.title}</span>
                </button>
              )
            })}
          </div>

          {selected && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('registrants')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold border-2 border-[#14110E]"
                    style={{ background: tab === 'registrants' ? '#FFD23F' : '#fff', color: '#14110E' }}
                  >
                    <Users className="h-3.5 w-3.5" strokeWidth={2.5} /> Registrants
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('ticket')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold border-2 border-[#14110E]"
                    style={{ background: tab === 'ticket' ? '#FFD23F' : '#fff', color: '#14110E' }}
                  >
                    <ImageIcon className="h-3.5 w-3.5" strokeWidth={2.5} /> Ticket design
                  </button>
                </div>
                <div className="flex gap-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: '#14110E' }}>
                  <Link to={`/host/${selected.id}/dashboard`} className="underline decoration-2">
                    Live
                  </Link>
                  <Link to={`/dashboard/events/${selected.id}/edit`} className="underline decoration-2">
                    Edit
                  </Link>
                </div>
              </div>

              {tab === 'registrants' ? (
                <RegistrantsReport key={selected.id} event={selected} />
              ) : (
                <TicketTemplateUpload key={selected.id} event={selected} onUpdated={replaceEvent} />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
