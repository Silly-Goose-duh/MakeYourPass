import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, X, Calendar, MapPin, Ticket as TicketIcon, ArrowLeft, User, Shield } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Ticket, Event } from '@/types'

export function ScanPage() {
  const { qrCode } = useParams()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkInError, setCheckInError] = useState('')

  async function loadTicket() {
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('qr_code', qrCode)
      .single()

    if (!data) {
      setError('Invalid or expired ticket')
      setLoading(false)
      return
    }

    setTicket(data as Ticket)

    // Load event info
    const { data: ev } = await supabase
      .from('events')
      .select('title, start_date, start_time, venue_name, city, slug')
      .eq('id', data.event_id)
      .single()

    if (ev) setEvent(ev as Event)
    setLoading(false)

    // Already checked in?
    if (data.status === 'used') {
      setCheckedIn(true)
    }
  }

  useEffect(() => {
    if (!qrCode) { setError('No QR code provided'); setLoading(false); return }
    loadTicket()
  }, [qrCode])

  async function handleCheckIn() {
    if (!ticket) return
    setCheckingIn(true)
    setCheckInError('')

    const { data: { user } } = await supabase.auth.getUser()

    const { error: checkInError } = await supabase
      .from('check_ins')
      .insert({
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        checked_in_by: user?.id || '00000000-0000-0000-0000-000000000000',
        method: 'scan',
      })

    if (checkInError) {
      setCheckInError(checkInError.message)
      setCheckingIn(false)
      return
    }

    // Update ticket status
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        status: 'used',
        checked_in_at: new Date().toISOString(),
        checked_in_by: user?.id || null,
      })
      .eq('id', ticket.id)

    if (updateError) {
      setCheckInError(updateError.message)
      setCheckingIn(false)
      return
    }

    setCheckedIn(true)
    setCheckingIn(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-yellow-400 transition-colors mb-6 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to MakeYourPass
        </Link>

        {error ? (
          <Card variant="glass" padding="lg">
            <CardContent className="text-center py-8">
              <div className="h-16 w-16 rounded-2xl bg-red-500/20 mx-auto mb-4 flex items-center justify-center">
                <X className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Ticket Not Found</h2>
              <p className="text-text-secondary text-sm mb-6">{error}</p>
              <Link to="/">
                <Button variant="ghost">Go Home</Button>
              </Link>
            </CardContent>
          </Card>
        ) : checkedIn ? (
          <Card variant="glass-yellow" glow="yellow" padding="lg">
            <CardContent className="text-center py-8">
              <div className="h-16 w-16 rounded-2xl bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
                <Shield className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Already Checked In ✓</h2>
              <p className="text-text-secondary text-sm mb-6">
                This ticket was used at {ticket?.checked_in_at ? formatTime(ticket.checked_in_at.split('T')[1]?.slice(0, 5)) : 'a previous time'}
              </p>
              {event && (
                <div className="text-left bg-white/[0.04] rounded-xl p-4 mb-6">
                  <p className="text-white font-semibold mb-2">{event.title}</p>
                  <p className="text-text-muted text-xs">{event.venue_name || event.city}</p>
                </div>
              )}
              <Link to="/">
                <Button variant="ghost">Done</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card variant="glass" padding="lg">
            <CardContent className="text-center">
              <div className="h-16 w-16 rounded-2xl bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
                <TicketIcon className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Valid Ticket</h2>
              <p className="text-text-secondary text-sm mb-6">
                Scan to check in this attendee
              </p>

              {event && (
                <div className="text-left bg-white/[0.04] rounded-xl p-4 mb-6 space-y-2">
                  <p className="text-white font-semibold">{event.title}</p>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{event.start_date && formatDate(event.start_date)}</span>
                  </div>
                  {event.venue_name && (
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{event.venue_name}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="text-left bg-white/[0.04] rounded-xl p-4 mb-6 space-y-1">
                <p className="text-xs text-text-muted">Ticket Details</p>
                <p className="text-white text-sm flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-yellow-400" />
                  {ticket?.attendee_name || 'Anonymous'}
                </p>
                {ticket?.attendee_email && (
                  <p className="text-text-secondary text-sm">{ticket.attendee_email}</p>
                )}
                <Badge variant="success" size="sm" className="mt-2">
                  <Check className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              </div>

              <Button
                variant="gradient"
                size="lg"
                glow
                fullWidth
                onClick={handleCheckIn}
                loading={checkingIn}
                disabled={checkingIn}
              >
                <Check className="h-5 w-5" />
                {checkingIn ? 'Checking in...' : 'Confirm Check-In'}
              </Button>

              {checkInError && (
                <p className="text-red-400 text-xs mt-3">{checkInError}</p>
              )}
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  )
}
