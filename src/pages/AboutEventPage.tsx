import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar, Clock, IndianRupee, MapPin, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getEventBySlug, getSeatStatus, getMyEventRegistration, getMyCancellationRequest, requestEventCancellation, type SeatStatus } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isPast } from '@/components/event/eventUtils'
import type { CampusEvent, Organization, EventCancellationRequest, EventResponse } from '@/types'

/**
 * AboutEventPage — the STOP page between the events list and the form.
 *
 *   /event/:eventSlug             → this page (details + Register now)
 *   /event/:eventSlug/register    → PublicEventForm (the real pipeline)
 *   /waiting-list?event=:slug     → WaitlistPage (seats filled)
 *
 * Clicking a card on /events lands here. The page shows the event facts
 * (poster, when/where, price, club, description) plus a LIVE seats-left rollup
 * from event_seat_status. A live count guards both CTAs: full events route to
 * the waitlist page, past events disable registration entirely.
 */

type LoadedEvent = CampusEvent & { organizations: Organization }

export default function AboutEventPage() {
  const { eventSlug } = useParams<{ eventSlug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [event, setEvent] = useState<LoadedEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  const [seat, setSeat] = useState<SeatStatus | null>(null)
  const [registration, setRegistration] = useState<EventResponse | null>(null)
  const [cancellation, setCancellation] = useState<EventCancellationRequest | null>(null)
  const [cancellationBusy, setCancellationBusy] = useState(false)
  const [cancellationMessage, setCancellationMessage] = useState('')

  const slug = eventSlug ?? ''

  // ─── Load the event by slug (same fetch pattern as the form/waitlist) ───
  useEffect(() => {
    let cancelled = false
    async function loadEvent() {
      if (!slug) {
        setNotFound(true)
        setLoading(false)
        return
      }
      try {
        const { data, error: evErr } = await getEventBySlug(slug)
        if (cancelled) return
        if (evErr || !data) {
          if (evErr?.message?.includes('RLS_RECURSION')) {
            setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
            return
          }
          setNotFound(true)
          return
        }
        setEvent(data as LoadedEvent)
        if (user) {
          const { data: mine } = await getMyEventRegistration(data.id)
          if (!cancelled && mine) {
            setRegistration(mine)
            const { data: request } = await getMyCancellationRequest(mine.id)
            if (!cancelled && request) setCancellation(request)
          }
        } else {
          setRegistration(null)
          setCancellation(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load event')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadEvent()
    return () => { cancelled = true }
  }, [slug, user])

  // Live seats: initial rollup + re-check when the tab becomes visible again.
  useEffect(() => {
    if (!event?.id) return
    let cancelled = false
    const check = async () => {
      try {
        const { data } = await getSeatStatus(event.id)
        if (!cancelled && data) setSeat(data)
      } catch { /* view unavailable — heuristic below applies */ }
    }
    void check()
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [event?.id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Loading event…</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-strong rounded-2xl p-10 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-[#14110E] mb-3">Event not found</h2>
          <p className="text-text-secondary mb-6">This event doesn't exist or has been removed.</p>
          <Link to="/events"><Button variant="primary" size="lg">Back to Events</Button></Link>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass-strong rounded-2xl p-10 max-w-md w-full text-center">
          <p className="text-text-secondary mb-6">{error || 'This event could not be loaded.'}</p>
          <Link to="/events"><Button variant="primary" size="lg">Back to Events</Button></Link>
        </div>
      </div>
    )
  }

  const org = event.organizations
  const isFree = event.payment_type !== 'paid' || !(Number(event.price || 0) > 0)
  const past = isPast(event)
  const soldOut = !!seat && seat.seats_left !== null && seat.seats_left <= 0
  const seatsText = seat
    ? seat.seats_left === null
      ? 'Open' // capacity unset — not enforced
      : soldOut ? 'Full' : `${seat.seats_left} seat${seat.seats_left === 1 ? '' : 's'} left`
    : ''

  const goRegister = () => navigate(`/event/${event.slug}/register`)
  const goWaitlist = () => navigate(`/waiting-list?event=${event.slug}`)
  const requestCancel = async () => {
    if (!registration) return
    setCancellationBusy(true)
    setCancellationMessage('')
    const { error: requestError } = await requestEventCancellation(registration.id)
    if (requestError) {
      setCancellationMessage(requestError.message || 'Could not submit cancellation request')
    } else {
      setCancellation({
        id: 'pending', registration_id: registration.id, event_id: event.id, user_id: user?.id || '',
        reason: '', status: 'requested', club_note: '', reviewed_by: null,
        requested_at: new Date().toISOString(), reviewed_at: null,
      })
      setCancellationMessage('Cancellation request sent to the club. Your ticket remains active until they review it.')
    }
    setCancellationBusy(false)
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto">
        <Link to="/events" className="inline-flex items-center gap-2 text-text-secondary hover:text-primary-hover transition-colors mb-8 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-strong rounded-2xl overflow-hidden border-2 border-[#14110E] shadow-[6px_6px_0_#14110E]"
        >
          {/* Poster strip */}
          {event.poster_url ? (
            <img
              src={event.poster_url}
              alt={`${event.title} poster`}
              className="w-full max-h-[380px] object-cover border-b-2 border-[#14110E]"
            />
          ) : (
            <div className="h-40 bg-gradient-to-br from-primary/30 via-secondary/20 to-primary/10 border-b-2 border-[#14110E]" />
          )}

          <div className="p-8 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <h1 className="text-3xl font-bold text-[#14110E] mb-2">{event.title}</h1>
                {org && (
                  <Link
                    to={`/${org.slug}`}
                    className="inline-flex items-center gap-2 text-text-secondary hover:text-primary-hover transition-colors text-sm"
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt={org.name} className="h-6 w-6 rounded-md object-cover border border-border" />
                    ) : null}
                    Hosted by <strong className="text-text-primary">{org.name}</strong>
                  </Link>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="zine-sticker" style={{ background: '#FFF6D6' }}>
                  {isFree ? 'FREE entry' : <><IndianRupee className="h-3.5 w-3.5 inline -mt-0.5" />{Number(event.price).toLocaleString('en-IN')}</>}
                </span>
                {seatsText && !past && (
                  <span
                    className="zine-sticker"
                    style={{ background: soldOut ? '#FFE1D6' : '#E3F9EE' }}
                  >
                    {seatsText === 'Full' ? 'SEATS FILLED' : <><Users className="h-3.5 w-3.5 inline -mt-0.5" />{seatsText}</>}
                  </span>
                )}
                {past && <span className="zine-sticker" style={{ background: '#EFEAE0' }}>Event ended</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
              <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-2.5">
                <Calendar className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="text-sm font-semibold text-text-primary">{event.date || 'Date TBD'}</span>
              </div>
              <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-2.5">
                <Clock className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="text-sm font-semibold text-text-primary">{event.time ? String(event.time).slice(0, 5) : 'Time TBD'}</span>
              </div>
              <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="text-sm font-semibold text-text-primary truncate">{event.venue || 'Venue TBD'}</span>
              </div>
            </div>

            {event.description && (
              <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-line mb-8">
                {event.description}
              </p>
            )}

            <div className="border-t-2 border-dashed border-border pt-8">
              {registration ? (
                <div className="space-y-4">
                  <div className="p-4 text-center" style={{ background: registration.status === 'cancelled' ? '#FFE9E3' : '#E8F8F0', border: '2px solid #14110E' }}>
                    <p className="font-extrabold" style={{ fontFamily: 'Syne, sans-serif' }}>
                      {registration.status === 'cancelled' ? 'This registration was cancelled' : registration.status === 'waitlisted' ? 'You are on the waiting list' : registration.status === 'pending' ? 'Payment is still pending' : 'You are already registered'}
                    </p>
                    <p className="text-sm font-semibold mt-1" style={{ color: '#4A4640' }}>
                      {registration.unique_code ? `Registration code: ${registration.unique_code}` : 'Your registration is saved to your account.'}
                    </p>
                  </div>
                  {registration.status !== 'cancelled' && cancellation?.status === 'requested' && (
                    <p className="text-sm font-bold text-center" style={{ color: '#7A756B' }}>
                      Cancellation request pending — the club will review it.
                    </p>
                  )}
                  {registration.status !== 'cancelled' && !cancellation && (
                    <Button variant="danger" size="lg" fullWidth onClick={() => void requestCancel()} loading={cancellationBusy}>
                      Request cancellation
                    </Button>
                  )}
                  {cancellationMessage && <p className="text-sm font-bold text-center" style={{ color: cancellationMessage.startsWith('Cancellation request sent') ? '#0A7A4F' : '#FF4D2E' }}>{cancellationMessage}</p>}
                </div>
              ) : past ? (
                <div className="text-center">
                  <p className="text-text-muted text-sm mb-4">This event has already happened.</p>
                  <Link to="/events"><Button variant="outline" size="lg">See other events</Button></Link>
                </div>
              ) : soldOut ? (
                <div className="text-center">
                  <p className="text-text-secondary text-sm mb-4">
                    All seats are taken. Join the waiting list — you'll get an email the moment a seat opens up.
                  </p>
                  <Button variant="primary" size="lg" onClick={goWaitlist}>
                    Add me to the waiting list
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-text-muted text-sm mb-4">
                    {seatsText ? `${seatsText} — register now to lock yours in.` : 'Registration is open.'}
                  </p>
                  <Button variant="primary" size="lg" onClick={goRegister}>
                    Register now
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
