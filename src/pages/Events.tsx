import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Calendar, MapPin, MoreHorizontal, Edit, Eye, Copy, Sparkles, ExternalLink, Search, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { cn, formatDate } from '@/lib/utils'
import { supabase, getPublicEvents } from '@/lib/supabase'
import type { Event } from '@/types'

type TabMode = 'my-events' | 'public-events'

export function EventsPage() {
  const [mode, setMode] = useState<TabMode>('my-events')
  const [myEvents, setMyEvents] = useState<Event[]>([])
  const [publicEvents, setPublicEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (mode === 'my-events') loadMyEvents()
    else loadPublicEvents()
  }, [mode])

  async function loadMyEvents() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)

    if (orgs && orgs.length > 0) {
      const { data } = await supabase
        .from('events')
        .select('*')
        .in('org_id', orgs.map(o => o.id))
        .order('created_at', { ascending: false })

      if (data) setMyEvents(data as Event[])
    }
    setLoading(false)
  }

  async function loadPublicEvents() {
    setLoading(true)
    const { data } = await getPublicEvents(24)
    if (data) setPublicEvents(data)
    setLoading(false)
  }

  const filteredMyEvents = myEvents.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.title.toLowerCase().includes(q) || e.city?.toLowerCase().includes(q)
    }
    return true
  })

  const filteredPublicEvents = publicEvents.filter(e => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return e.title.toLowerCase().includes(q) || e.city?.toLowerCase().includes(q) || e.short_description?.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Events</h1>
          <p className="text-text-secondary text-sm">
            {mode === 'my-events' ? 'Manage your events' : 'Discover public events'}
          </p>
        </div>
        {mode === 'my-events' && (
          <Link to="/dashboard/events/new">
            <Button variant="gradient" size="sm" glow>
              <Plus className="h-4 w-4" />
              Create Event
            </Button>
          </Link>
        )}
      </div>

      {/* Toggle — My Events / Public Events */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10 w-fit mb-6">
        <button
          onClick={() => setMode('my-events')}
          className={cn(
            'px-5 py-2 rounded-xl text-sm font-medium transition-all',
            mode === 'my-events'
              ? 'bg-yellow-400 text-black shadow-[0_0_20px_rgba(245,215,0,0.15)]'
              : 'text-text-secondary hover:text-white'
          )}
        >
          <Calendar className="h-4 w-4 inline-block mr-1.5 -mt-0.5" />
          My Events
        </button>
        <button
          onClick={() => setMode('public-events')}
          className={cn(
            'px-5 py-2 rounded-xl text-sm font-medium transition-all',
            mode === 'public-events'
              ? 'bg-yellow-400 text-black shadow-[0_0_20px_rgba(245,215,0,0.15)]'
              : 'text-text-secondary hover:text-white'
          )}
        >
          <Sparkles className="h-4 w-4 inline-block mr-1.5 -mt-0.5" />
          Public Events
        </button>
      </div>

      {/* Search bar (for both modes) */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <input
          type="text"
          placeholder={mode === 'my-events' ? 'Search my events...' : 'Search public events...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder:text-text-muted text-sm focus:outline-none focus:border-yellow-400/50 transition-all"
        />
      </div>

      {/* My Events: Status filters */}
      {mode === 'my-events' && myEvents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {['all', 'published', 'draft', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all capitalize',
                filterStatus === status
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/5 text-text-secondary hover:text-white hover:bg-white/10'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Content */}
      {!loading && (
        <AnimatePresence mode="wait">
          {mode === 'my-events' ? (
            <MyEventsView key="my" events={filteredMyEvents} />
          ) : (
            <PublicEventsView key="public" events={filteredPublicEvents} />
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}

/* ===== MY EVENTS VIEW ===== */
function MyEventsView({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-20"
      >
        <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-yellow-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No events yet</h3>
        <p className="text-text-secondary mb-6">Create your first event to get started</p>
        <Link to="/dashboard/events/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Create Your First Event
          </Button>
        </Link>
      </motion.div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map((event) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          layout
        >
          <Card variant="glass" hover className="group h-full">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <Badge
                  variant={event.status === 'published' ? 'success' : event.status === 'draft' ? 'warning' : 'default'}
                  size="sm" dot
                >
                  {event.status}
                </Badge>
                <button className="p-1.5 text-text-muted hover:text-white transition-colors rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">{event.title}</h3>
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDate(event.start_date)}</span>
                </div>
                {event.venue_name && (
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{event.venue_name}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 pt-3 border-t border-white/10">
                <Link to={`/event/${event.slug}`} className="flex-1">
                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                </Link>
                <Link to={`/dashboard/events/${event.id}/edit`} className="flex-1">
                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                    <Edit className="h-3.5 w-3.5" /> Edit
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/event/${event.slug}`)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

/* ===== PUBLIC EVENTS VIEW ===== */
function PublicEventsView({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-20"
      >
        <div className="h-16 w-16 rounded-2xl bg-white/5 mx-auto mb-4 flex items-center justify-center">
          <Calendar className="h-8 w-8 text-text-muted" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No public events found</h3>
        <p className="text-text-secondary">Check back later for new events</p>
      </motion.div>
    )
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {events.map((event, i) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
        >
          <Card variant="glass-cyan" hover glow="cyan" className="group h-full">
            <CardContent>
              {/* Top: category + external badge */}
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="cyan" size="sm">
                  {event.category.replace('_', ' ')}
                </Badge>
                {event.use_external_form && event.form_link && (
                  <Badge variant="pink" size="sm" className="ml-auto">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    External Form
                  </Badge>
                )}
              </div>

              <h3 className="text-base font-semibold text-white mb-1.5 line-clamp-2 group-hover:text-accent-cyan transition-colors">
                {event.title}
              </h3>

              {event.short_description && (
                <p className="text-text-secondary text-xs line-clamp-2 mb-3">
                  {event.short_description}
                </p>
              )}

              {/* Date & location */}
              <div className="space-y-1 text-xs text-text-muted mb-4">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(event.start_date)}</span>
                </div>
                {(event.venue_name || event.city) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{event.city || event.venue_name}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-3 border-t border-white/10">
                <Link to={`/event/${event.slug}`} className="flex-1">
                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                    <Eye className="h-3.5 w-3.5" /> Details
                  </Button>
                </Link>
                {event.use_external_form && event.form_link && (
                  <a
                    href={event.form_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button variant="pink" size="sm" fullWidth className="text-xs">
                      <ExternalLink className="h-3.5 w-3.5" /> Register
                    </Button>
                  </a>
                )}
                <Link to={`/event/${event.slug}`} className="flex-1">
                  <Button variant="cyan" size="sm" fullWidth className="text-xs">
                    <Ticket className="h-3.5 w-3.5" /> Tickets
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

