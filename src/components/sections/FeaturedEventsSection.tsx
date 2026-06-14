import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, MapPin, ArrowRight, ExternalLink, Sparkles, Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PublicEventModal } from '@/components/ui/PublicEventModal'
import { formatDate } from '@/lib/utils'
import { getPublicEvents, getTicketCountsForEvents } from '@/lib/supabase'
import type { Event } from '@/types'
import { cn } from '@/lib/utils'

export function FeaturedEventsSection() {
  const [events, setEvents] = useState<Event[]>([])
  const [ticketCounts, setTicketCounts] = useState<Record<string, { sold: number; total: number }>>({})
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await getPublicEvents(3)
      if (data) {
        setEvents(data)
        const { data: ticketData } = await getTicketCountsForEvents(data.map(e => e.id))
        if (ticketData) {
          const counts: Record<string, { sold: number; total: number }> = {}
          for (const row of ticketData) {
            if (!counts[row.event_id]) counts[row.event_id] = { sold: 0, total: 0 }
            counts[row.event_id].sold += row.quantity_sold
            counts[row.event_id].total += row.quantity
          }
          setTicketCounts(counts)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading || events.length === 0) return null

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Public Event Modal */}
      <PublicEventModal
        event={selectedEvent!}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      <div className="relative mx-auto px-8 lg:px-12 max-w-7xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <Badge variant="primary" size="lg" className="mb-4">
              <Sparkles className="h-4 w-4" />
              Live Now
            </Badge>
            <h2 className="left-accent text-3xl sm:text-4xl md:text-5xl font-bold text-text-primary">
              Featured <span className="gradient-text">Events</span>
            </h2>
            <p className="text-text-secondary text-lg mt-2">
              Upcoming events you don&apos;t want to miss
            </p>
          </div>
          <Link to="/events">
            <Button variant="outline" size="md" className="group shrink-0">
              View All Events
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>

        {/* Event cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {events.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <button
                onClick={() => setSelectedEvent(event)}
                className="w-full text-left group"
              >
                <Card variant="glass-primary" hover glow="primary" className="h-full">
                  <CardContent>
                    {/* Gradient header */}
                    <div className="h-32 -mx-6 -mt-6 mb-4 rounded-t-2xl bg-gradient-to-br from-primary/10 via-accent-rose/5 to-secondary/10 flex items-center justify-center">
                      {event.cover_image_url ? (
                        <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl opacity-40">
                          {event.category === 'college_fest' ? '🎪' :
                           event.category === 'concert' ? '🎵' :
                           event.category === 'workshop' ? '🔧' : '📅'}
                        </span>
                      )}
                    </div>

                    <Badge variant="primary" size="sm" className="mb-3">
                      {event.category.replace('_', ' ')}
                    </Badge>

                    <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {event.title}
                    </CardTitle>

                    <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(event.start_date)}</span>
                    </div>
                    {(event.venue_name || event.city) && (
                      <div className="flex items-center gap-2 text-sm text-text-muted">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{event.city || event.venue_name}</span>
                      </div>
                    )}

                    {/* Ticket availability on featured card */}
                    {ticketCounts[event.id] && ticketCounts[event.id].total > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-text-muted">
                            <Ticket className="h-3 w-3 inline-block mr-0.5 -mt-0.5" />
                            {ticketCounts[event.id].sold}/{ticketCounts[event.id].total} booked
                          </span>
                          <span className={cn(
                            ticketCounts[event.id].sold >= ticketCounts[event.id].total
                              ? 'text-error' : 'text-secondary'
                          )}>
                            {ticketCounts[event.id].sold >= ticketCounts[event.id].total
                              ? 'Sold Out'
                              : `${ticketCounts[event.id].total - ticketCounts[event.id].sold} left`}
                          </span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              ticketCounts[event.id].sold >= ticketCounts[event.id].total
                                ? 'bg-error'
                                : 'bg-gradient-to-r from-primary to-accent-teal'
                            )}
                            style={{
                              width: `${Math.min(100, (ticketCounts[event.id].sold / ticketCounts[event.id].total) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-4 mt-4 border-t border-border">
                      <span className="text-primary text-sm font-medium flex items-center gap-1.5 group-hover:gap-2 transition-all">
                        Quick View <ExternalLink className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
