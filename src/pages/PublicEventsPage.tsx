import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Calendar, MapPin, Search, ExternalLink, Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PublicEventModal } from '@/components/ui/PublicEventModal'
import { cn, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'

const categories = [
  { label: 'All', value: 'all' },
  { label: '🎪 College Fest', value: 'college_fest' },
  { label: '💼 Conference', value: 'conference' },
  { label: '🔧 Workshop', value: 'workshop' },
  { label: '🤝 Meetup', value: 'meetup' },
  { label: '🎵 Concert', value: 'concert' },
  { label: '🏆 Sports', value: 'sports' },
  { label: '🌐 Networking', value: 'networking' },
  { label: '💻 Webinar', value: 'webinar' },
  { label: '🎨 Other', value: 'other' },
]

export function PublicEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let query = supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .order('start_date', { ascending: true })
        .limit(24)

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      const { data } = await query
      if (data) setEvents(data as Event[])
      setLoading(false)
    }
    load()
  }, [selectedCategory])

  const filteredEvents = events.filter((e) =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.city?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <section className="min-h-screen pt-28 pb-16">
      <div className="mx-auto px-6 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4">
            Explore <span className="gradient-text">Events</span>
          </h1>
          <p className="text-text-secondary text-lg">
            Discover events happening near you — from college fests to conferences
          </p>
        </motion.div>

        {/* Search & Filter bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="max-w-2xl mx-auto mb-8"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search events by name, description, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white/[0.04] border border-white/10 rounded-2xl text-white placeholder:text-text-muted focus:outline-none focus:border-yellow-400/50 focus:shadow-[0_0_20px_rgba(245,215,0,0.08)] transition-all"
            />
          </div>
        </motion.div>

        {/* Category filters */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex flex-wrap items-center justify-center gap-2 mb-12"
        >
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all',
                selectedCategory === cat.value
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/5 text-text-secondary hover:text-white hover:bg-white/10'
              )}
            >
              {cat.label}
            </button>
          ))}
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Public Event Modal */}
        <PublicEventModal
          event={selectedEvent!}
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />

        {/* Events grid */}
        {!loading && (
          <>
            {filteredEvents.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredEvents.map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      onClick={() => setSelectedEvent(event)}
                      className="w-full text-left group"
                    >
                      <Card
                        variant="glass"
                        padding="md"
                        hover
                        glow="yellow"
                        className="h-full"
                      >
                        <CardContent>
                          {/* Cover image or gradient placeholder */}
                          <div className="h-36 -mx-6 -mt-6 mb-5 rounded-t-2xl bg-gradient-to-br from-yellow-400/20 via-accent-pink/10 to-accent-cyan/20 flex items-center justify-center overflow-hidden">
                            {event.cover_image_url ? (
                              <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-4xl opacity-50">
                                {event.category === 'college_fest' ? '🎪' :
                                 event.category === 'conference' ? '💼' :
                                 event.category === 'workshop' ? '🔧' :
                                 event.category === 'meetup' ? '🤝' :
                                 event.category === 'concert' ? '🎵' :
                                 event.category === 'sports' ? '🏆' : '📅'}
                              </span>
                            )}
                          </div>

                          {/* Category badge */}
                          <Badge variant="yellow" size="sm" className="mb-3">
                            {event.category.replace('_', ' ')}
                          </Badge>

                          <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-yellow-400 transition-colors">
                            {event.title}
                          </CardTitle>

                          {event.short_description && (
                            <p className="text-text-secondary text-sm line-clamp-2 mb-4">
                              {event.short_description}
                            </p>
                          )}

                          {/* Date & location */}
                          <div className="space-y-1.5 text-sm text-text-muted mb-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{formatDate(event.start_date)}</span>
                            </div>
                            {(event.venue_name || event.city) && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5" />
                                <span className="truncate">{event.city || event.venue_name}</span>
                              </div>
                            )}
                          </div>

                          {/* Action */}
                          <div className="pt-3 border-t border-white/10">
                            <span className="text-yellow-400 text-sm font-medium flex items-center gap-1.5 group-hover:gap-2 transition-all">
                              Quick View
                              <ExternalLink className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <div className="h-16 w-16 rounded-2xl bg-white/5 mx-auto mb-4 flex items-center justify-center">
                  <Calendar className="h-8 w-8 text-text-muted" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">No events found</h3>
                <p className="text-text-secondary mb-2">
                  {searchQuery
                    ? `No events matching "${searchQuery}"`
                    : 'No public events available right now'}
                </p>
                <p className="text-text-muted text-sm">
                  {searchQuery ? 'Try a different search term' : 'Check back later for new events'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
