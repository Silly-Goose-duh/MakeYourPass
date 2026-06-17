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
  Zap,
} from 'lucide-react'
import { getPublishedEvents, getApprovedOrganizations } from '@/lib/supabase'
import type { CampusEvent, Organization } from '@/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
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

const FILTER_CATEGORIES = ['All events', 'Workshops', 'Hackathons', 'Talks', 'Competitions'] as const
type FilterCategory = (typeof FILTER_CATEGORIES)[number]

type EventWithOrg = CampusEvent & {
  organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'>
}

// Derive event category from title/description keywords
function getEventCategory(event: EventWithOrg): FilterCategory {
  const text = `${event.title} ${event.description || ''}`.toLowerCase()
  if (/hackathon|hack|hack-a-thon/.test(text)) return 'Hackathons'
  if (/workshop|build|learn|hands.?on|tutorial/.test(text)) return 'Workshops'
  if (/talk|seminar|guest|keynote|lecture/.test(text)) return 'Talks'
  if (/competition|contest|quiz|challenge|olympiad/.test(text)) return 'Competitions'
  return 'Workshops' // default fallback
}

// Club-specific colors for avatars
function getOrgAvatarStyle(name: string): { bg: string; text: string } {
  const n = name.toLowerCase()
  if (n.includes('foss') || n.includes('fsf')) return { bg: 'rgba(0,212,255,0.12)', text: '#00D4FF' }
  if (n.includes('iste')) return { bg: 'rgba(124,92,252,0.15)', text: '#C4B5FD' }
  if (n.includes('ieee')) return { bg: 'rgba(250,181,75,0.12)', text: '#FAB54B' }
  if (n.includes('nss') || n.includes('ncc')) return { bg: 'rgba(239,68,68,0.12)', text: '#EF4444' }
  if (n.includes('arts') || n.includes('music') || n.includes('dance') || n.includes('culture'))
    return { bg: 'rgba(236,72,153,0.12)', text: '#EC4899' }
  // Default to purple
  return { bg: 'rgba(124,92,252,0.12)', text: '#C4B5FD' }
}

// Club-specific banner gradients
function getOrgBannerGradient(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('foss') || n.includes('fsf'))
    return 'linear-gradient(135deg, #1A0F35, #2D1B69)'
  if (n.includes('iste')) return 'linear-gradient(135deg, #0E0B2E, #3B1B8C)'
  if (n.includes('ieee')) return 'linear-gradient(135deg, #1A1205, #3D2C0A)'
  if (n.includes('nss')) return 'linear-gradient(135deg, #1A0E0E, #3B1C1C)'
  if (n.includes('arts') || n.includes('culture')) return 'linear-gradient(135deg, #1A0E1A, #3B1C3B)'
  return 'linear-gradient(135deg, #0E0B2E, #1A0F35)'
}

// Club accent color for pulse dot
function getOrgAccentColor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('foss')) return '#00D4FF'
  if (n.includes('iste')) return '#C4B5FD'
  if (n.includes('ieee')) return '#FAB54B'
  if (n.includes('nss')) return '#EF4444'
  if (n.includes('arts')) return '#EC4899'
  return '#7C5CFC'
}

function getDaysAway(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDate = new Date(dateStr)
  eventDate.setHours(0, 0, 0, 0)
  const diffMs = eventDate.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Past event'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `${diffDays} days away`
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

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesOrg = !selectedOrgId || event.organization_id === selectedOrgId
      const matchesSearch =
        !searchQuery ||
        event.title.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter =
        activeFilter === 'All events' || getEventCategory(event) === activeFilter
      return matchesOrg && matchesSearch && matchesFilter
    })
  }, [events, selectedOrgId, searchQuery, activeFilter])

  const orgEventCounts = useMemo(
    () =>
      organizations.reduce(
        (acc, org) => {
          acc[org.id] = events.filter((e) => e.organization_id === org.id).length
          return acc
        },
        {} as Record<string, number>,
      ),
    [events, organizations],
  )

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      <div style={{ background: 'var(--color-cp-bg-base)', minHeight: '100vh' }}>
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
                <div
                  className="overflow-hidden rounded-2xl"
                  style={{
                    background: 'var(--color-cp-bg-surface)',
                    borderRight: '0.5px solid rgba(124,92,252,0.12)',
                  }}
                >
                  {/* Collapse toggle */}
                  <div
                    className="flex items-center justify-between px-5 py-4"
                    style={{ borderBottom: '0.5px solid rgba(124,92,252,0.12)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-5 w-5" style={{ color: 'var(--color-cp-accent-purple)' }} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-cp-text-primary)' }}>
                        Organizations
                      </span>
                    </div>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="rounded-lg p-1.5 transition-colors"
                      style={{ color: 'var(--color-cp-text-muted)' }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.1)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-primary)' }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' }}
                      title="Collapse sidebar"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Register Your Club — new gradient card */}
                  <div className="px-4 pt-4 pb-3">
                    <Link
                      to="/signup"
                      className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
                      style={{
                        background: 'linear-gradient(135deg, rgba(124,92,252,0.25), rgba(0,212,255,0.1))',
                        border: '1px solid rgba(124,92,252,0.35)',
                        borderRadius: '10px',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,92,252,0.6)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,92,252,0.35)' }}
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-white text-xs font-bold"
                        style={{ background: 'linear-gradient(135deg, #7C5CFC, #00D4FF)' }}
                      >
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--color-cp-text-primary)' }}>Register Your Club</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--color-cp-text-muted)' }}>Get your org on CampusPass</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--color-cp-accent-purple)' }} />
                    </Link>
                  </div>

                  {/* Org filter list */}
                  <div className="space-y-1 overflow-y-auto px-3 pb-3" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
                    <motion.button
                      variants={sidebarItemVariants}
                      initial="hidden"
                      animate="visible"
                      custom={0}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedOrgId(null)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
                      style={{
                        background: selectedOrgId === null ? 'rgba(124,92,252,0.15)' : 'transparent',
                        color: selectedOrgId === null ? 'var(--color-cp-accent-purple)' : 'var(--color-cp-text-muted)',
                      }}
                      onMouseEnter={e => { if (selectedOrgId !== null) { (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.1)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-primary)' } }}
                      onMouseLeave={e => { if (selectedOrgId !== null) { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' } }}
                    >
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(124,92,252,0.12)', color: '#7C5CFC' }}
                      >
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <span className="flex-1 font-medium">All Organizations</span>
                      {events.length > 0 && (
                        <span
                          className="px-2 py-0.5 text-xs"
                          style={{
                            background: 'rgba(124,92,252,0.25)',
                            color: '#9B7FFF',
                            borderRadius: '20px',
                          }}
                        >
                          {events.length}
                        </span>
                      )}
                    </motion.button>

                    {organizations.map((org, i) => {
                      const count = orgEventCounts[org.id] ?? 0
                      const avatarStyle = getOrgAvatarStyle(org.name)
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
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
                          style={{
                            background: selectedOrgId === org.id ? 'rgba(124,92,252,0.15)' : 'transparent',
                            color: selectedOrgId === org.id ? 'var(--color-cp-accent-purple)' : 'var(--color-cp-text-muted)',
                          }}
                          onMouseEnter={e => { if (selectedOrgId !== org.id) { (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.1)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-primary)' } }}
                          onMouseLeave={e => { if (selectedOrgId !== org.id) { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' } }}
                        >
                          <span
                            className="flex h-[22px] w-[22px] items-center justify-center rounded text-[10px] font-bold"
                            style={{ background: avatarStyle.bg, color: avatarStyle.text }}
                          >
                            {org.logo_url ? (
                              <img src={org.logo_url} alt="" className="h-full w-full object-cover rounded" />
                            ) : (
                              org.name.charAt(0)
                            )}
                          </span>
                          <span className="flex-1 truncate font-medium">{org.name}</span>
                          {count > 0 && (
                            <span
                              className="px-2 py-0.5 text-xs"
                              style={{
                                background: 'rgba(124,92,252,0.25)',
                                color: '#9B7FFF',
                                borderRadius: '20px',
                              }}
                            >
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
                className="rounded-xl p-2.5 transition-colors"
                style={{ border: '1px solid rgba(124,92,252,0.15)', background: 'var(--color-cp-bg-surface)', color: 'var(--color-cp-text-muted)' }}
                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'rgba(124,92,252,0.4)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-primary)' }}
                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(124,92,252,0.15)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' }}
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
                  className="rounded-lg p-2 transition-colors shrink-0"
                  style={{ border: '1px solid rgba(124,92,252,0.15)', background: 'var(--color-cp-bg-surface)', color: 'var(--color-cp-text-muted)' }}
                >
                  <Building2 className="h-4 w-4" />
                </button>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setSelectedOrgId(null)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-full transition-colors"
                    style={{
                      background: selectedOrgId === null ? 'rgba(124,92,252,0.2)' : 'var(--color-cp-bg-card)',
                      color: selectedOrgId === null ? '#C4B5FD' : 'var(--color-cp-text-faint)',
                      border: selectedOrgId === null ? '1px solid rgba(124,92,252,0.6)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <Sparkles className="h-3 w-3" />
                    All
                  </button>
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => setSelectedOrgId(org.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-full transition-colors"
                      style={{
                        background: selectedOrgId === org.id ? 'rgba(124,92,252,0.2)' : 'var(--color-cp-bg-card)',
                        color: selectedOrgId === org.id ? '#C4B5FD' : 'var(--color-cp-text-faint)',
                        border: selectedOrgId === org.id ? '1px solid rgba(124,92,252,0.6)' : '1px solid rgba(255,255,255,0.08)',
                      }}
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
                className="relative mb-6"
              >
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: 'var(--color-cp-text-faint)' }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events by title..."
                  style={{
                    background: 'var(--color-cp-bg-card)',
                    border: '1px solid rgba(124,92,252,0.2)',
                    borderRadius: '10px',
                    color: 'var(--color-cp-text-primary)',
                  }}
                  className="w-full py-3 pl-10 pr-4 text-sm outline-none transition-colors"
                  onFocus={e => { e.target.style.borderColor = 'rgba(124,92,252,0.6)'; e.target.style.background = 'rgba(15,22,41,0.9)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(124,92,252,0.2)'; e.target.style.background = 'var(--color-cp-bg-card)' }}
                />
              </motion.div>

              {/* ─── FILTER CHIPS ─── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
                className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
              >
                {FILTER_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveFilter(cat)}
                    className={`filter-chip ${activeFilter === cat ? 'active' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </motion.div>

              {/* "UPCOMING" section label */}
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: 'var(--color-cp-text-faint)' }}
                >
                  Upcoming
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(124,92,252,0.1)' }} />
                <span className="text-[10px]" style={{ color: 'var(--color-cp-text-faint)' }}>
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Event cards grid */}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="overflow-hidden rounded-xl"
                        style={{ background: 'var(--color-cp-bg-card)', border: '1px solid rgba(124,92,252,0.12)' }}
                      >
                        <Skeleton variant="rectangular" className="h-[90px] w-full !rounded-none" />
                        <div className="space-y-3 p-4">
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
                    className="flex flex-col items-center justify-center rounded-2xl px-6 py-20 text-center"
                    style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}
                  >
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.15)' }}>
                      <AlertTriangle className="h-6 w-6" style={{ color: '#EF4444' }} />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold" style={{ color: '#EF4444' }}>
                      Failed to load events
                    </h3>
                    <p className="mb-6 max-w-sm text-sm" style={{ color: 'var(--color-cp-text-muted)' }}>{error}</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="rounded-xl px-6 py-2.5 text-sm font-medium text-white transition-colors"
                      style={{ background: '#EF4444' }}
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
                    className="flex flex-col items-center justify-center rounded-2xl px-6 py-20 text-center"
                    style={{ border: '1px solid rgba(124,92,252,0.12)', background: 'rgba(124,92,252,0.03)' }}
                  >
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'var(--color-cp-bg-card)' }}>
                      <Calendar className="h-6 w-6" style={{ color: 'var(--color-cp-text-muted)' }} />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--color-cp-text-primary)' }}>
                      {searchQuery ? 'No matching events' : 'No events yet'}
                    </h3>
                    <p className="max-w-sm text-sm" style={{ color: 'var(--color-cp-text-muted)' }}>
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
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredEvents.map((event) => {
                        const orgName = event.organizations?.name ?? ''
                        const bannerGradient = getOrgBannerGradient(orgName)
                        const orgAccent = getOrgAccentColor(orgName)
                        const daysAway = event.date ? getDaysAway(event.date) : ''

                        return (
                          <motion.div
                            key={event.id}
                            layout
                            variants={itemVariants}
                            whileHover={{ y: -2 }}
                            transition={{ layout: { duration: 0.3 } }}
                            className="group relative overflow-hidden rounded-xl transition-all duration-150"
                            style={{
                              background: 'var(--color-cp-bg-card)',
                              border: '1px solid rgba(124,92,252,0.12)',
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,92,252,0.5)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,92,252,0.12)'}
                          >
                            <Link to={`/event/${event.slug}`} className="block">
                              {/* Banner area - 90px */}
                              <div
                                className="relative h-[90px] overflow-hidden"
                                style={{ background: bannerGradient }}
                              >
                                {/* Radial glow */}
                                <div
                                  className="absolute w-[120px] h-[120px] rounded-full opacity-40"
                                  style={{
                                    background: `radial-gradient(circle, ${orgAccent}33, transparent)`,
                                    top: '30%',
                                    left: '70%',
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                />
                                {/* Club name badge */}
                                <span
                                  className="absolute bottom-2 left-2 inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full"
                                  style={{
                                    background: getOrgAvatarStyle(orgName).bg,
                                    color: orgAccent,
                                  }}
                                >
                                  {orgName}
                                </span>
                              </div>

                              {/* Card body */}
                              <div className="p-3.5 space-y-2.5">
                                <h3
                                  className="text-[13px] font-bold leading-snug line-clamp-2 transition-colors"
                                  style={{ color: 'var(--color-cp-text-primary)' }}
                                >
                                  {event.title}
                                </h3>

                                {/* Meta rows */}
                                <div className="space-y-1.5">
                                  {event.date && (
                                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-cp-text-faint)' }}>
                                      <Calendar className="h-3 w-3 shrink-0" style={{ color: 'var(--color-cp-text-faint)' }} />
                                      <span>
                                        {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                                          weekday: 'short',
                                          month: 'short',
                                          day: 'numeric',
                                        })}
                                      </span>
                                    </div>
                                  )}
                                  {event.time && (
                                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-cp-text-faint)' }}>
                                      <Clock className="h-3 w-3 shrink-0" style={{ color: 'var(--color-cp-text-faint)' }} />
                                      <span>{event.time.substring(0, 5)}</span>
                                    </div>
                                  )}
                                  {event.venue && (
                                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-cp-text-faint)' }}>
                                      <MapPin className="h-3 w-3 shrink-0" style={{ color: 'var(--color-cp-text-faint)' }} />
                                      <span className="truncate">{event.venue}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Card footer */}
                                <div className="flex items-center justify-between pt-1.5" style={{ borderTop: '0.5px solid rgba(124,92,252,0.1)' }}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="pulse-dot" style={{ background: orgAccent }} />
                                    <span className="text-[10px]" style={{ color: 'var(--color-cp-text-faint)' }}>
                                      {daysAway}
                                    </span>
                                  </div>
                                  <span
                                    className="text-[11px] font-medium transition-colors"
                                    style={{ color: '#7C5CFC' }}
                                    onMouseEnter={e => (e.target as HTMLElement).style.color = '#C4B5FD'}
                                    onMouseLeave={e => (e.target as HTMLElement).style.color = '#7C5CFC'}
                                  >
                                    Register →
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
