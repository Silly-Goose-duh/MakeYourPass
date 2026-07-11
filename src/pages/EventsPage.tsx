import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Calendar, AlertTriangle } from 'lucide-react'
import { getPublishedEvents, getApprovedOrganizations } from '@/lib/supabase'
import type { Organization } from '@/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { OrgSidebar, SidebarReopen } from '@/components/event/OrgSidebar'
import { EventCard } from '@/components/event/EventCard'
import type { EventWithOrg } from '@/components/event/eventUtils'

const FILTER_CATEGORIES = ['All events', 'Workshops', 'Hackathons', 'Talks', 'Competitions'] as const
type FilterCategory = (typeof FILTER_CATEGORIES)[number]

function getEventCategory(event: EventWithOrg): FilterCategory {
  const text = `${event.title} ${event.description || ''}`.toLowerCase()
  if (/hackathon|hack|hack-a-thon/.test(text)) return 'Hackathons'
  if (/workshop|build|learn|hands.?on|tutorial/.test(text)) return 'Workshops'
  if (/talk|seminar|guest|keynote|lecture/.test(text)) return 'Talks'
  if (/competition|contest|quiz|challenge|olympiad/.test(text)) return 'Competitions'
  return 'Workshops'
}

type TimeWindow = 'upcoming' | 'all' | 'past'

export default function EventsPage() {
  const [events, setEvents] = useState<EventWithOrg[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All events')
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all')

  useEffect(() => {
    async function fetchData() {
      setLoading(true); setError(null)
      try {
        const [eventsRes, orgsRes] = await Promise.all([
          getPublishedEvents(),
          getApprovedOrganizations(),
        ])
        if (eventsRes.error) throw new Error(eventsRes.error.message || 'Failed to load events')
        if (orgsRes.error) throw new Error(orgsRes.error.message || 'Failed to load organizations')
        setEvents((eventsRes.data ?? []) as EventWithOrg[])
        setOrganizations(orgsRes.data ?? [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        setError(message.includes('RLS_RECURSION')
          ? 'Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.'
          : message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const up: EventWithOrg[] = []
    const past: EventWithOrg[] = []
    for (const e of events) {
      const d = e.date ? new Date(e.date + 'T00:00:00') : null
      if (d && d < today) past.push(e); else up.push(e)
    }
    past.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return { upcomingEvents: up, pastEvents: past }
  }, [events])

  const filteredEvents = useMemo(() => {
    const windowEvents =
      timeWindow === 'upcoming' ? upcomingEvents :
      timeWindow === 'past' ? pastEvents :
      events
    return windowEvents.filter((event) => {
      const matchesOrg = !selectedOrgId || event.organization_id === selectedOrgId
      const matchesSearch = !searchQuery || event.title.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = activeFilter === 'All events' || getEventCategory(event) === activeFilter
      return matchesOrg && matchesSearch && matchesFilter
    })
  }, [events, upcomingEvents, pastEvents, selectedOrgId, searchQuery, activeFilter, timeWindow])

  const orgEventCounts = useMemo(
    () => organizations.reduce((acc, org) => {
      acc[org.id] = events.filter((e) => e.organization_id === org.id).length
      return acc
    }, {} as Record<string, number>),
    [events, organizations],
  )

  return (
    <div style={{ background: 'var(--color-cp-bg-base)', minHeight: '100vh' }}>
      <section id="events-section" className="px-4 sm:px-6 pb-16 pt-6">
        {/* Page heading */}
        <div className="mb-5">
          <span className="zine-sticker" style={{ background: '#FF4D2E', color: '#fff', transform: 'rotate(-2deg)' }}>All campus events</span>
          <h1 className="mt-3 font-extrabold uppercase tracking-tight" style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.8rem, 5vw, 3rem)', color: '#14110E' }}>
            Events
          </h1>
          <p className="mt-1 max-w-xl text-sm font-semibold" style={{ color: '#4A4640' }}>
            Every workshop, hackathon, talk &amp; competition at Marian Engineering College — past and upcoming, in one place.
          </p>
        </div>

        <div className="flex gap-0 sm:gap-6">
          {/* ─── SIDEBAR (same as Home) ─── */}
          <OrgSidebar
            organizations={organizations}
            selectedOrgId={selectedOrgId}
            onSelectOrg={setSelectedOrgId}
            eventCounts={orgEventCounts}
            totalEvents={events.length}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={setSidebarOpen}
          />
          <SidebarReopen open={sidebarOpen} onOpen={() => setSidebarOpen(true)} />

          {/* ─── CENTER ─── */}
          <main className="min-w-0 flex-1">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" strokeWidth={2.5} style={{ color: '#14110E' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH EVENTS..."
                className="w-full py-3 pl-12 pr-4 text-sm font-bold outline-none"
                style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E', color: '#14110E', fontFamily: 'Syne, sans-serif' }}
              />
            </div>

            {/* Filter chips */}
            <div className="mb-3 flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
              {FILTER_CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setActiveFilter(cat)} className={`filter-chip ${activeFilter === cat ? 'active' : ''}`}>{cat}</button>
              ))}
            </div>

            {/* Time-window tabs */}
            <div className="mb-4 flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
              {([
                { key: 'upcoming', label: 'Upcoming' },
                { key: 'all', label: 'All events' },
                { key: 'past', label: 'Past events' },
              ] as const).map((tw) => (
                <button
                  key={tw.key}
                  onClick={() => setTimeWindow(tw.key)}
                  className="filter-chip shrink-0"
                  style={timeWindow === tw.key ? { background: '#FF4D2E', color: '#fff' } : {}}
                >
                  {tw.label}
                  {tw.key === 'upcoming' && upcomingEvents.length > 0 && (
                    <span className="ml-1.5 px-1.5 text-[10px]" style={{ border: '1.5px solid currentColor', borderRadius: 999 }}>{upcomingEvents.length}</span>
                  )}
                  {tw.key === 'past' && pastEvents.length > 0 && (
                    <span className="ml-1.5 px-1.5 text-[10px]" style={{ border: '1.5px solid currentColor', borderRadius: 999 }}>{pastEvents.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Section header */}
            <div className="mb-5 flex items-end justify-between">
              <h2 className="font-extrabold uppercase tracking-tight" style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', color: '#14110E' }}>
                {searchQuery || activeFilter !== 'All events' || selectedOrgId
                  ? 'Results'
                  : timeWindow === 'upcoming' ? 'Upcoming Events' : timeWindow === 'past' ? 'Past Events' : 'All Events'}
              </h2>
              <span className="zine-sticker" style={{ background: '#14B87A', color: '#fff', transform: 'rotate(2deg)' }}>
                {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Event grid */}
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: '20px' }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="zine-border" style={{ background: '#fff' }}>
                      <Skeleton variant="rectangular" className="h-[120px] w-full !rounded-none" />
                      <div className="space-y-3 p-4">
                        <Skeleton variant="text" width="40%" />
                        <Skeleton variant="text" width="85%" />
                        <Skeleton variant="text" width="60%" />
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : error ? (
                <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center px-6 py-16 text-center zine-border" style={{ background: '#FFE9E3', boxShadow: '5px 5px 0 #14110E' }}>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
                    <AlertTriangle className="h-7 w-7 text-white" strokeWidth={2.5} />
                  </div>
                  <h3 className="mb-2 text-xl font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>Failed to load events</h3>
                  <p className="mb-6 max-w-sm text-sm font-semibold" style={{ color: '#4A4640' }}>{error}</p>
                  <button onClick={() => window.location.reload()} className="zine-btn zine-btn-accent uppercase">Try again</button>
                </motion.div>
              ) : filteredEvents.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center px-6 py-16 text-center zine-border" style={{ background: '#fff', boxShadow: '5px 5px 0 #14110E' }}>
                  <div className="mb-4 flex h-16 w-16 items-center justify-center" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
                    <Calendar className="h-7 w-7" strokeWidth={2.5} style={{ color: '#14110E' }} />
                  </div>
                  <h3 className="mb-2 text-xl font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>{searchQuery ? 'No matching events' : timeWindow === 'past' ? 'No past events' : timeWindow === 'upcoming' ? 'No upcoming events' : 'No events yet'}</h3>
                  <p className="max-w-sm text-sm font-semibold" style={{ color: '#4A4640' }}>
                    {searchQuery ? `Nothing matches "${searchQuery}". Try another search.` : selectedOrgId ? 'This club has no published events right now.' : timeWindow === 'past' ? 'No completed events to show yet.' : timeWindow === 'upcoming' ? 'No upcoming events. Check back soon or browse all events.' : 'No published events yet. Check back soon!'}
                  </p>
                </motion.div>
              ) : (
                <motion.div key="grid" initial="hidden" animate="visible"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: '20px' }}>
                  <AnimatePresence mode="popLayout">
                    {filteredEvents.map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </section>
    </div>
  )
}
