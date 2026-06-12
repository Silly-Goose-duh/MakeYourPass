import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Calendar, Clock, MapPin, Users, Share2, Check,
  ArrowLeft, ExternalLink, Ticket, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { formatDate, formatTime, cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Event, TicketType } from '@/types'

export function EventPage() {
  const { eventSlug } = useParams()
  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  useEffect(() => {
    if (!eventSlug) return
    async function load() {
      setLoading(true)
      const { data: ev } = await supabase
        .from('events')
        .select('*')
        .eq('slug', eventSlug)
        .single()

      if (ev) {
        setEvent(ev as Event)
        // Load ticket types
        const { data: tickets } = await supabase
          .from('ticket_types')
          .select('*')
          .eq('event_id', ev.id)
          .eq('is_active', true)
          .order('sort_order')
        if (tickets) setTicketTypes(tickets as TicketType[])
      }
      setLoading(false)
    }
    load()
  }, [eventSlug])

  const activeTicket = ticketTypes.find(t => t.id === selectedTicket)

  const handlePurchase = async () => {
    setIsPurchasing(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsPurchasing(false)
    setPurchased(true)
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not found
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/5 mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-text-muted" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Event not found</h1>
          <p className="text-text-secondary mb-6">This event doesn&apos;t exist or has been removed</p>
          <Link to="/events">
            <Button variant="primary">Browse Events</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Purchased state
  if (purchased) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="h-20 w-20 rounded-2xl bg-green-500/20 mx-auto mb-6 flex items-center justify-center">
            <Check className="h-10 w-10 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Registration Successful!</h1>
          <p className="text-text-secondary mb-2">Your tickets have been confirmed.</p>
          <p className="text-text-muted text-sm mb-8">Check your email for the QR code tickets.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/">
              <Button variant="ghost">Back to Home</Button>
            </Link>
            <Button variant="primary" onClick={() => window.print()}>
              Download Tickets
            </Button>
          </div>
        </motion.div>
      </div>
    )
  }

  // External form mode
  if (event.use_external_form && event.form_link) {
    return (
      <div className="min-h-screen bg-background">
        <div className="relative bg-gradient-to-b from-yellow-400/10 via-background to-background pt-20 pb-16">
          <div className="mx-auto px-6 max-w-4xl">
            <Link to="/events" className="inline-flex items-center gap-2 text-text-secondary hover:text-yellow-400 transition-colors mb-6 text-sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>

            <div className="text-center mb-10">
              <Badge variant="pink" size="lg" className="mb-4">
                <ExternalLink className="h-4 w-4 mr-1" />
                External Registration
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                {event.title}
              </h1>
              {event.short_description && (
                <p className="text-text-secondary text-lg max-w-2xl mx-auto mb-6">
                  {event.short_description}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-text-secondary mb-8">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-yellow-400" />
                  {formatDate(event.start_date)}
                </span>
                {(event.venue_name || event.city) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-yellow-400" />
                    {event.city || event.venue_name}
                  </span>
                )}
              </div>

              <a href={event.form_link} target="_blank" rel="noopener noreferrer">
                <Button variant="gradient" size="xl" glow className="group">
                  Register via External Form
                  <ExternalLink className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </a>
            </div>

            {event.description && (
              <div className="max-w-3xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-4">About This Event</h2>
                <p className="text-text-secondary leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Normal ticketing mode
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-yellow-400/10 via-background to-background pt-20 pb-16">
        <div className="mx-auto px-6 max-w-5xl">
          <Link to="/events" className="inline-flex items-center gap-2 text-text-secondary hover:text-yellow-400 transition-colors mb-6 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Event Info */}
            <div className="flex-1">
              <Badge variant="yellow" size="sm" className="mb-3">
                {event.category.replace('_', ' ')}
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-[1.1]">
                {event.title}
              </h1>
              {event.short_description && (
                <p className="text-text-secondary text-lg mb-6">{event.short_description}</p>
              )}
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-text-secondary">
                  <Calendar className="h-5 w-5 text-yellow-400" />
                  <span>{formatDate(event.start_date)}</span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  <Clock className="h-5 w-5 text-yellow-400" />
                  <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                </div>
                {event.venue_name && (
                  <div className="flex items-center gap-3 text-text-secondary">
                    <MapPin className="h-5 w-5 text-yellow-400" />
                    <span>{event.venue_name}{event.city ? `, ${event.city}` : ''}</span>
                  </div>
                )}
                {event.max_attendees && (
                  <div className="flex items-center gap-3 text-text-secondary">
                    <Users className="h-5 w-5 text-yellow-400" />
                    <span>{event.max_attendees} max attendees</span>
                  </div>
                )}
              </div>

              <Button variant="secondary" size="sm">
                <Share2 className="h-4 w-4" />
                Share Event
              </Button>
            </div>

            {/* Ticket Selection Card */}
            <div className="w-full lg:w-[380px]">
              <Card variant="glass" padding="lg" className="sticky top-24">
                <CardContent>
                  <h3 className="text-lg font-bold text-white mb-4">Get Tickets</h3>

                  {ticketTypes.length > 0 ? (
                    <>
                      <div className="space-y-3 mb-6">
                        {ticketTypes.map((ticket) => (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => { setSelectedTicket(ticket.id); setShowCheckout(false) }}
                            className={cn(
                              'w-full p-4 rounded-xl border-2 text-left transition-all',
                              selectedTicket === ticket.id
                                ? 'border-yellow-400 bg-yellow-400/10'
                                : 'border-border hover:border-white/30 bg-surface'
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-white">{ticket.name}</span>
                              <span className={cn(
                                'font-bold',
                                ticket.price === 0 ? 'text-green-400' : 'text-yellow-400'
                              )}>
                                {ticket.price === 0 ? 'Free' : `₹${ticket.price}`}
                              </span>
                            </div>
                            {ticket.description && (
                              <p className="text-text-muted text-xs mb-1">{ticket.description}</p>
                            )}
                            <p className="text-text-muted text-xs">
                              {ticket.quantity - ticket.quantity_sold} of {ticket.quantity} left
                            </p>
                          </button>
                        ))}
                      </div>

                      {selectedTicket && !showCheckout && (
                        <Button variant="primary" size="lg" fullWidth onClick={() => setShowCheckout(true)}>
                          {activeTicket?.price === 0 ? 'Register Free' : 'Buy Ticket'}
                        </Button>
                      )}

                      {showCheckout && (
                        <div className="space-y-4">
                          <Input
                            label="Full Name"
                            placeholder="Your name"
                            value={buyerName}
                            onChange={(e) => setBuyerName(e.target.value)}
                            required
                          />
                          <Input
                            label="Email"
                            type="email"
                            placeholder="you@example.com"
                            value={buyerEmail}
                            onChange={(e) => setBuyerEmail(e.target.value)}
                            required
                          />
                          <div>
                            <label className="block text-sm font-medium text-text-primary mb-2">Quantity</label>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-10 h-10 rounded-xl border border-border text-white font-bold hover:bg-white/5"
                              >
                                -
                              </button>
                              <span className="text-xl font-bold text-white w-8 text-center">{quantity}</span>
                              <button
                                type="button"
                                onClick={() => setQuantity(quantity + 1)}
                                className="w-10 h-10 rounded-xl border border-border text-white font-bold hover:bg-white/5"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="p-4 bg-surface rounded-xl border border-border">
                            <div className="flex justify-between mb-2">
                              <span className="text-text-secondary">{activeTicket?.name} x {quantity}</span>
                              <span className="text-white font-medium">
                                {activeTicket?.price === 0 
                                  ? 'Free' 
                                  : `₹${(activeTicket?.price || 0) * quantity}`}
                              </span>
                            </div>
                            {activeTicket && activeTicket.price > 0 && (
                              <div className="flex justify-between text-sm">
                                <span className="text-text-muted">Processing fee (2%)</span>
                                <span className="text-text-muted">₹{Math.round(activeTicket.price * quantity * 0.02)}</span>
                              </div>
                            )}
                            <div className="flex justify-between mt-2 pt-2 border-t border-border">
                              <span className="font-semibold text-white">Total</span>
                              <span className="font-bold text-yellow-400">
                                {activeTicket?.price === 0 
                                  ? 'Free' 
                                  : `₹${(activeTicket?.price || 0) * quantity + Math.round((activeTicket?.price || 0) * quantity * 0.02)}`}
                              </span>
                            </div>
                          </div>

                          <Button 
                            variant="primary" 
                            size="lg" 
                            fullWidth 
                            onClick={handlePurchase}
                            loading={isPurchasing}
                            disabled={!buyerName || !buyerEmail}
                          >
                            {isPurchasing ? 'Processing...' : activeTicket?.price === 0 ? 'Complete Registration' : `Pay ₹${(activeTicket?.price || 0) * quantity + Math.round((activeTicket?.price || 0) * quantity * 0.02)}`}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Ticket className="h-8 w-8 text-text-muted mx-auto mb-3" />
                      <p className="text-text-secondary">No tickets available yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Full description */}
      {event.description && (
        <div className="mx-auto px-6 max-w-5xl pb-20">
          <h2 className="text-2xl font-bold text-white mb-4">About This Event</h2>
          <p className="text-text-secondary leading-relaxed whitespace-pre-line">{event.description}</p>
        </div>
      )}
    </div>
  )
}
