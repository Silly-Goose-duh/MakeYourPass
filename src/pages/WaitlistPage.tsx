import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Calendar, CheckCircle, Clock, MapPin, UserPlus, AlertCircle } from 'lucide-react'
import { getEventBySlug, getSeatStatus, subscribeToResponses, supabase, getCurrentProfile, type SeatStatus } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isSoldOut } from '@/components/event/eventUtils'
import type { CampusEvent, Organization } from '@/types'

/**
 * WaitlistPage — the seats-filled waiting-list form.
 *
 * Route:
 *   /event/:eventSlug/full        → URL: /event/<slug>/full
 *   /waiting-list?event=:slug     → dedicated route (same component; slug via
 *                                   the ?event= query param)
 *
 * Reached from EventsPage (and the About page) when the event_seat_status view
 * reports seats_left <= 0 for a non-past event. Anonymous-only flow: it reads the event by slug
 * (same fetch pattern as PublicEventForm) and inserts into `event_waitlist`
 * with the anon INSERT policy from migration 002.
 *
 * If seats have freed up by the time this page loads, the user is bounced to
 * the normal event page (registration form) instead of offering the waitlist.
 */

type LoadedEvent = CampusEvent & { organizations: Organization }

// Tiny confetti chips for the success state (subtle, one-shot, zine palette).
const CONFETTI = [
  { l: '8%', c: '#FF4D2E', d: 0.00, s: 8, r: -16 },
  { l: '20%', c: '#2D5BFF', d: 0.10, s: 6, r: 20 },
  { l: '33%', c: '#14B87A', d: 0.05, s: 9, r: -10 },
  { l: '46%', c: '#FFD23F', d: 0.16, s: 7, r: 26 },
  { l: '58%', c: '#E84AC4', d: 0.08, s: 8, r: -24 },
  { l: '70%', c: '#14B87A', d: 0.20, s: 6, r: 14 },
  { l: '82%', c: '#FF4D2E', d: 0.12, s: 7, r: -18 },
  { l: '92%', c: '#FFD23F', d: 0.24, s: 8, r: 10 },
]
// Skip the confetti entirely for users who prefer reduced motion.
const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WaitlistPage() {
  const { eventSlug } = useParams<{ eventSlug: string }>()
  const { user, loading: authLoading } = useAuth()
  // Slug comes either from the route (/event/:eventSlug/full) or, on the
  // dedicated /waiting-list route, from the ?event= query param.
  const [searchParams] = useSearchParams()
  const [event, setEvent] = useState<LoadedEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  // Seat rollup from the event_seat_status view (same helper the cards use).
  const [seatRow, setSeatRow] = useState<SeatStatus | null>(null)
  const [seatChecked, setSeatChecked] = useState(false)

  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [info, setInfo] = useState('')
  const [joined, setJoined] = useState(false)
  // Guard against realtime callbacks flipping the UI away after a successful join.
  const joinedRef = useRef(false)
  const slug = eventSlug || searchParams.get('event') || ''

  useEffect(() => {
    if (!user) return
    getCurrentProfile().then(({ data }) => {
      if (data?.email) setEmail(data.email)
    }).catch(() => {})
  }, [user])

  // ─── Load the event by slug (same pattern/anon policy as PublicEventForm) ───
  useEffect(() => {
    let cancelled = false
    let safetyTimer: ReturnType<typeof setTimeout> | undefined

    async function loadEvent() {
      setLoading(true)
      setError('')
      setNotFound(false)
      if (!slug) {
        setNotFound(true)
        setLoading(false)
        return
      }
      // Safety net: never let the page hang forever on a stalled request.
      safetyTimer = setTimeout(() => {
        if (!cancelled) {
          setLoading(false)
          setError('This page is taking too long to load. Check your connection and refresh.')
        }
      }, 12000)

      try {
        const { data: eventData, error: eventError } = await getEventBySlug(slug)
        if (cancelled) return
        if (eventError || !eventData) {
          if (eventError?.message?.includes('RLS_RECURSION')) {
            setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
            return
          }
          setNotFound(true)
          return
        }
        setEvent(eventData as unknown as LoadedEvent)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load event'
        setError(message.includes('RLS_RECURSION')
          ? 'Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.'
          : message)
      } finally {
        if (!cancelled) setLoading(false)
        if (safetyTimer) clearTimeout(safetyTimer)
      }
    }
    loadEvent()
    return () => { cancelled = true }
  }, [slug])

  // ─── Seats watch: rollup from event_seat_status + realtime on responses ───
  // Mirrors EventCard's SeatPill plumbing; used here to bounce to the normal
  // event page the moment a seat frees up.
  useEffect(() => {
    if (!event?.id) return
    let cancelled = false
    const check = async () => {
      try {
        const { data } = await getSeatStatus(event.id)
        if (cancelled || joinedRef.current) return
        if (data) setSeatRow(data)
      } catch {
        /* seat view unavailable — the isSoldOut(event) heuristic applies */
      } finally {
        if (!cancelled) setSeatChecked(true)
      }
    }
    check()
    let unsub: (() => void) | null = null
    try {
      unsub = subscribeToResponses(event.id, () => { if (!joinedRef.current) void check() })
    } catch {
      /* realtime unavailable in this environment — initial rollup is enough */
    }
    return () => { cancelled = true; unsub?.() }
  }, [event?.id])

  // Client-side email validation, same style as PublicEventForm.
  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email.trim()) newErrors.email = 'Email is required'
    else if (!emailRe.test(email.trim())) newErrors.email = 'Enter a valid email address'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!event || !validate()) return

    // Client rate limit: max 1 successful attempt / 20s per event in this browser
    try {
      const rk = `myp_waitlist_${event.id}`
      const last = Number(localStorage.getItem(rk) || '0')
      if (last && Date.now() - last < 20_000) {
        setInfo('Please wait a few seconds before trying again.')
        return
      }
    } catch { /* private mode */ }

    setSubmitting(true)
    setInfo('')
    setError('')
    try {
      // Anon insert into event_waitlist (migration 002: event_id, email,
      // user_agent, created_at; unique(event_id, lower(email)).
      const { error: insertError } = await supabase
        .from('event_waitlist')
        .insert([{
          event_id: event.id,
          email: email.trim(),
          user_agent: navigator.userAgent,
        }])
      if (insertError) {
        const code = (insertError as { code?: string }).code
        const msg = (insertError.message || '').toLowerCase()
        if (code === '23505' || msg.includes('duplicate') || msg.includes('unique') || msg.includes('event_waitlist')) {
          // Unique violation → friendly "already on the list" notice.
          setInfo('You’re already on the list! No need to join twice — keep an eye on your inbox.')
          return
        }
        if (msg.includes('rls_recursion')) {
          setError('The waiting list is temporarily unavailable while the database is being configured. Please try again later.')
          return
        }
        setError(insertError.message || 'Could not join the waiting list. Please try again.')
        return
      }
      try { localStorage.setItem(`myp_waitlist_${event.id}`, String(Date.now())) } catch { /* ignore */ }
      joinedRef.current = true
      setJoined(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Seats freed meanwhile → straight to the normal event page ───
  // (Only once we've actually checked; falls back to the response_count/capacity
  // heuristic when the seat view is unavailable.)
  if (event && !joined && seatChecked) {
    const seatsFree = seatRow
      ? (seatRow.seats_left === null ? true : seatRow.seats_left > 0)
      : !isSoldOut(event)
    if (seatsFree) {
      return <Navigate to={`/event/${event.slug || eventSlug || ''}`} replace />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-cp-bg-base)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full animate-spin" style={{ border: '2.5px solid #14110E', borderTopColor: 'transparent' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-cp-text-muted)' }}>Loading event…</p>
        </div>
      </div>
    )
  }

  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--color-cp-bg-base)' }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-strong w-full max-w-md p-8 text-center">
          <UserPlus className="h-10 w-10 mx-auto mb-4" style={{ color: '#FF4D2E' }} />
          <h1 className="text-2xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>Create an account to join the waitlist</h1>
          <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>Your account keeps your event registrations and waitlist status together.</p>
          <div className="flex flex-col gap-2">
            <Link to={`/account/signup?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="zine-btn zine-btn-accent">Create account</Link>
            <Link to={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="zine-btn" style={{ background: '#fff' }}>Sign in</Link>
          </div>
        </motion.div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--color-cp-bg-base)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong w-full max-w-md p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
            <AlertCircle className="h-7 w-7" strokeWidth={2.5} style={{ color: '#14110E' }} />
          </div>
          <h2 className="mb-2 text-xl font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--color-cp-text-primary)' }}>
            Event not found
          </h2>
          <p className="mb-6 text-sm font-semibold" style={{ color: 'var(--color-cp-text-muted)' }}>
            This event doesn’t exist or has been unpublished.
          </p>
          <Link to="/events" className="zine-btn uppercase">Browse all events</Link>
        </motion.div>
      </div>
    )
  }

  if (!event && error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--color-cp-bg-base)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong w-full max-w-md p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
            <AlertCircle className="h-7 w-7 text-white" strokeWidth={2.5} />
          </div>
          <h2 className="mb-2 text-xl font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--color-cp-text-primary)' }}>
            Couldn’t open the waiting list
          </h2>
          <p className="mb-6 text-sm font-semibold" style={{ color: 'var(--color-cp-text-muted)' }}>{error}</p>
          <button onClick={() => window.location.reload()} className="zine-btn zine-btn-accent uppercase">Try again</button>
          <div className="mt-3">
            <Link to="/events" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--color-cp-text-muted)' }}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Back to all events
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  if (event && joined) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--color-cp-bg-base)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }} className="glass-strong w-full max-w-md p-10 text-center relative">
          {/* Subtle one-shot confetti tick */}
          {!prefersReducedMotion && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {CONFETTI.map((c, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 0, rotate: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], y: 90 + (i % 4) * 28, rotate: c.r }}
                  transition={{ delay: 0.3 + c.d, duration: 1.8, times: [0, 0.15, 0.7, 1] }}
                  className="absolute"
                  style={{ left: c.l, top: '-4%', width: c.s, height: i % 2 ? c.s : Math.round(c.s * 0.55), background: c.c, border: '1.5px solid #14110E', borderRadius: i % 3 === 0 ? 999 : 0 }}
                />
              ))}
            </div>
          )}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.25, bounce: 0.5 }}
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center"
            style={{ background: '#14B87A', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E' }}
          >
            <CheckCircle className="h-10 w-10 text-white" strokeWidth={2.5} />
          </motion.div>
          <h2 className="mb-2 text-2xl font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--color-cp-text-primary)' }}>
            You’re on the list!
          </h2>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-cp-text-muted)' }}>
            {'We’ll email you when a seat opens for '}
            <span style={{ color: 'var(--color-cp-text-primary)', fontWeight: 800 }}>{event.title}</span>.
          </p>
          <p className="mt-3 text-xs font-semibold" style={{ color: 'var(--color-cp-text-faint)' }}>
            {'Seats are first come, first served — register quickly once the email lands.'}
          </p>
          <div className="mt-8">
            <Link to="/events" className="zine-btn uppercase">Browse all events</Link>
          </div>
        </motion.div>
      </div>
    )
  }

  if (!event) return null

  const orgName = event.organizations?.name || ''

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: 'var(--color-cp-bg-base)' }}>
      <div className="w-full max-w-md">
        <Link to="/events" className="mb-4 inline-flex items-center gap-2 text-sm font-bold transition-opacity hover:opacity-70" style={{ color: 'var(--color-cp-text-muted)' }}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back to all events
        </Link>

        <div className="relative">
          <span className="zine-sticker absolute -top-3 left-5 z-10" style={{ background: '#FF4D2E', color: '#fff', transform: 'rotate(-3deg)' }}>
            Seats filled
          </span>

          <div className="glass-strong p-8">
            <h1 className="text-2xl font-extrabold uppercase leading-tight" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--color-cp-text-primary)' }}>
              Seats filled — join the waiting list
            </h1>
            <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-cp-text-muted)' }}>
              All seats are gone for now. Drop your email and we’ll ping you the moment one frees up — one email, nothing more.
            </p>

            {/* Event summary (informative, from the same event row) */}
            <div className="mt-5 p-4 space-y-2" style={{ background: 'var(--color-cp-bg-surface)', border: '2px solid #14110E' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="zine-sticker" style={{ background: '#fff' }}>{orgName || 'Event'}</span>
                {seatRow && seatRow.seats_left !== null && (
                  <span className="text-xs font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--color-cp-text-faint)' }}>
                    {seatRow.confirmed_count}/{seatRow.capacity} seats taken
                  </span>
                )}
              </div>
              {event.date && (
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-cp-text-muted)' }}>
                  <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  <span>{new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
              )}
              {event.time && (
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-cp-text-muted)' }}>
                  <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  <span>{event.time.substring(0, 5)}</span>
                </div>
              )}
              {event.venue && (
                <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--color-cp-text-muted)' }}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  <span className="truncate">{event.venue}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleJoin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="waitlist-email" className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--color-cp-text-muted)' }}>
                  Your email
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (errors.email) setErrors((prev) => { const n = { ...prev }; delete n.email; return n })
                  }}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 text-sm font-bold outline-none"
                  style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E', color: '#14110E', fontFamily: 'Syne, sans-serif' }}
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs font-bold" style={{ color: '#E11D1D' }}>{errors.email}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="zine-btn zine-btn-accent w-full uppercase"
                style={{ opacity: submitting ? 0.6 : 1, fontFamily: 'Syne, sans-serif' }}
              >
                <UserPlus className="h-4 w-4" strokeWidth={2.5} />
                {submitting ? 'Joining…' : 'Join the waiting list'}
              </button>
            </form>

            {info && (
              <div className="mt-4 flex items-start gap-2 p-3 text-xs font-bold" style={{ background: '#FFD23F', border: '2px solid #14110E', color: '#14110E' }}>
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span>{info}</span>
              </div>
            )}
            {error && (
              <div className="mt-4 flex items-start gap-2 p-3 text-xs font-bold" style={{ background: '#FFE9E3', border: '2px solid #14110E', color: '#E11D1D' }}>
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span>{error}</span>
              </div>
            )}

            <p className="mt-5 text-xs font-semibold" style={{ color: 'var(--color-cp-text-faint)' }}>
              {'Questions about this event? Reach out to the club running it.'}
            </p>
            {/* WhatsApp contact fallback intentionally skipped — CampusEvent carries no whatsapp_group_url field. */}
          </div>
        </div>
      </div>
    </div>
  )
}
