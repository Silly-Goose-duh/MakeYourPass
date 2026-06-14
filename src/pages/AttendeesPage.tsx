import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Search, Download, Users, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { cn, formatTime } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'

interface Attendee {
  id: string
  order_id: string
  ticket_id: string
  event_id: string
  event_title: string
  ticket_name: string
  name: string
  email: string
  phone?: string
  status: string
  checked_in_at?: string
  qr_code: string
  created_at: string
}

export function AttendeesPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [selectedEventId, setSelectedEventId] = useState<string>('all')

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Get user's orgs
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)

    if (!orgs || orgs.length === 0) { setLoading(false); return }

    // Get events
    const { data: evs } = await supabase
      .from('events')
      .select('*')
      .in('org_id', orgs.map(o => o.id))
      .order('created_at', { ascending: false })

    if (evs) setEvents(evs as Event[])

    // Get all orders for these events
    const { data: orders } = await supabase
      .from('orders')
      .select('*, ticket_types!inner(name)')
      .in('event_id', evs?.map(e => e.id) || [])
      .order('created_at', { ascending: false })

    // Get all tickets
    const { data: tickets } = await supabase
      .from('tickets')
      .select('*')
      .in('event_id', evs?.map(e => e.id) || [])

    if (orders && tickets && evs) {
      const attendeeList: Attendee[] = orders.map((order) => {
        const event = evs.find(e => e.id === order.event_id)
        const ticket = tickets.find((t) => t.order_id === order.id)
        return {
          id: order.id,
          order_id: order.id,
          ticket_id: ticket?.id || '',
          event_id: order.event_id,
          event_title: event?.title || 'Unknown Event',
          ticket_name: order.ticket_types?.name || 'General',
          name: order.buyer_name,
          email: order.buyer_email,
          phone: order.buyer_phone,
          status: ticket?.status || 'active',
          checked_in_at: ticket?.checked_in_at,
          qr_code: ticket?.qr_code || '',
          created_at: order.created_at,
        }
      })
      setAttendees(attendeeList)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  const filteredAttendees = attendees.filter(a => {
    if (selectedEventId !== 'all' && a.event_id !== selectedEventId) return false
    if (filter === 'checked-in' && a.status !== 'used') return false
    if (filter === 'not-checked-in' && a.status === 'used') return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.event_title.toLowerCase().includes(q)
    }
    return true
  })

  const checkedInCount = attendees.filter(a => a.status === 'used').length
  const totalCount = attendees.length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-7xl px-6 sm:px-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Attendees</h1>
          <p className="text-text-secondary text-sm">
            {totalCount > 0 ? `${checkedInCount} of ${totalCount} checked in` : 'View and manage event attendees'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/scan">
            <Button variant="gradient" size="sm" glow>
              <QrCode className="h-4 w-4" />
              Scan Tickets
            </Button>
          </Link>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Event filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setSelectedEventId('all')}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            selectedEventId === 'all' ? 'bg-yellow-400 text-black' : 'bg-white/5 text-text-secondary hover:text-white'
          )}
        >
          All Events
        </button>
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => setSelectedEventId(ev.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all truncate max-w-[150px]',
              selectedEventId === ev.id ? 'bg-yellow-400 text-black' : 'bg-white/5 text-text-secondary hover:text-white'
            )}
          >
            {ev.title}
          </button>
        ))}
      </div>

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name, email, or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-yellow-400/50"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'checked-in', 'not-checked-in'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize',
                filter === status
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/[0.04] border border-white/10 text-text-secondary hover:text-white'
              )}
            >
              {status.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredAttendees.length > 0 ? (
        <div className="space-y-2">
          {filteredAttendees.map((attendee) => (
            <Card key={attendee.id} variant="glass" padding="md" className="group">
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar name={attendee.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate">{attendee.name}</p>
                      <Badge
                        variant={attendee.status === 'used' ? 'success' : 'default'}
                        size="sm"
                        dot
                      >
                        {attendee.status === 'used' ? 'Checked In' : 'Active'}
                      </Badge>
                    </div>
                    <p className="text-text-secondary text-xs">{attendee.email}</p>
                    <div className="flex items-center gap-3 mt-1 text-text-muted text-xs">
                      <span>{attendee.event_title}</span>
                      <span>•</span>
                      <span>{attendee.ticket_name}</span>
                      {attendee.checked_in_at && (
                        <>
                          <span>•</span>
                          <span className="text-green-400">
                            Checked in at {formatTime(new Date(attendee.checked_in_at).toTimeString().slice(0,5))}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="glass" padding="lg">
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
              <Users className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No attendees yet</h3>
            <p className="text-text-secondary text-sm max-w-md mx-auto">
              {attendees.length > 0 ? 'No matches for your search' : 'Attendees will appear here once people start registering.'}
            </p>
          </div>
        </Card>
      )}
    </motion.div>
  )
}
