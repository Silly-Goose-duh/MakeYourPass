import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Calendar, Eye, BarChart3, Edit, ExternalLink, Sparkles, Building2, Clock, CheckCircle, Users, QrCode, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Card, CardContent } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn, formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, getUserOrganizations, getEventsByOrganization } from '@/lib/supabase'
import type { Profile, CampusEvent, Organization } from '@/types'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
}

export function OrgDashboard() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [activeTab, setActiveTab] = useState('active')
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false)

  const selectedOrg = organizations.find(o => o.id === selectedOrgId)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: profileData } = await getProfile(user!.id)
      if (profileData) setProfile(profileData)

      const { data: memberships } = await getUserOrganizations()
      if (memberships && memberships.length > 0) {
        const orgs = memberships.map(m => m.organizations)
        setOrganizations(orgs)
        setSelectedOrgId(orgs[0].id)
      }
    })()
  }, [user])

  useEffect(() => {
    if (!selectedOrgId) return
    const timer = setTimeout(() => setLoadingTimeout(true), 8000)
    getEventsByOrganization(selectedOrgId, 'all').then(({ data, error }) => {
      if (error?.message?.includes('RLS_RECURSION')) {
        setLoading(false)
        return
      }
      if (data) setEvents(data)
      clearTimeout(timer)
      setLoading(false)
    }).catch(() => {
      clearTimeout(timer)
      setLoading(false)
    })
    return () => clearTimeout(timer)
  }, [selectedOrgId])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const filteredEvents = events.filter(event => {
    const hasDate = !!event.date
    const eventDate = event.date ? new Date(event.date) : null
    const isToday = eventDate && eventDate.getTime() === today.getTime()
    const isFuture = eventDate && eventDate > today
    const isPast = eventDate && eventDate < today
    switch (activeTab) {
      case 'active':
        return event.status === 'published' && (!hasDate || isToday)
      case 'upcoming':
        return event.status === 'published' && isFuture
      case 'past':
        return event.status === 'published' && isPast
      case 'drafts':
        return event.status === 'draft'
      default:
        return true
    }
  })

  async function copyFormLink(slug: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/event/${slug}`)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = `${window.location.origin}/event/${slug}`
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!loading && organizations.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full px-6 sm:px-10"
      >
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-20 w-20 rounded-2xl bg-surface border border-border flex items-center justify-center mb-6">
            <Building2 className="h-10 w-10 text-text-muted" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            You're not part of any organization yet
          </h2>
          <p className="text-text-secondary max-w-md mb-8">
            Create or request to join an organization to start managing events and registrations.
          </p>
          <Link to="/signup">
            <Button variant="primary" size="lg">
              <Plus className="h-5 w-5" />
              Create Organization
            </Button>
          </Link>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full px-6 sm:px-10"
    >
      {/* Superadmin Banner */}
      {profile?.is_superadmin && (
        <motion.div
          variants={itemVariants}
          className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-primary/15 via-accent-rose/10 to-primary/5 border border-primary/20 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Superadmin Access</p>
              <p className="text-xs text-text-muted">You have full platform control</p>
            </div>
          </div>
          <Link to="/mc">
            <Button variant="primary" size="sm">
              Management Console
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
            Organization Dashboard
          </h1>
          <p className="text-text-secondary text-sm">
            Manage events across your organizations
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Org Selector */}
          {organizations.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-text-primary hover:border-primary/40 transition-colors"
              >
                <Building2 className="h-4 w-4 text-text-muted" />
                <span className="max-w-[140px] truncate">{selectedOrg?.name}</span>
                <svg className={`h-4 w-4 text-text-muted transition-transform ${orgDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {orgDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOrgDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-64 z-20 bg-surface border border-border rounded-xl shadow-2xl shadow-black/30 overflow-hidden">
                    {organizations.map(org => (
                      <button
                        key={org.id}
                        onClick={() => {
                          setSelectedOrgId(org.id)
                          setOrgDropdownOpen(false)
                        }}
                        className={cn(
                          'w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-3',
                          org.id === selectedOrgId
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                        )}
                      >
                        <Building2 className="h-4 w-4 shrink-0" />
                        <span className="truncate">{org.name}</span>
                        {org.id === selectedOrgId && (
                          <CheckCircle className="h-3.5 w-3.5 ml-auto shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <Link to="/dashboard/events/new">
            <Button variant="primary" size="sm">
              <Plus className="h-4 w-4" />
              Create Event
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Org Info Card */}
        <motion.div variants={itemVariants} className="lg:w-72 shrink-0">
          <Card variant="default" padding="md" className="sticky top-24">
            <CardContent>
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-violet-600/20 border border-primary/20 flex items-center justify-center mb-4 mx-auto">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary text-center mb-1">
                {selectedOrg?.name || (organizations.length > 0 ? organizations[0]?.name : 'Your Organization')}
              </h3>
              {selectedOrg?.slug && (
                <p className="text-xs text-text-muted text-center mb-4 font-mono">
                  @{selectedOrg.slug}
                </p>
              )}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Members
                  </span>
                  <span className="text-text-primary font-medium">
                    {selectedOrg?.member_count ?? '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Events
                  </span>
                  <span className="text-text-primary font-medium">{events.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Published
                  </span>
                  <span className="text-text-primary font-medium">
                    {events.filter(e => e.status === 'published').length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right: Events */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <motion.div variants={itemVariants}>
            <Tabs defaultValue="active" value={activeTab} onChange={(v) => setActiveTab(v)} variant="pills">
              <TabsList className="mb-6">
                <TabsTrigger value="active" icon={<Calendar className="h-4 w-4" />}>
                  Active
                </TabsTrigger>
                <TabsTrigger value="upcoming" icon={<Clock className="h-4 w-4" />}>
                  Upcoming
                </TabsTrigger>
                <TabsTrigger value="past" icon={<CheckCircle className="h-4 w-4" />}>
                  Past
                </TabsTrigger>
                <TabsTrigger value="drafts" icon={<Edit className="h-4 w-4" />}>
                  Drafts
                </TabsTrigger>
              </TabsList>

              {/* Loading State */}
              {loading && (
                <div>
                  {loadingTimeout ? (
                    <div className="text-center py-20">
                      <div className="h-16 w-16 rounded-2xl bg-surface border border-border mx-auto mb-4 flex items-center justify-center">
                        <Clock className="h-8 w-8 text-text-muted" />
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary mb-1">Taking longer than expected</h3>
                      <p className="text-text-secondary text-sm mb-6">Events are still loading. You can try refreshing.</p>
                      <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
                        Refresh Page
                      </Button>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
                          <Skeleton variant="rectangular" className="h-32 sm:h-36 w-full !rounded-none" />
                          <div className="p-4 space-y-3">
                            <Skeleton variant="text" width="80%" />
                            <Skeleton variant="text" width="50%" />
                            <div className="flex gap-2 pt-2">
                              <Skeleton variant="text" width="30%" />
                              <Skeleton variant="text" width="30%" />
                              <Skeleton variant="text" width="30%" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Events Grid */}
              {!loading && (
                <AnimatePresence mode="wait">
                  {filteredEvents.length === 0 ? (
                    <motion.div
                      key={activeTab + '_empty'}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="text-center py-20"
                    >
                      <div className="h-16 w-16 rounded-2xl bg-surface border border-border mx-auto mb-4 flex items-center justify-center">
                        {activeTab === 'drafts' ? (
                          <Edit className="h-8 w-8 text-text-muted" />
                        ) : (
                          <Calendar className="h-8 w-8 text-text-muted" />
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary mb-1">
                        {activeTab === 'active' && 'No active events'}
                        {activeTab === 'upcoming' && 'No upcoming events'}
                        {activeTab === 'past' && 'No past events'}
                        {activeTab === 'drafts' && 'No draft events'}
                      </h3>
                      <p className="text-text-secondary text-sm mb-6">
                        {activeTab === 'drafts'
                          ? 'Start creating an event and save it as a draft.'
                          : 'Create your first published event to see it here.'}
                      </p>
                      <Link to="/dashboard/events/new">
                        <Button variant="primary" size="sm">
                          <Plus className="h-4 w-4" />
                          Create Event
                        </Button>
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={activeTab}
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4"
                    >
                      {filteredEvents.map(event => (
                        <motion.div key={event.id} variants={itemVariants} layout>
                          <Card variant="default" hover className="group h-full overflow-hidden">
                            {/* Poster / Gradient Placeholder */}
                            <div className="relative h-32 sm:h-36 overflow-hidden">
                              {event.poster_url ? (
                                <img
                                  src={event.poster_url}
                                  alt={event.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-surface to-accent-rose/10" />
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />

                              {/* Status Badge */}
                              <div className="absolute top-3 left-3">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider',
                                    event.status === 'published' && 'bg-success/20 text-success border border-success/30',
                                    event.status === 'draft' && 'bg-secondary/20 text-secondary border border-secondary/30',
                                    event.status === 'cancelled' && 'bg-error/20 text-error border border-error/30',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'h-1.5 w-1.5 rounded-full',
                                      event.status === 'published' && 'bg-success',
                                      event.status === 'draft' && 'bg-secondary',
                                      event.status === 'cancelled' && 'bg-error',
                                    )}
                                  />
                                  {event.status}
                                </span>
                              </div>

                              {/* Response Count */}
                              <div className="absolute top-3 right-3">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-black/40 backdrop-blur-sm text-text-secondary border border-white/10">
                                  <Users className="h-3 w-3" />
                                  {event.response_count}
                                </span>
                              </div>
                            </div>

                            <CardContent className="p-4">
                              {/* Title */}
                              <h3 className="text-sm font-semibold text-text-primary mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                                {event.title}
                              </h3>

                              {/* Date & Venue */}
                              <div className="space-y-1 mb-3">
                                {event.date && (
                                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                                    <Calendar className="h-3 w-3 shrink-0" />
                                    <span>{formatDate(event.date)}</span>
                                    {event.time && (
                                      <>
                                        <span className="text-border">·</span>
                                        <Clock className="h-3 w-3 shrink-0" />
                                        <span>{event.time}</span>
                                      </>
                                    )}
                                  </div>
                                )}
                                {event.venue && (
                                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                                    <Building2 className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{event.venue}</span>
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-border">
                                <Link
                                  to={`/event/${event.slug}`}
                                  target="_blank"
                                  className="flex-1 min-w-[4.5rem]"
                                >
                                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                                    <Eye className="h-3.5 w-3.5" />
                                    View
                                  </Button>
                                </Link>
                                <Link
                                  to={`/dashboard/events/${event.id}/analytics`}
                                  className="flex-1 min-w-[4.5rem]"
                                >
                                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                    Stats
                                  </Button>
                                </Link>
                                <Link
                                  to={`/host/${event.id}/dashboard`}
                                  className="flex-1 min-w-[4.5rem]"
                                >
                                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                                    <LayoutDashboard className="h-3.5 w-3.5" />
                                    Live
                                  </Button>
                                </Link>
                                <Link
                                  to={`/host/${event.id}/scan`}
                                  className="flex-1 min-w-[4.5rem]"
                                >
                                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                                    <QrCode className="h-3.5 w-3.5" />
                                    Scan
                                  </Button>
                                </Link>
                                <Link
                                  to={`/dashboard/events/${event.id}/edit`}
                                  className="flex-1 min-w-[4.5rem]"
                                >
                                  <Button variant="ghost" size="sm" fullWidth className="text-xs">
                                    <Edit className="h-3.5 w-3.5" />
                                    Edit
                                  </Button>
                                </Link>
                                <button
                                  onClick={() => copyFormLink(event.slug)}
                                  className={cn(
                                    'flex-1 min-w-[4.5rem] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border',
                                    copiedSlug === event.slug
                                      ? 'bg-success/20 text-success border-success/30'
                                      : 'bg-surface text-text-secondary border-border hover:text-text-primary hover:border-primary/30'
                                  )}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {copiedSlug === event.slug ? 'Copied!' : 'Link'}
                                </button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </Tabs>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
