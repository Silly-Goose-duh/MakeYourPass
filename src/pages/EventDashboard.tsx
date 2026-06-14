import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Users, BarChart3, Ticket, ScanQrCode, Edit3,
  Calendar, MapPin, Clock, Check, Search, Download,
  QrCode, TrendingUp, ExternalLink
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { cn, formatDate, formatTime } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Event as EventType, TicketType, Order, Ticket as TicketType2 } from '@/types'

type Tab = 'overview' | 'attendees' | 'tickets' | 'analytics' | 'scanner'

interface ScanResult {
  ticket: TicketType2
  order?: Order
}

export function EventDashboard() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<EventType | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [tickets, setTickets] = useState<TicketType2[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanError, setScanError] = useState('')

  const loadEvent = useCallback(async () => {
    setLoading(true)
    const { data: ev } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()
    if (ev) {
      setEvent(ev as EventType)
      const { data: tts } = await supabase
        .from('ticket_types')
        .select('*')
        .eq('event_id', ev.id)
        .order('sort_order')
      if (tts) setTicketTypes(tts as TicketType[])
      const { data: ords } = await supabase
        .from('orders')
        .select('*')
        .eq('event_id', ev.id)
        .order('created_at', { ascending: false })
      if (ords) setOrders(ords as Order[])
      const { data: tix } = await supabase
        .from('tickets')
        .select('*')
        .eq('event_id', ev.id)
        .order('created_at', { ascending: false })
      if (tix) setTickets(tix as TicketType2[])
    }
    setLoading(false)
  }, [eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (eventId) loadEvent()
  }, [eventId, loadEvent])

  const totalSold = ticketTypes.reduce((s, t) => s + t.quantity_sold, 0)
  const totalCapacity = ticketTypes.reduce((s, t) => s + t.quantity, 0)
  const totalRevenue = orders.filter(o => o.status === 'confirmed').reduce((s, o) => s + o.total_amount, 0)
  const checkedIn = tickets.filter(t => t.status === 'used').length

  async function handleScanLookup() {
    setScanError('')
    setScanResult(null)
    if (!scanInput.trim()) return
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('qr_code', scanInput.trim())
      .eq('event_id', eventId)
      .single()
    if (data) {
      const order = orders.find(o => o.id === data.order_id)
      setScanResult({ ticket: data, order })
    } else {
      setScanError('Ticket not found for this event')
    }
  }

  async function handleCheckIn(ticketId: string) {
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'used', checked_in_at: new Date().toISOString() })
      .eq('id', ticketId)
    if (!error) {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'used' as const, checked_in_at: new Date().toISOString() } : t))
      setScanResult((prev: ScanResult | null) => prev ? { ...prev, ticket: { ...prev.ticket, status: 'used', checked_in_at: new Date().toISOString() } } : null)
    }
  }

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'attendees', label: 'Attendees', icon: Users },
    { key: 'tickets', label: 'Tickets', icon: Ticket },
    { key: 'analytics', label: 'Analytics', icon: TrendingUp },
    { key: 'scanner', label: 'Scanner', icon: ScanQrCode },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-bold text-text-primary mb-2">Event not found</h2>
        <Link to="/dashboard/events"><Button variant="ghost">Back to Events</Button></Link>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-7xl px-6 sm:px-10">
      {/* Back + Event Header */}
      <div className="mb-6">
        <Link to="/dashboard/events" className="inline-flex items-center gap-1.5 text-text-muted hover:text-primary text-sm mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Events
        </Link>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">{event.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(event.start_date)}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTime(event.start_time)}</span>
              {event.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {event.city}</span>}
              <Badge variant={event.status === 'published' ? 'success' : 'warning'} size="sm" dot>{event.status}</Badge>
              <Badge variant={event.visibility === 'public' ? 'primary' : 'accent'} size="sm">{event.visibility}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/event/${event.slug}`} target="_blank">
              <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /> View Live</Button>
            </Link>
            <Link to={`/dashboard/events/${event.id}/edit`}>
              <Button variant="secondary" size="sm"><Edit3 className="h-3.5 w-3.5" /> Edit</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.04] border border-border w-fit mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5',
              activeTab === tab.key
                ? 'bg-primary text-white shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                : 'text-text-secondary hover:text-white'
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card variant="glass" padding="md" glow="primary">
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">{totalSold}/{totalCapacity}</p>
                <p className="text-xs text-text-muted">Tickets Sold</p>
              </CardContent>
            </Card>
            <Card variant="glass" padding="md" glow="accent">
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">{orders.length}</p>
                <p className="text-xs text-text-muted">Orders</p>
              </CardContent>
            </Card>
            <Card variant="glass" padding="md" glow="primary">
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">₹{totalRevenue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-text-muted">Revenue</p>
              </CardContent>
            </Card>
            <Card variant="glass" padding="md" glow="primary">
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">{checkedIn}/{totalSold}</p>
                <p className="text-xs text-text-muted">Checked In</p>
              </CardContent>
            </Card>
          </div>

          {event.short_description && (
            <Card variant="glass" padding="md">
              <CardContent>
                <p className="text-sm text-text-secondary">{event.short_description}</p>
                {event.description && <p className="text-xs text-text-muted mt-2 line-clamp-3">{event.description}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'attendees' && (
        <AttendeesTab orders={orders} tickets={tickets} />
      )}

      {activeTab === 'tickets' && (
        <TicketsTab tickets={tickets} orders={orders} />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsTab ticketTypes={ticketTypes} orders={orders} tickets={tickets} />
      )}

      {activeTab === 'scanner' && (
        <ScannerTab
          scanInput={scanInput}
          setScanInput={setScanInput}
          scanResult={scanResult}
          scanError={scanError}
          onScan={handleScanLookup}
          onCheckIn={handleCheckIn}
        />
      )}
    </motion.div>
  )
}

/* ===== ATTENDEES TAB ===== */
function AttendeesTab({ orders, tickets }: { orders: Order[]; tickets: TicketType2[] }) {
  const [search, setSearch] = useState('')

  const attendeeRows = orders.map(order => {
    const ticket = tickets.find(t => t.order_id === order.id)
    return { order, ticket }
  }).filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.order.buyer_name.toLowerCase().includes(q) || a.order.buyer_email.toLowerCase().includes(q)
  })

  return (
    <Card variant="glass" padding="lg">
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text" placeholder="Search attendees..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-border rounded-xl text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary/50"
            />
          </div>
          <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /> Export</Button>
        </div>
        {attendeeRows.length > 0 ? (
          <div className="space-y-2">
            {attendeeRows.map(({ order, ticket }) => (
              <div key={order.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-white/5">
                <Avatar name={order.buyer_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{order.buyer_name}</p>
                  <p className="text-xs text-text-muted truncate">{order.buyer_email}</p>
                </div>
                <div className="text-right text-xs shrink-0">
                  <Badge variant={ticket?.status === 'used' ? 'success' : ticket?.status === 'active' ? 'info' : 'error'} size="sm" dot>
                    {ticket?.status || order.status}
                  </Badge>
                  {ticket?.checked_in_at && <p className="text-text-muted mt-0.5 text-[10px]">{formatTime(ticket.checked_in_at)}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-text-muted text-sm">No attendees yet</div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===== TICKETS TAB ===== */
function TicketsTab({ tickets, orders }: { tickets: TicketType2[]; orders: Order[] }) {
  return (
    <Card variant="glass" padding="lg">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-text-secondary">{tickets.length} total tickets</p>
          <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /> Export</Button>
        </div>
        {tickets.length > 0 ? (
          <div className="space-y-2">
            {tickets.map(ticket => {
              const order = orders.find(o => o.id === ticket.order_id)
              return (
                <div key={ticket.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-border">
                  <QrCode className="h-8 w-8 text-text-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{order?.buyer_name || 'Anonymous'}</p>
                    <p className="text-xs text-text-muted">ID: {ticket.qr_code.slice(0, 8)}...</p>
                  </div>
                  <Badge variant={ticket.status === 'used' ? 'success' : 'info'} size="sm" dot>{ticket.status}</Badge>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-text-muted text-sm">No tickets sold yet</div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===== ANALYTICS TAB ===== */
function AnalyticsTab({ ticketTypes, orders, tickets }: { ticketTypes: TicketType[]; orders: Order[]; tickets: TicketType2[] }) {
  const totalSold = ticketTypes.reduce((s, t) => s + t.quantity_sold, 0)
  const totalCapacity = ticketTypes.reduce((s, t) => s + t.quantity, 0)
  const totalRevenue = orders.filter(o => o.status === 'confirmed').reduce((s, o) => s + o.total_amount, 0)
  const checkedIn = tickets.filter(t => t.status === 'used').length
  const checkInRate = totalSold > 0 ? Math.round((checkedIn / totalSold) * 100) : 0
  const sellRate = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card variant="glass" padding="sm"><CardContent><p className="text-lg font-bold text-white">{sellRate}%</p><p className="text-xs text-text-muted">Sold</p></CardContent></Card>
        <Card variant="glass" padding="sm"><CardContent><p className="text-lg font-bold text-white">{checkInRate}%</p><p className="text-xs text-text-muted">Check-in Rate</p></CardContent></Card>
        <Card variant="glass" padding="sm"><CardContent><p className="text-lg font-bold text-white">₹{totalRevenue.toLocaleString('en-IN')}</p><p className="text-xs text-text-muted">Revenue</p></CardContent></Card>
        <Card variant="glass" padding="sm"><CardContent><p className="text-lg font-bold text-white">{orders.length}</p><p className="text-xs text-text-muted">Orders</p></CardContent></Card>
      </div>

      {/* Ticket type breakdown */}
      {ticketTypes.length > 0 && (
        <Card variant="glass" padding="md">
          <CardContent>
              <p className="text-sm font-semibold text-text-primary mb-3">Per Ticket Type</p>
            <div className="space-y-2">
              {ticketTypes.map(tt => {
                const ttSold = tt.quantity_sold
                const ttPct = tt.quantity > 0 ? Math.round((ttSold / tt.quantity) * 100) : 0
                const ttRevenue = orders.filter(o => o.ticket_type_id === tt.id && o.status === 'confirmed').reduce((s, o) => s + o.total_amount, 0)
                return (
                  <div key={tt.id} className="p-3 rounded-xl bg-surface border border-white/5">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-white font-medium">{tt.name}</span>
                      <span className="text-text-muted">₹{tt.price} — {ttSold}/{tt.quantity}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-accent-teal rounded-full" style={{ width: `${ttPct}%` }} />
                    </div>
                    <p className="text-text-muted text-[10px] mt-1">Revenue: ₹{ttRevenue.toLocaleString('en-IN')}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress bar */}
      {totalCapacity > 0 && (
        <Card variant="glass" padding="md">
          <CardContent>
            <p className="text-sm font-semibold text-text-primary mb-3">Overall Capacity</p>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  sellRate >= 100 ? 'bg-red-500' : 'bg-gradient-to-r from-primary via-accent-rose to-accent-teal'
                )}
                style={{ width: `${Math.min(100, sellRate)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-muted mt-1.5">
              <span>{totalSold} sold</span>
              <span>{totalCapacity - totalSold} remaining</span>
              <span>{totalCapacity} total</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ===== SCANNER TAB ===== */
function ScannerTab({
  scanInput, setScanInput, scanResult, scanError, onScan, onCheckIn
}: {
  scanInput: string; setScanInput: (v: string) => void
  scanResult: ScanResult | null; scanError: string; onScan: () => void; onCheckIn: (id: string) => void
}) {
  return (
    <Card variant="glass" padding="lg">
      <CardContent>
        <p className="text-sm font-semibold text-text-primary mb-3">Verify Ticket</p>
        <div className="flex gap-2 mb-4">
          <input
            type="text" placeholder="Enter or scan QR code..." value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onScan()}
            className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-border rounded-xl text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary/50"
          />
          <Button variant="primary" size="sm" onClick={onScan}><Search className="h-4 w-4" /> Lookup</Button>
        </div>

        {scanError && <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm mb-4">{scanError}</div>}

        {scanResult && (
          <div className="p-4 rounded-xl bg-surface border border-border">
            <div className="flex items-center justify-between mb-3">
              <Badge variant={scanResult.ticket.status === 'used' ? 'success' : scanResult.ticket.status === 'active' ? 'info' : 'error'} size="sm" dot>
                {scanResult.ticket.status}
              </Badge>
              {scanResult.ticket.status === 'used' && scanResult.ticket.checked_in_at && (
                <span className="text-xs text-text-muted">Checked in at {formatTime(scanResult.ticket.checked_in_at)}</span>
              )}
            </div>
            <p className="text-white font-semibold">{scanResult.order?.buyer_name || 'Unknown'}</p>
            <p className="text-text-secondary text-sm">{scanResult.order?.buyer_email}</p>
            <p className="text-text-muted text-xs mt-1">Ticket: {scanResult.ticket.qr_code}</p>
            {scanResult.ticket.status === 'active' && (
              <Button variant="primary" size="sm" className="mt-3" onClick={() => onCheckIn(scanResult.ticket.id)}>
                <Check className="h-4 w-4" /> Confirm Check-In
              </Button>
            )}
          </div>
        )}

        <div className="mt-4 p-3 bg-primary-muted border border-primary/20 rounded-xl text-xs text-secondary">
          Tip: Use a QR scanner app to scan attendee tickets, then paste the code here.
        </div>
      </CardContent>
    </Card>
  )
}
