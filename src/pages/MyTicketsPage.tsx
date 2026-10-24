import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Calendar, MapPin, Ticket } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { listMyEventRegistrations } from '@/lib/supabase'
import { TicketLink } from '@/components/event/TicketLink'
import { Button } from '@/components/ui/Button'
import type { MyEventRegistration } from '@/types'

const STATUS_STYLE: Record<string, { label: string; background: string; color: string }> = {
  confirmed: { label: 'Confirmed', background: '#E8F8F0', color: '#0A7A4F' },
  pending: { label: 'Payment pending', background: '#FFF6D6', color: '#8A5A00' },
  waitlisted: { label: 'Waiting list', background: '#E8EEFF', color: '#2D5BFF' },
  cancelled: { label: 'Cancelled', background: '#FFE9E3', color: '#FF4D2E' },
}

function formatDate(date: string | null, time: string | null) {
  if (!date) return 'Date TBD'
  const label = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
  return time ? `${label} · ${time.slice(0, 5)}` : label
}

export function MyTicketsPage() {
  const { user, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<MyEventRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) return
    let cancelled = false
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true)
    setError('')
    /* eslint-enable react-hooks/set-state-in-effect */
    listMyEventRegistrations()
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) {
          setError(loadError.message || 'Could not load your tickets.')
          return
        }
        setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your tickets.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user, authLoading])

  if (authLoading || (user && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4EFE1' }}>
        <div className="h-8 w-8 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent('/account/tickets')}`} replace />
  }

  const active = rows.filter((row) => row.status !== 'cancelled')
  const past = rows.filter((row) => row.status === 'cancelled')

  return (
    <div className="min-h-screen px-4 sm:px-6 py-12" style={{ background: '#F4EFE1' }}>
      <div className="max-w-3xl mx-auto">
        <Link to="/events" className="inline-flex items-center gap-2 mb-6 text-sm font-bold hover:opacity-70" style={{ color: '#14110E' }}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back to events
        </Link>

        <div className="mb-8">
          <h1 className="text-4xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            My tickets
          </h1>
          <p className="text-sm font-semibold mt-2" style={{ color: '#4A4640' }}>
            Every event you registered for with {user.email || 'this account'}.
          </p>
        </div>

        {error && (
          <div className="p-4 mb-6 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
            {error}
          </div>
        )}

        {!error && rows.length === 0 && (
          <div className="p-8 sm:p-10 text-center" style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}>
            <div className="inline-flex h-14 w-14 items-center justify-center mb-5" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
              <Ticket className="h-6 w-6" strokeWidth={2.5} style={{ color: '#14110E' }} />
            </div>
            <h2 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
              No tickets yet
            </h2>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
              Register for an event and your ticket will show up here.
            </p>
            <Link to="/events">
              <Button variant="primary" size="lg">Browse events</Button>
            </Link>
          </div>
        )}

        {active.length > 0 && (
          <div className="space-y-4 mb-10">
            {active.map((row, index) => (
              <TicketCard key={row.registration_id} row={row} index={index} />
            ))}
          </div>
        )}

        {past.length > 0 && (
          <div>
            <h2 className="text-lg font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#7A756B' }}>
              Cancelled registrations
            </h2>
            <div className="space-y-4">
              {past.map((row, index) => (
                <TicketCard key={row.registration_id} row={row} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TicketCard({ row, index }: { row: MyEventRegistration; index: number }) {
  const style = STATUS_STYLE[row.status] || STATUS_STYLE.pending
  const refund = row.status === 'cancelled' && row.refund_status === 'pending'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="p-5 sm:p-6"
      style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '5px 5px 0 #14110E' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-xl font-extrabold leading-tight" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            {row.event_title}
          </h3>
          {row.org_name && (
            <p className="text-xs font-bold mt-1" style={{ color: '#7A756B' }}>{row.org_name}</p>
          )}
        </div>
        <span className="px-2.5 py-1 text-xs font-extrabold uppercase" style={{ background: style.background, color: style.color, border: '2px solid #14110E' }}>
          {style.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold mb-4" style={{ color: '#4A4640' }}>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-4 w-4" strokeWidth={2.5} />
          {formatDate(row.event_date, row.event_time)}
        </span>
        {row.event_venue && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4" strokeWidth={2.5} />
            {row.event_venue}
          </span>
        )}
      </div>

      {row.unique_code && (
        <p className="text-sm font-bold mb-4" style={{ color: '#7A756B' }}>
          Code: <span style={{ color: '#14110E' }}>{row.unique_code}</span>
        </p>
      )}

      {refund && (
        <p className="text-xs font-bold mb-4 px-3 py-2" style={{ background: '#FFF6D6', border: '2px solid #14110E', color: '#8A5A00' }}>
          Refund pending — the club will contact you about your payment.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {row.status === 'confirmed' && (
          <TicketLink registrationId={row.registration_id} ticketUrl={row.ticket_url} />
        )}
        {row.status === 'pending' && (
          <Link to={`/event/${row.event_slug}/register`}>
            <Button size="sm" variant="primary">Complete payment</Button>
          </Link>
        )}
        {row.status === 'waitlisted' && (
          <Link to={`/waiting-list?event=${encodeURIComponent(row.event_slug)}`}>
            <Button size="sm" variant="secondary">Waitlist details</Button>
          </Link>
        )}
        <Link to={`/event/${row.event_slug}`}>
          <Button size="sm" variant="ghost">Event page</Button>
        </Link>
      </div>
    </motion.div>
  )
}

export default MyTicketsPage
