import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
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
import { formatDate, formatTime, cn } from '@/lib/utils'
import SplashScreen from '@/components/sections/SplashScreen'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: 'easeOut' as const },
  }),
}

type EventWithOrg = CampusEvent & {
  organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'>
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

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
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

  const filteredEvents = events.filter((event) => {
    const matchesOrg = !selectedOrgId || event.organization_id === selectedOrgId
    const matchesSearch =
      !searchQuery ||
      event.title.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesOrg && matchesSearch
  })

  const orgEventCounts = organizations.reduce(
    (acc, org) => {
      acc[org.id] = events.filter((e) => e.organization_id === org.id).length
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <>
      {/* Splash Screen — full viewport overlay */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* Main page content — hidden behind splash until it sweeps away */}
      <div className="min-h-screen bg-background">
        <section id="events-section" className="px-4 sm:px-6 pb-20 pt-6">
          <div className="flex gap-0 sm:gap-6">
            {/* ─── LEFT SIDEBAR ─── */}
            <motion.aside
              animate={{
                width: sidebarOpen ? 300 : 0,
                opacity: sidebarOpen ? 1 : 0,
                marginRight: sidebarOpen ? 0 : -12,
              }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className={cn(
                'hidden lg:block overflow-hidden flex-shrink-0',
                !sidebarOpen && 'pointer-events-none',
              )}
            >
              <div className="sticky top-6 w-[300px]">
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  {/* Collapse toggle */}
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-text-primary">
                        Organizations
                      </span>
                    </div>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
                      title="Collapse sidebar"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Register Your Club */}
                  <div className="px-4 pt-4 pb-3">
                    <Link
                      to="/signup"
                      className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary/15 to-violet-600/10 border border-primary/20 px-4 py-3 transition-all hover:from-primary/25 hover:to-violet-600/20 hover:border-primary/40"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white text-xs font-bold shadow-lg shadow-primary/25">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary">Register Your Club</p>
                        <p className="text-[11px] text-text-muted truncate">Get your org on CampusPass</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>

                  {/* Org filter list */}
                  <div className="space-y-1 overflow-y-auto px-3 pb-3 max-h-[calc(100vh-22rem)]">
                    <motion.button
                      variants={sidebarItemVariants}
                      initial="hidden"
                      animate="visible"
                      custom={0}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedOrgId(null)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                        selectedOrgId === null
                          ? 'bg-primary/10 text-primary'
                          : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                      )}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <span className="flex-1 font-medium">All Organizations</span>
                      {events.length > 0 && (
                        <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                          {events.length}
                        </span>
                      )}
                    </motion.button>

                    {organizations.map((org, i) => {
                      const count = orgEventCounts[org.id] ?? 0
                      return (
                        <motion.button
                          key={org.id}
                          variants={sidebarItemVariants}
                          initial="hidden"
                          animate="visible"
                          custom={i + 1}
                          whileHover={{ x: 4 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setSelectedOrgId(org.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                            selectedOrgId === org.id
                              ? 'bg-primary/10 text-primary'
                              : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
                          )}
                        >
                          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-surface-elevated text-xs font-bold text-text-muted">
                            {org.logo_url ? (
                              <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              org.name.charAt(0)
                            )}
                          </span>
                          <span className="flex-1 truncate font-medium">{org.name}</span>
                          {count > 0 && (
                            <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                              {count}
                            </span>
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.aside>

            {/* ─── LEFT SIDEBAR — collapsed re-open trigger ─── */}
            <motion.div
              animate={{ opacity: sidebarOpen ? 0 : 1, width: sidebarOpen ? 0 : 'auto' }}
              transition={{ duration: 0.3 }}
              className={cn(
                'hidden lg:flex items-start pt-4 flex-shrink-0 overflow-hidden',
                sidebarOpen && 'pointer-events-none',
              )}
            >
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-border bg-surface p-2.5 text-text-muted hover:text-text-primary hover:border-primary/30 transition-colors"
                title="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </motion.div>

            {/* ─── CENTER CONTENT ─── */}
            <main className="min-w-0 flex-1">
              {/* Mobile Org Filter + sidebar toggle */}
              <div className="mb-4 flex items-center gap-3 lg:hidden">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="rounded-lg border border-border bg-surface p-2 text-text-muted hover:text-text-primary transition-colors shrink-0"
                >
                  <Building2 className="h-4 w-4" />
                </button>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setSelectedOrgId(null)}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                      selectedOrgId === null
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-surface text-text-secondary border-border hover:border-primary/30',
                    )}
                  >
                    <Sparkles className="h-3 w-3" />
                    All
                  </button>
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => setSelectedOrgId(org.id)}
                      className={cn(
                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                        selectedOrgId === org.id
                          ? 'bg-primary/10 text-primary border-primary/30'
                          : 'bg-surface text-text-secondary border-border hover:border-primary/30',
                      )}
                    >
                      <Building2 className="h-3 w-3" />
                      {org.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search bar */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="relative mb-8"
              >
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events by title..."
                  className="w-full rounded-2xl border border-border bg-surface py-3.5 pl-12 pr-4 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
              </motion.div>

              {/* Event cards grid */}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="overflow-hidden rounded-2xl border border-border bg-surface"
                      >
                        <Skeleton variant="rectangular" className="h-44 w-full !rounded-none" />
                        <div className="space-y-3 p-5">
                          <Skeleton variant="text" width="35%" />
                          <Skeleton variant="text" width="80%" />
                          <Skeleton variant="text" width="60%" />
                          <div className="flex gap-4 pt-2">
                            <Skeleton variant="text" width="28%" />
                            <Skeleton variant="text" width="28%" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                ) : error ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center rounded-2xl border border-error/30 bg-error/5 px-6 py-20 text-center"
                  >
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error/15">
                      <AlertTriangle className="h-6 w-6 text-error" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-error">
                      Failed to load events
                    </h3>
                    <p className="mb-6 max-w-sm text-sm text-text-secondary">{error}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="rounded-xl bg-error px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error/90"
                    >
                      Try again
                    </button>
                  </motion.div>
                ) : filteredEvents.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface/50 px-6 py-20 text-center"
                  >
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated">
                      <Calendar className="h-6 w-6 text-text-muted" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-text-primary">
                      {searchQuery ? 'No matching events' : 'No events yet'}
                    </h3>
                    <p className="max-w-sm text-sm text-text-secondary">
                      {searchQuery
                        ? `No events match "${searchQuery}". Try a different search term.`
                        : selectedOrgId
                          ? 'This organization has no published events at the moment.'
                          : 'There are no published events yet. Check back later!'}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="grid"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredEvents.map((event) => (
                        <motion.div
                          key={event.id}
                          layout
                          variants={itemVariants}
                          whileHover={{ y: -4, scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          transition={{ layout: { duration: 0.3 } }}
                          className="group relative overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-light"
                        >
                          <Link to={`/event/${event.slug}`} className="block">
                            <div className="relative h-44 overflow-hidden bg-surface-elevated">
                              {event.poster_url ? (
                                <>
                                  <img
                                    src={event.poster_url}
                                    alt={event.title}
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
                                </>
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                                    <Calendar className="h-8 w-8 text-primary/40" />
                                  </div>
                                </div>
                              )}
                              <div className="absolute left-3 top-3">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-md">
                                  <Building2 className="h-3 w-3" />
                                  {event.organizations?.name ?? 'Unknown'}
                                </span>
                              </div>
                            </div>

                            <div className="p-5">
                              <h3 className="mb-3 line-clamp-2 text-base font-semibold leading-snug text-text-primary group-hover:text-primary transition-colors">
                                {event.title}
                              </h3>
                              <div className="mb-4 space-y-2">
                                {event.date && (
                                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                                    <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>{formatDate(event.date)}</span>
                                  </div>
                                )}
                                {event.time && (
                                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>{formatTime(event.time)}</span>
                                  </div>
                                )}
                                {event.venue && (
                                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span className="truncate">{event.venue}</span>
                                  </div>
                                )}
                              </div>
                              <div className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                                Register
                                <span className="text-lg leading-none transition-transform group-hover:translate-x-0.5">
                                  →
                                </span>
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
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
