import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Calendar, Clock, MapPin, Users, MoreHorizontal, Edit, Trash2, Eye, Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

const dummyEvents = [
  {
    id: '1',
    title: 'Tech Conference 2026',
    date: '2026-08-15',
    status: 'published' as const,
    ticketsSold: 45,
    totalTickets: 100,
    venue: 'Bangalore International Centre',
    type: 'conference',
  },
  {
    id: '2',
    title: 'Design Workshop',
    date: '2026-07-20',
    status: 'draft' as const,
    ticketsSold: 0,
    totalTickets: 30,
    venue: 'Online',
    type: 'workshop',
  },
  {
    id: '3',
    title: 'College Fest 2026',
    date: '2026-09-10',
    status: 'published' as const,
    ticketsSold: 230,
    totalTickets: 500,
    venue: 'Campus Grounds',
    type: 'college_fest',
  },
]

export function EventsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filteredEvents = filterStatus === 'all'
    ? dummyEvents
    : dummyEvents.filter(e => e.status === filterStatus)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl"
    >
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

      {/* Events Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvents.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card variant="glass" hover className="group h-full">
              <CardContent>
                {/* Status badge */}
                <div className="flex items-center justify-between mb-4">
                  <Badge
                    variant={event.status === 'published' ? 'success' : event.status === 'draft' ? 'warning' : 'default'}
                    size="sm"
                    dot
                  >
                    {event.status}
                  </Badge>
                  <button className="p-1.5 text-text-muted hover:text-white transition-colors rounded-lg hover:bg-white/10 opacity-0 group-hover:opacity-100">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {/* Event info */}
                <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">{event.title}</h3>
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDate(event.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{event.venue}</span>
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-text-secondary">Tickets sold</span>
                    <span className="text-white font-medium">{event.ticketsSold}/{event.totalTickets}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 rounded-full transition-all"
                      style={{ width: `${(event.ticketsSold / event.totalTickets) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Link to={`/event/${event.id}`} className="flex-1">
                    <Button variant="ghost" size="sm" fullWidth className="text-xs">
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </Link>
                  <Link to={`/dashboard/events/${event.id}/edit`} className="flex-1">
                    <Button variant="ghost" size="sm" fullWidth className="text-xs">
                      <Edit className="h-3.5 w-3.5" />
                      Edit
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
    </motion.div>
  )
}