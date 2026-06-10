import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Calendar, Clock, MapPin, Users, Share2, Check,
  ChevronDown, Sparkles, Ticket, ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { formatDate, formatDateTime, cn } from '@/lib/utils'

const dummyEvent = {
  id: '1',
  title: 'Tech Conference 2026',
  description: 'Join us for the biggest tech conference of the year! Network with industry leaders, attend workshops, and discover the latest in AI, Web3, and Cloud Computing.',
  shortDescription: 'The biggest tech conference of the year',
  date: '2026-08-15',
  time: '09:00 AM - 06:00 PM',
  venue: 'Bangalore International Centre',
  address: 'No. 4, 2nd Cross, Domlur, Bangalore - 560071',
  category: 'Conference',
  ticketTypes: [
    { id: 't1', name: 'General Admission', price: 0, quantity: 200, left: 156, description: 'Full access to all sessions and networking' },
    { id: 't2', name: 'VIP Pass', price: 999, quantity: 50, left: 23, description: 'Premium seating, exclusive workshops, lunch included' },
    { id: 't3', name: 'Student Pass', price: 299, quantity: 100, left: 67, description: 'For students with valid ID card' },
  ],
}

export function EventPage() {
  const { eventSlug } = useParams()
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [purchased, setPurchased] = useState(false)

  const event = dummyEvent
  const activeTicket = event.ticketTypes.find(t => t.id === selectedTicket)

  const handleBuyTicket = () => {
    setShowCheckout(true)
  }

  const handlePurchase = async () => {
    setIsPurchasing(true)
    // In production: create order in Supabase, init payment gateway
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsPurchasing(false)
    setPurchased(true)
  }

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
          <h1 className="text-3xl font-bold text-white mb-3">Registration Successful! 🎉</h1>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-yellow-400/10 via-background to-background pt-20 pb-16">
        <div className="mx-auto px-6 max-w-5xl">
          <Link to="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-yellow-400 transition-colors mb-6 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to MakeYourPass
          </Link>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Event Info */}
            <div className="flex-1">
              <Badge variant="yellow" size="sm" className="mb-3">{event.category}</Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-[1.1]">
                {event.title}
              </h1>
              <p className="text-text-secondary text-lg mb-6">{event.shortDescription}</p>
              
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 text-text-secondary">
                  <Calendar className="h-5 w-5 text-yellow-400" />
                  <span>{formatDate(event.date)}</span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  <Clock className="h-5 w-5 text-yellow-400" />
                  <span>{event.time}</span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  <MapPin className="h-5 w-5 text-yellow-400" />
                  <span>{event.venue}</span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary">
                  <Users className="h-5 w-5 text-yellow-400" />
                  <span>200+ people attending</span>
                </div>
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

                  <div className="space-y-3 mb-6">
                    {event.ticketTypes.map((ticket) => (
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
                        <p className="text-text-muted text-xs mb-1">{ticket.description}</p>
                        <p className="text-text-muted text-xs">{ticket.left} of {ticket.quantity} left</p>
                      </button>
                    ))}
                  </div>

                  {selectedTicket && !showCheckout && (
                    <Button variant="primary" size="lg" fullWidth onClick={handleBuyTicket}>
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
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Full description */}
      <div className="mx-auto px-6 max-w-5xl pb-20">
        <h2 className="text-2xl font-bold text-white mb-4">About This Event</h2>
        <p className="text-text-secondary leading-relaxed">{event.description}</p>
      </div>
    </div>
  )
}