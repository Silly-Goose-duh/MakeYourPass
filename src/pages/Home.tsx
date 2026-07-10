import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Building2,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
  AlertTriangle,
  PanelLeftClose,
  PanelLeft,
  ArrowRight,
} from 'lucide-react'
import { getPublishedEvents, getApprovedOrganizations } from '@/lib/supabase'
import type { CampusEvent, Organization } from '@/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import SplashScreen from '@/components/sections/SplashScreen'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: 'easeOut' as const },
  }),
}

const FILTER_CATEGORIES = ['All events', 'Workshops', 'Hackathons', 'Talks', 'Competitions'] as const
type FilterCategory = (typeof FILTER_CATEGORIES)[number]

type EventWithOrg = CampusEvent & {
  organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'>
}

// Zine accent palette rotated per card for a collage feel
const ZINE_COLORS = ['#FF4D2E', '#2D5BFF', '#14B87A', '#E84AC4', '#FFD23F']
function zineColorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return ZINE_COLORS[h % ZINE_COLORS.length]
}

function getEventCategory(event: EventWithOrg): FilterCategory {
  const text = `${event.title} ${event.description || ''}`.toLowerCase()
  if (/hackathon|hack|hack-a-thon/.test(text)) return 'Hackathons'
  if (/workshop|build|learn|hands.?on|tutorial/.test(text)) return 'Workshops'
  if (/talk|seminar|guest|keynote|lecture/.test(text)) return 'Talks'
  if (/competition|contest|quiz|challenge|olympiad/.test(text)) return 'Competitions'
  return 'Workshops'
}

function getDaysAway(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const eventDate = new Date(dateStr); eventDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'Past'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `${diffDays} days`
}

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true)
  const [events, setEvents] = useState<EventWithOrg[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All events')

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
        if (message.includes('RLS_RECURSION')) {
          setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
        } else {
          setError(message)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesOrg = !selectedOrgId || event.organization_id === selectedOrgId
      const matchesSearch = !searchQuery || event.title.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = activeFilter === 'All events' || getEventCategory(event) === activeFilter
      return matchesOrg && matchesSearch && matchesFilter
    })
  }, [events, selectedOrgId, searchQuery, activeFilter])

  const orgEventCounts = useMemo(
    () => organizations.reduce((acc, org) => {
      acc[org.id] = events.filter((e) => e.organization_id === org.id).length
      return acc
    }, {} as Record<string, number>),
    [events, organizations],
  )

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      <div style={{ background: 'var(--color-cp-bg-base)', minHeight: '100vh' }}>
        {/* ─── HERO BAND ─── */}
        <section className="relative overflow-hidden" style={{ borderBottom: '2.5px solid #14110E', background: '#FFD23F' }}>
          <div className="px-4 sm:px-6 py-10 sm:py-14 relative">
            <span className="zine-sticker" style={{ background: '#FF4D2E', color: '#fff', transform: 'rotate(-3deg)' }}>
              ★ Discover campus life
            </span>
            <h1
              className="mt-4 font-extrabold tracking-tighter"
              style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(2.25rem, 8.5vw, 6rem)', lineHeight: 0.9, color: '#14110E' }}
            >
              GET YOUR <span className="text-outline">PASS.</span><br />
              SHOW UP. <span style={{ color: '#FF4D2E' }}>DONE.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base sm:text-lg font-semibold" style={{ color: '#14110E' }}>
              Every workshop, hackathon, talk & competition at Marian Engineering College — in one loud little place.
            </p>
          </div>
          {/* Marquee ticker */}
          <div className="overflow-hidden" style={{ borderTop: '2.5px solid #14110E', background: '#14110E' }}>
            <div className="zine-marquee py-2">
              {Array.from({ length: 2 }).map((_, r) => (
                <span key={r} className="flex shrink-0">
                  {['WORKSHOPS', 'HACKATHONS', 'TALKS', 'COMPETITIONS', 'FESTS', 'CLUBS'].map((w) => (
                    <span key={w + r} className="mx-6 text-sm font-extrabold uppercase tracking-widest" style={{ fontFamily: 'Syne, sans-serif', color: '#FFD23F' }}>
                      {w} <span style={{ color: '#FF4D2E' }}>✦</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="events-section" className="px-4 sm:px-6 pb-20 pt-8">
          <div className="flex gap-0 sm:gap-6">
            {/* ─── SIDEBAR ─── */}
            <motion.aside
              animate={{ width: sidebarOpen ? 300 : 0, opacity: sidebarOpen ? 1 : 0, marginRight: sidebarOpen ? 0 : -12 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className={cn('hidden lg:block overflow-hidden flex-shrink-0', !sidebarOpen && 'pointer-events-none')}
            >
              <div className="sticky top-24 w-[300px]">
                <div className="zine-border" style={{ background: '#fff', boxShadow: '5px 5px 0 #14110E' }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '2.5px solid #14110E', background: '#2D5BFF' }}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                      <span className="text-sm font-extrabold uppercase tracking-wide text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Organizations</span>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="p-1 text-white" title="Collapse sidebar">
                      <PanelLeftClose className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Register CTA */}
                  <div className="px-3 pt-3 pb-2">
                    <Link to="/signup" className="group flex items-center gap-3 px-3 py-3" style={{ background: '#FFD23F', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E' }}>
                      <div className="flex h-9 w-9 items-center justify-center text-white" style={{ background: '#FF4D2E', border: '2px solid #14110E' }}>
                        <Building2 className="h-4 w-4" strokeWidth={2.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold" style={{ color: '#14110E', fontFamily: 'Syne, sans-serif' }}>Register Your Club</p>
                        <p className="text-[11px] font-semibold truncate" style={{ color: '#4A4640' }}>Get on CampusPass</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" strokeWidth={2.5} style={{ color: '#14110E' }} />
                    </Link>
                  </div>

                  {/* Org list */}
                  <div className="space-y-1.5 overflow-y-auto px-3 pb-3" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
                    <motion.button
                      variants={sidebarItemVariants} initial="hidden" animate="visible" custom={0}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedOrgId(null)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
                      style={{
                        border: '2px solid #14110E',
                        background: selectedOrgId === null ? '#FF4D2E' : '#fff',
                        color: selectedOrgId === null ? '#fff' : '#14110E',
                        boxShadow: selectedOrgId === null ? '3px 3px 0 #14110E' : 'none',
                        fontFamily: 'Syne, sans-serif', fontWeight: 800,
                      }}
                    >
                      <Sparkles className="h-4 w-4" strokeWidth={2.5} />
                      <span className="flex-1">All Organizations</span>
                      {events.length > 0 && (
                        <span className="px-2 text-xs" style={{ border: '2px solid currentColor', fontWeight: 800 }}>{events.length}</span>
                      )}
                    </motion.button>

                    {organizations.map((org, i) => {
                      const count = orgEventCounts[org.id] ?? 0
                      const active = selectedOrgId === org.id
                      const c = zineColorFor(org.name)
                      return (
                        <motion.button
                          key={org.id}
                          variants={sidebarItemVariants} initial="hidden" animate="visible" custom={i + 1}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setSelectedOrgId(org.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
                          style={{
                            border: '2px solid #14110E',
                            background: active ? c : '#fff',
                            color: active ? '#fff' : '#14110E',
                            boxShadow: active ? '3px 3px 0 #14110E' : 'none',
                            fontFamily: 'Syne, sans-serif', fontWeight: 700,
                          }}
                        >
                          <span className="flex h-6 w-6 items-center justify-center text-[11px] font-extrabold" style={{ background: active ? '#fff' : c, color: active ? c : '#fff', border: '2px solid #14110E' }}>
                            {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : org.name.charAt(0)}
                          </span>
                          <span className="flex-1 truncate">{org.name}</span>
                          {count > 0 && <span className="px-2 text-xs" style={{ border: '2px solid currentColor', fontWeight: 800 }}>{count}</span>}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.aside>

            {/* Collapsed re-open trigger */}
            <motion.div
              animate={{ opacity: sidebarOpen ? 0 : 1, width: sidebarOpen ? 0 : 'auto' }}
              transition={{ duration: 0.3 }}
              className={cn('hidden lg:flex items-start pt-1 flex-shrink-0 overflow-hidden', sidebarOpen && 'pointer-events-none')}
            >
              <button onClick={() => setSidebarOpen(true)} className="p-2.5" style={{ border: '2.5px solid #14110E', background: '#fff', boxShadow: '3px 3px 0 #14110E', color: '#14110E' }} title="Expand sidebar">
                <PanelLeft className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </motion.div>

            {/* ─── CENTER ─── */}
            <main className="min-w-0 flex-1">
              {/* Mobile org filter */}
              <div className="mb-4 flex items-center gap-2 lg:hidden overflow-x-auto pb-1 scrollbar-none">
                <button onClick={() => setSelectedOrgId(null)} className="filter-chip shrink-0" style={selectedOrgId === null ? { background: '#FF4D2E', color: '#fff' } : {}}>All</button>
                {organizations.map((org) => (
                  <button key={org.id} onClick={() => setSelectedOrgId(org.id)} className="filter-chip shrink-0" style={selectedOrgId === org.id ? { background: '#FF4D2E', color: '#fff' } : {}}>{org.name}</button>
                ))}
              </div>

              {/* Search */}
              <div className="relative mb-5">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" strokeWidth={2.5} style={{ color: '#14110E' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="SEARCH EVENTS..."
                  className="w-full py-3.5 pl-12 pr-4 text-sm font-bold outline-none"
                  style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E', color: '#14110E', fontFamily: 'Syne, sans-serif' }}
                />
              </div>

              {/* Filter chips */}
              <div className="mb-6 flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                {FILTER_CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => setActiveFilter(cat)} className={`filter-chip ${activeFilter === cat ? 'active' : ''}`}>{cat}</button>
                ))}
              </div>

              {/* Section header */}
              <div className="mb-5 flex items-end justify-between">
                <h2 className="font-extrabold uppercase tracking-tight" style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', color: '#14110E' }}>
                  {searchQuery || activeFilter !== 'All events' || selectedOrgId ? 'Results' : 'All Events'}
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
                    <h3 className="mb-2 text-xl font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>{searchQuery ? 'No matching events' : 'No events yet'}</h3>
                    <p className="max-w-sm text-sm font-semibold" style={{ color: '#4A4640' }}>
                      {searchQuery ? `Nothing matches "${searchQuery}". Try another search.` : selectedOrgId ? 'This club has no published events right now.' : 'No published events yet. Check back soon!'}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="grid" variants={containerVariants} initial="hidden" animate="visible"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: '20px' }}>
                    <AnimatePresence mode="popLayout">
                      {filteredEvents.map((event) => {
                        const orgName = event.organizations?.name ?? ''
                        const c = zineColorFor(orgName || event.title)
                        const daysAway = event.date ? getDaysAway(event.date) : ''
                        return (
                          <motion.div key={event.id} layout variants={itemVariants} transition={{ layout: { duration: 0.3 } }} className="zine-card group relative">
                            <Link to={`/event/${event.slug}`} className="block">
                              {/* Poster band */}
                              <div className="relative h-[120px] overflow-hidden flex items-center justify-center" style={{ background: c, borderBottom: '2.5px solid #14110E' }}>
                                <span className="text-outline font-extrabold" style={{ fontFamily: 'Syne, sans-serif', fontSize: '3.5rem', opacity: 0.35, WebkitTextStrokeColor: '#14110E' }}>
                                  {orgName.charAt(0) || '★'}
                                </span>
                                <span className="zine-sticker absolute bottom-2 left-2" style={{ background: '#fff' }}>{orgName || 'Event'}</span>
                                <span className="absolute top-0 right-0 px-2 py-1 text-[10px] font-extrabold uppercase text-white" style={{ background: '#14110E', fontFamily: 'Syne, sans-serif' }}>{daysAway}</span>
                              </div>
                              {/* Body */}
                              <div className="p-4 space-y-3">
                                <h3 className="text-base font-extrabold leading-tight line-clamp-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>{event.title}</h3>
                                <div className="space-y-1.5">
                                  {event.date && (
                                    <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#4A4640' }}>
                                      <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                                      <span>{new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                    </div>
                                  )}
                                  {event.time && (
                                    <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#4A4640' }}>
                                      <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /><span>{event.time.substring(0, 5)}</span>
                                    </div>
                                  )}
                                  {event.venue && (
                                    <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#4A4640' }}>
                                      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /><span className="truncate">{event.venue}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center justify-between pt-2" style={{ borderTop: '2px solid #14110E' }}>
                                  <span className="pulse-dot" style={{ background: c }} />
                                  <span className="inline-flex items-center gap-1 text-xs font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#FF4D2E' }}>
                                    Register <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </div>
        </section>
      </div>
    </>
  )
}
