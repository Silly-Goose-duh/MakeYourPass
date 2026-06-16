import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Building2, Calendar, MapPin, Clock, Sparkles } from 'lucide-react'
import { getPublishedEvents, getApprovedOrganizations } from '@/lib/supabase'
import type { CampusEvent, Organization } from '@/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate, formatTime, cn } from '@/lib/utils'

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
  const [events, setEvents] = useState<EventWithOrg[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setError(err instanceof Error ? err.message : 'Something went wrong')
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
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden px-6 pt-24 pb-16 text-center">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute left-1/3 top-1/3 h-64 w-64 rounded-full bg-secondary/5 blur-2xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' as const }}
          className="relative z-10 mx-auto px-6"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' as const }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-1.5 text-sm text-text-secondary"
          >
            <Sparkles className="h-4 w-4 text-secondary" />
            <span>Discover campus life</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          >
            <span className="gradient-text">CampusPass</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mb-3 text-lg font-medium text-text-primary/90 sm:text-xl"
          >
            Marian Engineering College's Official Event Platform
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mx-auto px-6 text-base text-text-secondary sm:text-lg"
          >
            Discover and register for events hosted by clubs and departments
            across campus.
          </motion.p>
        </motion.div>
      </section>

      <section className="px-6 pb-20">
        <div className="flex gap-8">
          <aside className="hidden w-[260px] flex-shrink-0 lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-text-primary">
                  Organizations
                </span>
              </div>

              <div className="space-y-1 overflow-y-auto p-3">
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
                  <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                    {events.length}
                  </span>
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
                          <img
                            src={org.logo_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          org.name.charAt(0)
                        )}
                      </span>
                      <span className="flex-1 truncate font-medium">
                        {org.name}
                      </span>
                      <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                        {count}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            {/* Mobile Org Filter */}
            <div className="mb-4 lg:hidden">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                <button
                  onClick={() => setSelectedOrgId(null)}
                  className={cn(
                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                    selectedOrgId === null
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-surface text-text-secondary border-border hover:border-primary/30'
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                  All
                </button>
                {organizations.map(org => (
                  <button
                    key={org.id}
                    onClick={() => setSelectedOrgId(org.id)}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                      selectedOrgId === org.id
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-surface text-text-secondary border-border hover:border-primary/30'
                    )}
                  >
                    <Building2 className="h-3 w-3" />
                    {org.name}
                  </button>
                ))}
              </div>
            </div>

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
                  className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 py-20 text-center"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error/10">
                    <Clock className="h-6 w-6 text-error" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-text-primary">
                    Something went wrong
                  </h3>
                  <p className="mb-6 max-w-sm text-sm text-text-secondary">
                    {error}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
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
                  className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 py-20 text-center"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated">
                    <Search className="h-6 w-6 text-text-muted" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-text-primary">
                    No events found
                  </h3>
                  <p className="max-w-sm text-sm text-text-secondary">
                    {searchQuery
                      ? `No events match "${searchQuery}". Try a different search term.`
                      : selectedOrgId
                        ? 'This organization has no published events yet.'
                        : 'There are no published events at the moment. Check back later!'}
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
                        transition={{
                          layout: { duration: 0.3 },
                        }}
                        className="group relative overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-light"
                      >
                        <Link
                          to={`/event/${event.slug}`}
                          className="block"
                        >
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
  )
}
