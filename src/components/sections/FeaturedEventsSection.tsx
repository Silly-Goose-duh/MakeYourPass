import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, MapPin, ArrowRight, ExternalLink, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PublicEventModal } from '@/components/ui/PublicEventModal'
import { formatDate } from '@/lib/utils'
import { getPublicEvents } from '@/lib/supabase'
import type { Event } from '@/types'

export function FeaturedEventsSection() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await getPublicEvents(3)
      if (data) setEvents(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading || events.length === 0) return null

  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-accent-cyan/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/4 w-72 h-72 bg-accent-pink/5 rounded-full blur-[100px]" />
      </div>

      {/* Public Event Modal */}
      <PublicEventModal
        event={selectedEvent!}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      <div className="relative mx-auto px-6 max-w-7xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12"
        >
          <div>
            <Badge variant="cyan" size="lg" className="mb-4">
              <Sparkles className="h-4 w-4" />
              Live Now
            </Badge>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
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
                <Card variant="glass-cyan" hover glow="cyan" className="h-full">
                  <CardContent>
                    {/* Gradient header */}
                    <div className="h-32 -mx-6 -mt-6 mb-4 rounded-t-2xl bg-gradient-to-br from-accent-cyan/20 via-accent-pink/10 to-yellow-400/20 flex items-center justify-center">
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

                    <Badge variant="cyan" size="sm" className="mb-3">
                      {event.category.replace('_', ' ')}
                    </Badge>

                    <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-accent-cyan transition-colors">
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

                    <div className="pt-4 mt-4 border-t border-white/10">
                      <span className="text-accent-cyan text-sm font-medium flex items-center gap-1.5 group-hover:gap-2 transition-all">
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
