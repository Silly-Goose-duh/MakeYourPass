import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Calendar, MapPin, MoreHorizontal, Edit, Trash2, Eye, Copy, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { cn, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'

export function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    async function loadEvents() {
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

        if (data) setEvents(data as Event[])
      }
      setLoading(false)
    }
    loadEvents()
  }, [])

  const filteredEvents = filterStatus === 'all'
    ? events
    : events.filter(e => e.status === filterStatus)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Events</h1>
          <p className="text-text-secondary text-sm">Manage all your events in one place</p>
        </div>
        <Link to="/dashboard/events/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Create Event
          </Button>
        </Link>
      </div>

      {/* Filters */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
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

      {/* Events Grid or Empty State */}
      {filteredEvents.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
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

                  <div className="flex items-center gap-2 pt-3 border-t border-border">
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
                    <Button variant="ghost" size="sm" className="text-xs">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
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
        </div>
      )}
    </motion.div>
  )
}
