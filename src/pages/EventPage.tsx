import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'

import {
  Calendar, Clock, MapPin, Users, Share2, Check,
  ArrowLeft, ExternalLink, Ticket as TicketIcon, Sparkles, Download
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatTime, cn } from '@/lib/utils'
import { supabase, createOrder, createTickets, updateTicketTypeSales } from '@/lib/supabase'
import { sendConfirmationEmail } from '@/lib/email'
import { QRCodeSVG } from 'qrcode.react'
import type { Event, TicketType, Ticket } from '@/types'

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || ''

/** Load Razorpay checkout script dynamically once */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export function EventPage() {
  const { eventSlug } = useParams()
  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')
  const [purchasedTickets, setPurchasedTickets] = useState<Ticket[]>([])
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

  // Overall ticket capacity summary
  const totalTickets = ticketTypes.reduce((sum, t) => sum + t.quantity, 0)
  const totalSold = ticketTypes.reduce((sum, t) => sum + t.quantity_sold, 0)
  const totalRemaining = totalTickets - totalSold
  const sellOutPercent = totalTickets > 0 ? Math.min(100, (totalSold / totalTickets) * 100) : 0

  const handlePurchase = async () => {
    if (!event || !activeTicket) return
    setIsPurchasing(true)
    setPurchaseError('')

    try {
      // 1. Calculate totals
      const itemTotal = activeTicket.price * quantity
      const processingFee = Math.round(itemTotal * 0.02)
      const totalAmount = itemTotal + processingFee
      
      // 2. Create the order
      const { data: order, error: orderError } = await createOrder({
        event_id: event.id,
        ticket_type_id: activeTicket.id,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone || undefined,
        quantity,
        total_amount: totalAmount,
        payment_method: activeTicket.price === 0 ? 'free' : 'razorpay',
        status: activeTicket.price === 0 ? 'confirmed' : 'pending',
      })

      if (orderError) throw new Error(orderError.message)
      if (!order) throw new Error('Failed to create order')

      // For free tickets: direct flow (create tickets, show success)
      if (activeTicket.price === 0) {
        await completePurchase(order, activeTicket)
        return
      }

      // For paid tickets: Razorpay payment flow
      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) {
        throw new Error('Failed to load payment gateway. Please try again.')
      }

      const razorpayRes = await fetch('/api/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-order',
          amount: totalAmount, // already in paise
          currency: 'INR',
          receipt: `order_${order.id}`,
        }),
      })

      if (!razorpayRes.ok) {
        const errBody = await razorpayRes.json().catch(() => ({}))
        throw new Error(errBody.error || 'Failed to create payment order')
      }

      const razorpayOrder = await razorpayRes.json()
      
      const options = {
        key: RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: event.title,
        description: `${activeTicket.name} × ${quantity}`,
        order_id: razorpayOrder.id,
        prefill: {
          name: buyerName,
          email: buyerEmail,
          contact: buyerPhone,
        },
        modal: {
          ondismiss: () => {
            setIsPurchasing(false)
          },
        },
        handler: async function (response: {
          razorpay_payment_id: string
          razorpay_order_id: string
          razorpay_signature: string
        }) {
          try {
            // Verify payment signature
            const verifyRes = await fetch('/api/razorpay', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'verify-payment',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            })

            const verifyResult = await verifyRes.json()
            if (!verifyResult.verified) {
              throw new Error('Payment verification failed. Please contact support.')
            }

            // Update order with payment ID
            await supabase
              .from('orders')
              .update({
                status: 'confirmed',
                payment_id: response.razorpay_payment_id,
              })
              .eq('id', order.id)

            // Create tickets
            await completePurchase(order, activeTicket)

          } catch (err: unknown) {
            setPurchaseError(err instanceof Error ? err.message : 'Payment confirmation failed.')
            setIsPurchasing(false)
          }
        },
      }

      const rzp = new (window as unknown as { Razorpay: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay(options)
      rzp.open()
      
    } catch (err: unknown) {
      setPurchaseError(err instanceof Error ? err.message : 'Purchase failed. Please try again.')
      setIsPurchasing(false)
    }
  }

  /** Complete purchase flow — create tickets, update sales, send email, show success */
  async function completePurchase(order: { id: string }, ticketType: TicketType) {
    try {
      // Generate tickets with QR codes
      const ticketData = []
      for (let i = 0; i < quantity; i++) {
        const ticketId = crypto.randomUUID()
        const qrCode = ticketId
        const qrCodeUrl = `${window.location.origin}/scan/${qrCode}`
        
        ticketData.push({
          order_id: order.id,
          event_id: event!.id,
          ticket_type_id: ticketType.id,
          qr_code: qrCode,
          qr_code_url: qrCodeUrl,
          attendee_name: quantity === 1 ? buyerName : undefined,
          attendee_email: quantity === 1 ? buyerEmail : undefined,
        })
      }

      const { data: tickets, error: ticketsError } = await createTickets(ticketData)
      if (ticketsError) throw new Error(ticketsError.message)

      // Update ticket type sales count
      const newSold = (ticketType.quantity_sold || 0) + quantity
      await updateTicketTypeSales(ticketType.id, newSold)

      // Send confirmation email (fire & forget — don't block on failure)
      const qrCodeUrls = tickets!.map((t) =>
        `${window.location.origin}/scan/${t.qr_code}`
      )
      sendConfirmationEmail({
        to_name: buyerName,
        to_email: buyerEmail,
        event_title: event!.title,
        event_date: formatDate(event!.start_date),
        event_time: `${formatTime(event!.start_time)} - ${formatTime(event!.end_time)}`,
        event_venue: [event!.venue_name, event!.city].filter(Boolean).join(', '),
        ticket_type: ticketType.name,
        quantity,
        qr_code_url: qrCodeUrls[0] || '',
        event_url: `${window.location.origin}/event/${event!.slug}`,
      })

      // Show success modal
      setPurchasedTickets(tickets!)
      setIsPurchasing(false)
    } catch (err: unknown) {
      setPurchaseError(err instanceof Error ? err.message : 'Failed to create tickets.')
      setIsPurchasing(false)
    }
  }

  // ===== SUCCESS MODAL =====
  // (renders on top of the event page instead of replacing it)
  const successModalOpen = purchasedTickets.length > 0
  const handleCloseSuccess = useCallback(() => {
    setPurchasedTickets([])
    setSelectedTicket(null)
    setShowCheckout(false)
    setBuyerName('')
    setBuyerEmail('')
    setBuyerPhone('')
    setQuantity(1)
  }, [])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Not found
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-surface mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-text-muted" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Event not found</h1>
          <p className="text-text-secondary mb-6">This event doesn&apos;t exist or has been removed</p>
          <Link to="/events">
            <Button variant="primary">Browse Events</Button>
          </Link>
        </div>
      </div>
    )
  }

  // External form mode
  if (event.use_external_form && event.form_link) {
    return (
      <div className="min-h-screen bg-background">
          <div className="relative bg-gradient-to-b from-primary/10 via-background to-background pt-20 pb-16">
          <div className="mx-auto px-6 sm:px-10 max-w-6xl">
            <Link to="/events" className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors mb-6 text-sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Link>
            <div className="text-center mb-10">
              <Badge variant="accent" size="lg" className="mb-4">
                <ExternalLink className="h-4 w-4 mr-1" />
                External Registration
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text-primary mb-4">
                {event.title}
              </h1>
              {event.short_description && (
                <p className="text-text-secondary text-lg max-w-2xl mx-auto mb-6">
                  {event.short_description}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-text-secondary mb-8">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-primary" />
                  {formatDate(event.start_date)}
                </span>
                {(event.venue_name || event.city) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
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
                <h2 className="text-2xl font-bold text-text-primary mb-4">About This Event</h2>
                <p className="text-text-secondary leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== NORMAL TICKETING MODE =====
  return (
    <div className="min-h-screen bg-background">
      <div className="relative bg-gradient-to-b from-primary/10 via-background to-background pt-20 pb-16">
        <div className="mx-auto px-6 sm:px-10 max-w-7xl">
          <Link to="/events" className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors mb-6 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Event Info */}
            <div className="flex-1">
              <Badge variant="primary" size="sm" className="mb-3">
                {event.category.replace('_', ' ')}
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text-primary mb-4 leading-[1.1]">
                {event.title}
              </h1>
              {event.short_description && (
                <p className="text-text-secondary text-lg mb-6">{event.short_description}</p>
              )}
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-text-secondary">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span>{formatDate(event.start_date)}</span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  <Clock className="h-5 w-5 text-primary" />
                  <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                </div>
                {event.venue_name && (
                  <div className="flex items-center gap-3 text-text-secondary">
                    <MapPin className="h-5 w-5 text-primary" />
                    <span>{event.venue_name}{event.city ? `, ${event.city}` : ''}</span>
                  </div>
                )}
                {event.max_attendees && (
                  <div className="flex items-center gap-3 text-text-secondary">
                    <Users className="h-5 w-5 text-primary" />
                    <span>{event.max_attendees} max attendees</span>
                  </div>
                )}
              </div>

              {/* Overall ticket availability */}
              {totalTickets > 0 && (
                <div className="mb-6 p-4 rounded-xl bg-surface border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      <TicketIcon className="h-4 w-4 text-primary" />
                      <span className="text-text-secondary">Ticket Availability</span>
                    </div>
                    <span className={cn(
                      'text-sm font-semibold',
                      totalRemaining === 0
                        ? 'text-red-400'
                        : totalRemaining / totalTickets < 0.25
                          ? 'text-secondary'
                          : 'text-success'
                    )}>
                      {totalRemaining === 0
                        ? 'Sold Out'
                        : `${totalRemaining} of ${totalTickets} left`}
                    </span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        totalRemaining === 0
                          ? 'bg-red-500'
                          : totalRemaining / totalTickets < 0.25
                            ? 'bg-primary'
                            : 'bg-gradient-to-r from-primary to-success'
                      )}
                      style={{ width: `${sellOutPercent}%` }}
                    />
                  </div>
                  <p className="text-text-muted text-xs mt-2">
                    {totalSold} of {totalTickets} tickets booked
                    {totalRemaining > 0 && ` — ${totalRemaining} remaining`}
                  </p>
                </div>
              )}

              <Button variant="secondary" size="sm">
                <Share2 className="h-4 w-4" />
                Share Event
              </Button>
            </div>

            {/* Ticket Selection Card */}
            <div className="w-full lg:w-[380px]">
              <Card variant="glass" padding="lg" className="sticky top-24">
                <CardContent>
                  <h3 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                    <TicketIcon className="h-5 w-5 text-primary" />
                    Get Tickets
                  </h3>

                  {/* Overall availability bar in card */}
                  {totalTickets > 0 && (
                    <div className="mb-5 p-3 rounded-xl bg-surface border border-border">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-text-muted">Overall availability</span>
                        <span className={cn(
                          'font-semibold',
                          totalRemaining === 0 ? 'text-red-400' : 'text-text-secondary'
                        )}>
                          {totalRemaining === 0 ? 'Sold Out' : `${totalRemaining} left`}
                        </span>
                      </div>
                      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            totalRemaining === 0 ? 'bg-red-500' : 'bg-gradient-to-r from-primary to-accent-teal'
                          )}
                          style={{ width: `${sellOutPercent}%` }}
                        />
                      </div>
                      <p className="text-text-muted text-[10px] mt-1.5">
                        {totalSold} / {totalTickets} booked
                      </p>
                    </div>
                  )}

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
                                ? 'border-primary bg-primary-muted'
                                : 'border-border hover:border-white/30 bg-surface'
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-text-primary">{ticket.name}</span>
                              <span className={cn(
                                'font-bold',
                                ticket.price === 0 ? 'text-success' : 'text-secondary'
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
                          <Input
                            label="Phone (optional)"
                            type="tel"
                            placeholder="+91 98765 43210"
                            value={buyerPhone}
                            onChange={(e) => setBuyerPhone(e.target.value)}
                          />
                          <div>
                            <label className="block text-sm font-medium text-text-primary mb-2">Quantity</label>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-10 h-10 rounded-xl border border-border text-text-primary font-bold hover:bg-surface"
                              >
                                -
                              </button>
                              <span className="text-xl font-bold text-text-primary w-8 text-center">{quantity}</span>
                              <button
                                type="button"
                                onClick={() => setQuantity(Math.min(quantity + 1, activeTicket?.max_per_order || 10))}
                                className="w-10 h-10 rounded-xl border border-border text-text-primary font-bold hover:bg-surface"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="p-4 bg-surface rounded-xl border border-border">
                            <div className="flex justify-between mb-2">
                              <span className="text-text-secondary">{activeTicket?.name} x {quantity}</span>
                              <span className="text-text-primary font-medium">
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
                              <span className="font-semibold text-text-primary">Total</span>
                              <span className="font-bold text-secondary">
                                {activeTicket?.price === 0 
                                  ? 'Free' 
                                  : `₹${(activeTicket?.price || 0) * quantity + Math.round((activeTicket?.price || 0) * quantity * 0.02)}`}
                              </span>
                            </div>
                          </div>

                          {activeTicket && activeTicket.price > 0 && (
                            <div className="p-3 bg-primary-muted border border-primary/20 rounded-xl text-xs text-primary/80">
                              ⚡ Razorpay checkout coming soon. For now, registration is free-flowing.
                            </div>
                          )}

                          {purchaseError && (
                            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                              {purchaseError}
                            </div>
                          )}

                          <Button 
                            variant="primary" 
                            size="lg" 
                            fullWidth 
                            onClick={handlePurchase}
                            loading={isPurchasing}
                            disabled={!buyerName || !buyerEmail || isPurchasing}
                          >
                            {isPurchasing && activeTicket?.price && activeTicket.price > 0
                              ? 'Opening Payment...'
                              : isPurchasing
                              ? 'Processing...'
                              : activeTicket?.price === 0
                              ? 'Complete Registration'
                              : `Pay ₹${(activeTicket?.price || 0) * quantity + Math.round((activeTicket?.price || 0) * quantity * 0.02)}`}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <TicketIcon className="h-8 w-8 text-text-muted mx-auto mb-3" />
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
        <div className="mx-auto px-6 sm:px-10 max-w-7xl pb-20">
          <h2 className="text-2xl font-bold text-text-primary mb-4">About This Event</h2>
          <p className="text-text-secondary leading-relaxed whitespace-pre-line">{event.description}</p>
        </div>
      )}

      {/* Success Modal */}
      <Modal isOpen={successModalOpen} onClose={handleCloseSuccess} size="lg" showCloseButton>
        <div className="text-center py-4">
          <div className="h-16 w-16 rounded-2xl bg-success/20 mx-auto mb-4 flex items-center justify-center">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Registration Successful! 🎉
          </h2>
          <p className="text-text-secondary text-sm mb-1">
            {purchasedTickets.length} ticket{purchasedTickets.length > 1 ? 's' : ''} confirmed for <span className="text-text-primary font-semibold">{event?.title}</span>
          </p>
          <p className="text-text-muted text-xs mb-6">
            Show the QR code at the entrance for check-in.
          </p>

          {/* QR Code Tickets */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {purchasedTickets.map((ticket: Ticket, idx: number) => (
              <div key={ticket.id} className="p-4 rounded-xl bg-primary-muted border border-primary/20">
                <div className="flex items-center gap-4">
                  <div className="bg-surface p-2 rounded-xl shrink-0">
                    <QRCodeSVG
                      value={ticket.qr_code_url}
                      size={64}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="M"
                    />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <Badge variant="primary" size="sm" className="mb-1">Ticket #{idx + 1}</Badge>
                    <p className="text-text-primary font-semibold text-sm truncate">{event?.title}</p>
                    <p className="text-text-muted text-xs">{activeTicket?.name}</p>
                    <p className="text-text-muted text-[10px]">
                      {event?.start_date && formatDate(event.start_date)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            {event && (
              <Link to={`/event/${event.slug}`} onClick={handleCloseSuccess}>
                <Button variant="ghost" size="sm">Done</Button>
              </Link>
            )}
            <Button variant="primary" size="sm" onClick={() => window.print()}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
