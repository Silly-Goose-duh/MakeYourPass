import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, CheckCircle, XCircle, Clock, Building2, Calendar, Users,
  BarChart3, Search, ArrowLeft, Loader2,
  Eye, AlertTriangle, RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { cn, formatDate, formatDateTime, truncate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  getProfile, getPendingRequests, approveRequest, rejectRequest,
  getAllEvents, getOrganizationsWithCounts,
  getAllProfiles, signOut
} from '@/lib/supabase'
import type { Profile, Organization, CampusEvent } from '@/types'

interface PendingRequest {
  id: string
  organization_name: string
  organization_slug: string
  description: string | null
  profiles: { full_name: string; email: string } | null
  created_at: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
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

const statusConfig: Record<string, { variant: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
  approved: { variant: 'success', label: 'Approved' },
  pending: { variant: 'warning', label: 'Pending' },
  rejected: { variant: 'error', label: 'Rejected' },
  published: { variant: 'success', label: 'Published' },
  draft: { variant: 'warning', label: 'Draft' },
  cancelled: { variant: 'error', label: 'Cancelled' },
}

export function MCPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null)

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgSearch, setOrgSearch] = useState('')

  const [events, setEvents] = useState<(CampusEvent & { organizations: Pick<Organization, 'name'> })[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventSearch, setEventSearch] = useState('')
  const [eventStatusFilter, setEventStatusFilter] = useState('all')
  const [selectedEvent, setSelectedEvent] = useState<(CampusEvent & { organizations: Pick<Organization, 'name'> }) | null>(null)
  const [eventModalOpen, setEventModalOpen] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: profileData } = await getProfile(user!.id)
      if (profileData) setProfile(profileData)
      setLoading(false)
    })()
  }, [user])

  useEffect(() => {
    loadPendingRequests()
    loadOrganizations()
    loadEvents()
    loadProfiles()
  }, [])

  async function loadPendingRequests() {
    setRequestsLoading(true)
    const { data, error } = await getPendingRequests()
    if (error?.message?.includes('RLS_RECURSION')) {
      setToast({ message: 'Database configuration needed. Please apply the SQL fix in the Supabase dashboard.', type: 'error' })
    } else if (data) {
      setPendingRequests(data as unknown as PendingRequest[])
    }
    setRequestsLoading(false)
  }

  async function loadOrganizations() {
    setOrgsLoading(true)
    const { data, error } = await getOrganizationsWithCounts()
    if (error?.message?.includes('RLS_RECURSION')) {
      setToast({ message: 'Database configuration needed. Please apply the SQL fix in the Supabase dashboard.', type: 'error' })
    } else if (data) {
      setOrganizations(data)
    }
    setOrgsLoading(false)
  }

  async function loadEvents() {
    setEventsLoading(true)
    const { data, error } = await getAllEvents()
    if (error?.message?.includes('RLS_RECURSION')) {
      setToast({ message: 'Database configuration needed. Please apply the SQL fix in the Supabase dashboard.', type: 'error' })
    } else if (data) {
      setEvents(data)
    }
    setEventsLoading(false)
  }

  async function loadProfiles() {
    const { data, error } = await getAllProfiles()
    if (error?.message?.includes('RLS_RECURSION')) {
      setToast({ message: 'Database configuration needed. Please apply the SQL fix in the Supabase dashboard.', type: 'error' })
    } else if (data) {
      setProfiles(data)
    }
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleConfirmAction() {
    if (!confirmId || !confirmAction) return
    setActionLoading(confirmId)
    if (confirmAction === 'approve') {
      const { error } = await approveRequest(confirmId)
      if (error) {
        showToast('Failed to approve request', 'error')
      } else {
        showToast('Organization approved successfully!')
        loadPendingRequests()
        loadOrganizations()
      }
    } else {
      const { error } = await rejectRequest(confirmId)
      if (error) {
        showToast('Failed to reject request', 'error')
      } else {
        showToast('Request rejected')
        loadPendingRequests()
      }
    }
    setActionLoading(null)
    setConfirmId(null)
    setConfirmAction(null)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
    org.slug.toLowerCase().includes(orgSearch.toLowerCase())
  )

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(eventSearch.toLowerCase()) ||
      (event.organizations?.name || '').toLowerCase().includes(eventSearch.toLowerCase())
    const matchesStatus = eventStatusFilter === 'all' || event.status === eventStatusFilter
    return matchesSearch && matchesStatus
  })

  const totalResponses = events.reduce((sum, e) => sum + (e.response_count || 0), 0)
  const pendingCount = pendingRequests.length
  const totalOrgs = organizations.filter(o => o.is_approved).length
  const totalEvents = events.length

  const recentActivity = [
    ...events.slice(0, 5).map(e => ({
      id: e.id,
      type: 'event' as const,
      text: `New event "${e.title}" created`,
      time: e.created_at,
    })),
    ...pendingRequests.slice(0, 5).map(r => ({
      id: r.id,
      type: 'request' as const,
      text: `Registration request for "${r.organization_name}"`,
      time: r.created_at,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8)

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Shield className="h-12 w-12 text-secondary animate-pulse" />
          <div className="h-8 w-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              'fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-sm font-medium',
              toast.type === 'success'
                ? 'bg-success/15 text-success border border-success/25'
                : 'bg-error/15 text-error border border-error/25'
            )}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <Modal
        isOpen={!!confirmId}
        onClose={() => { setConfirmId(null); setConfirmAction(null) }}
        title={confirmAction === 'approve' ? 'Approve Organization' : 'Reject Request'}
        size="sm"
      >
        <p className="text-text-secondary mb-6">
          {confirmAction === 'approve'
            ? 'This will create the organization and notify the requester. Are you sure?'
            : 'This will reject the registration request and notify the requester. Are you sure?'}
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => { setConfirmId(null); setConfirmAction(null) }}
          >
            Cancel
          </Button>
          <Button
            variant={confirmAction === 'approve' ? 'primary' : 'danger'}
            onClick={handleConfirmAction}
            loading={actionLoading === confirmId}
          >
            {confirmAction === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </Modal>

      {/* Event Detail Modal */}
      <Modal
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title={selectedEvent?.title || 'Event Details'}
        size="lg"
      >
        {selectedEvent && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Organization</p>
                <p className="text-text-primary font-medium">{selectedEvent.organizations?.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Status</p>
                <Badge variant={statusConfig[selectedEvent.status]?.variant || 'default'} size="sm">
                  {statusConfig[selectedEvent.status]?.label || selectedEvent.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Date</p>
                <p className="text-text-primary">{selectedEvent.date ? formatDate(selectedEvent.date) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Time</p>
                <p className="text-text-primary">{selectedEvent.time || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Venue</p>
                <p className="text-text-primary">{selectedEvent.venue || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Responses</p>
                <p className="text-text-primary font-semibold">{selectedEvent.response_count || 0}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Form Type</p>
                <p className="text-text-primary capitalize">{selectedEvent.form_type}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Payment</p>
                <p className="text-text-primary capitalize">
                  {selectedEvent.payment_type}
                  {selectedEvent.payment_type === 'paid' && selectedEvent.price && ` (₹${selectedEvent.price})`}
                </p>
              </div>
            </div>
            {selectedEvent.description && (
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Description</p>
                <p className="text-text-secondary text-sm">{selectedEvent.description}</p>
              </div>
            )}
            <div className="flex items-center gap-3 pt-2">
              <Link to={`/event/${selectedEvent.slug}`} target="_blank">
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                  View Public Page
                </Button>
              </Link>
              <p className="text-xs text-text-muted">
                Created {formatDateTime(selectedEvent.created_at)}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-2xl border-b border-border">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm hidden sm:inline">Back to CampusPass</span>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2.5">
                <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-secondary to-amber-600 flex items-center justify-center shadow-sm shadow-secondary/30 overflow-hidden">
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 to-transparent" />
                  <Shield className="h-4 w-4 text-white relative z-10" />
                </div>
                <span className="text-base font-bold">
                  <span className="gradient-text-accent">CampusPass</span>
                  <span className="text-text-primary ml-1">MC</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {profile && (
                <div className="hidden sm:flex items-center gap-2.5">
                  <div className="text-right">
                    <p className="text-sm font-medium text-text-primary">{profile.full_name}</p>
                    <p className="text-xs text-text-muted">Superadmin</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-secondary">
                      {profile.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-text-muted hover:text-error">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {/* Page Header */}
          <motion.div variants={itemVariants} className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">
              Master Control
            </h1>
            <p className="text-text-secondary text-sm">
              Full platform oversight — manage organizations, events, and registration requests.
            </p>
          </motion.div>

          <Tabs defaultValue="requests" variant="pills">
            <motion.div variants={itemVariants}>
              <TabsList className="mb-8">
                <TabsTrigger value="requests" icon={<Clock className="h-4 w-4" />}>
                  Requests
                  {pendingRequests.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-secondary text-white rounded-full">
                      {pendingRequests.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="organizations" icon={<Building2 className="h-4 w-4" />}>
                  Organizations
                </TabsTrigger>
                <TabsTrigger value="events" icon={<Calendar className="h-4 w-4" />}>
                  Events
                </TabsTrigger>
                <TabsTrigger value="overview" icon={<BarChart3 className="h-4 w-4" />}>
                  Overview
                </TabsTrigger>
              </TabsList>
            </motion.div>

            {/* ============= TAB 1: REQUESTS ============= */}
            <TabsContent value="requests">
              <motion.div variants={containerVariants} initial="hidden" animate="visible">
                {/* Section Header */}
                <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">Registration Requests</h2>
                    <p className="text-text-secondary text-sm">
                      {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadPendingRequests}
                    loading={requestsLoading}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </motion.div>

                {requestsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 text-secondary animate-spin" />
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <motion.div variants={itemVariants} className="text-center py-24">
                    <div className="h-20 w-20 rounded-2xl bg-surface border border-border mx-auto mb-6 flex items-center justify-center">
                      <CheckCircle className="h-10 w-10 text-success/60" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">All caught up</h3>
                    <p className="text-text-secondary text-sm max-w-md mx-auto">
                      All organization registration requests have been reviewed. New requests will appear here.
                    </p>
                  </motion.div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
                      {pendingRequests.map((request) => (
                        <motion.div
                          key={request.id}
                          variants={itemVariants}
                          layout
                          className="bg-surface border border-border rounded-2xl p-5 sm:p-6 hover:border-secondary/20 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1.5">
                                <h3 className="text-lg font-semibold text-text-primary truncate">
                                  {request.organization_name}
                                </h3>
                                <Badge variant="warning" size="sm">Pending</Badge>
                              </div>
                              <p className="text-sm text-text-muted font-mono mb-2">
                                @{request.organization_slug}
                              </p>
                              {request.description && (
                                <p className="text-sm text-text-secondary mb-3 line-clamp-2">
                                  {request.description}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                                <span className="flex items-center gap-1.5">
                                  <Users className="h-3.5 w-3.5" />
                                  {request.profiles?.full_name || 'Unknown'}
                                </span>
                                {request.profiles?.email && (
                                  <span>{request.profiles.email}</span>
                                )}
                                <span className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatDateTime(request.created_at)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => { setConfirmId(request.id); setConfirmAction('approve') }}
                                loading={actionLoading === request.id && confirmAction === 'approve'}
                              >
                                <CheckCircle className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => { setConfirmId(request.id); setConfirmAction('reject') }}
                                loading={actionLoading === request.id && confirmAction === 'reject'}
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                )}
              </motion.div>
            </TabsContent>

            {/* ============= TAB 2: ORGANIZATIONS ============= */}
            <TabsContent value="organizations">
              <motion.div variants={containerVariants} initial="hidden" animate="visible">
                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">All Organizations</h2>
                    <p className="text-text-secondary text-sm">{organizations.length} total</p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Search organizations..."
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-secondary/50 transition-colors"
                    />
                  </div>
                </motion.div>

                {orgsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 text-secondary animate-spin" />
                  </div>
                ) : filteredOrgs.length === 0 ? (
                  <motion.div variants={itemVariants} className="text-center py-24">
                    <div className="h-20 w-20 rounded-2xl bg-surface border border-border mx-auto mb-6 flex items-center justify-center">
                      <Building2 className="h-10 w-10 text-text-muted" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">
                      {orgSearch ? 'No organizations match your search' : 'No organizations yet'}
                    </h3>
                  </motion.div>
                ) : (
                  <div className="hidden sm:block">
                    <motion.div variants={itemVariants} className="bg-surface border border-border rounded-2xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Name</th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Slug</th>
                            <th className="text-center px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Members</th>
                            <th className="text-center px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Events</th>
                            <th className="text-center px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                            <th className="text-right px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Created</th>
                            <th className="text-right px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredOrgs.map((org, idx) => (
                            <motion.tr
                              key={org.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              className="hover:bg-white/[0.02] transition-colors"
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-secondary/20 to-amber-600/20 border border-secondary/20 flex items-center justify-center shrink-0">
                                    <Building2 className="h-4 w-4 text-secondary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-text-primary">{org.name}</p>
                                    {org.description && (
                                      <p className="text-xs text-text-muted truncate max-w-[200px]">{org.description}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-text-muted font-mono">@{org.slug}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-sm font-medium text-text-primary">{org.member_count ?? '-'}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-sm font-medium text-text-primary">{org.event_count ?? '-'}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <Badge
                                  variant={org.is_approved ? 'success' : 'warning'}
                                  size="sm"
                                  dot
                                >
                                  {org.is_approved ? 'Approved' : 'Pending'}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="text-sm text-text-muted">{formatDate(org.created_at)}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Link to="/dashboard" className="inline-flex">
                                  <Button variant="ghost" size="sm" className="text-xs">
                                    <Eye className="h-3.5 w-3.5" />
                                    <span className="hidden lg:inline">View Events</span>
                                  </Button>
                                </Link>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  </div>
                )}

                {/* Mobile cards */}
                {!orgsLoading && filteredOrgs.length > 0 && (
                  <div className="sm:hidden space-y-3">
                    {filteredOrgs.map((org, idx) => (
                      <motion.div
                        key={org.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="bg-surface border border-border rounded-2xl p-4"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-secondary/20 to-amber-600/20 border border-secondary/20 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-secondary" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-primary">{org.name}</p>
                              <p className="text-xs text-text-muted font-mono">@{org.slug}</p>
                            </div>
                          </div>
                          <Badge
                            variant={org.is_approved ? 'success' : 'warning'}
                            size="sm"
                            dot
                          >
                            {org.is_approved ? 'Approved' : 'Pending'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-text-muted mb-3">
                          <span>{org.member_count ?? '-'} members</span>
                          <span>{org.event_count ?? '-'} events</span>
                          <span>{formatDate(org.created_at)}</span>
                        </div>
                        <Link to="/dashboard">
                          <Button variant="ghost" size="sm" fullWidth className="text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            View Events
                          </Button>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </TabsContent>

            {/* ============= TAB 3: EVENTS ============= */}
            <TabsContent value="events">
              <motion.div variants={containerVariants} initial="hidden" animate="visible">
                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">All Events</h2>
                    <p className="text-text-secondary text-sm">{events.length} total</p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <input
                        type="text"
                        placeholder="Search events..."
                        value={eventSearch}
                        onChange={(e) => setEventSearch(e.target.value)}
                        className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-secondary/50 transition-colors"
                      />
                    </div>
                    <select
                      value={eventStatusFilter}
                      onChange={(e) => setEventStatusFilter(e.target.value)}
                      className="bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-secondary/50 transition-colors"
                    >
                      <option value="all">All Status</option>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </motion.div>

                {eventsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 text-secondary animate-spin" />
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <motion.div variants={itemVariants} className="text-center py-24">
                    <div className="h-20 w-20 rounded-2xl bg-surface border border-border mx-auto mb-6 flex items-center justify-center">
                      <Calendar className="h-10 w-10 text-text-muted" />
                    </div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">
                      {eventSearch || eventStatusFilter !== 'all' ? 'No events match your filters' : 'No events yet'}
                    </h3>
                  </motion.div>
                ) : (
                  <div className="hidden sm:block">
                    <motion.div variants={itemVariants} className="bg-surface border border-border rounded-2xl overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Event</th>
                            <th className="text-left px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Organization</th>
                            <th className="text-center px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                            <th className="text-center px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Responses</th>
                            <th className="text-center px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Date</th>
                            <th className="text-right px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider">Created</th>
                            <th className="text-right px-6 py-4 text-xs font-semibold text-text-muted uppercase tracking-wider"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredEvents.map((event, idx) => (
                            <motion.tr
                              key={event.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.02 }}
                              className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                              onClick={() => { setSelectedEvent(event); setEventModalOpen(true) }}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-violet-600/20 border border-primary/20 flex items-center justify-center shrink-0">
                                    <Calendar className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-text-primary">{truncate(event.title, 40)}</p>
                                    {event.venue && (
                                      <p className="text-xs text-text-muted">{truncate(event.venue, 30)}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-text-secondary">
                                  {event.organizations?.name || 'Unknown'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <Badge
                                  variant={statusConfig[event.status]?.variant || 'default'}
                                  size="sm"
                                  dot
                                >
                                  {statusConfig[event.status]?.label || event.status}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-sm font-medium text-text-primary">{event.response_count || 0}</span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="text-sm text-text-muted">
                                  {event.date ? formatDate(event.date) : '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="text-sm text-text-muted">{formatDate(event.created_at)}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs"
                                  onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); setEventModalOpen(true) }}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  </div>
                )}

                {/* Mobile cards */}
                {!eventsLoading && filteredEvents.length > 0 && (
                  <div className="sm:hidden space-y-3">
                    {filteredEvents.map((event, idx) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="bg-surface border border-border rounded-2xl p-4 cursor-pointer hover:border-secondary/20 transition-colors"
                        onClick={() => { setSelectedEvent(event); setEventModalOpen(true) }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{event.title}</p>
                            <p className="text-xs text-text-muted">{event.organizations?.name || 'Unknown'}</p>
                          </div>
                          <Badge
                            variant={statusConfig[event.status]?.variant || 'default'}
                            size="sm"
                            dot
                          >
                            {statusConfig[event.status]?.label || event.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                          <span>{event.response_count || 0} responses</span>
                          {event.date && <span>{formatDate(event.date)}</span>}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </TabsContent>

            {/* ============= TAB 4: OVERVIEW ============= */}
            <TabsContent value="overview">
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
                {/* Stats Cards */}
                <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Organizations', value: totalOrgs, icon: Building2, accent: 'from-secondary/20 to-amber-600/20 border-secondary/20', iconColor: 'text-secondary' },
                    { label: 'Total Events', value: totalEvents, icon: Calendar, accent: 'from-primary/20 to-violet-600/20 border-primary/20', iconColor: 'text-primary' },
                    { label: 'Total Responses', value: totalResponses, icon: Users, accent: 'from-accent-teal/20 to-emerald-600/20 border-accent-teal/20', iconColor: 'text-accent-teal' },
                    { label: 'Pending Requests', value: pendingCount, icon: Clock, accent: 'from-accent-rose/20 to-red-600/20 border-accent-rose/20', iconColor: 'text-accent-rose' },
                  ].map((stat) => (
                    <Card key={stat.label} variant="default" padding="md" className="relative overflow-hidden">
                      <CardContent>
                        <div className="flex items-start justify-between mb-3">
                          <div className={cn('h-10 w-10 rounded-xl bg-gradient-to-br border flex items-center justify-center', stat.accent)}>
                            <stat.icon className={cn('h-5 w-5', stat.iconColor)} />
                          </div>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-text-primary mb-1">{stat.value}</p>
                        <p className="text-xs text-text-muted">{stat.label}</p>
                      </CardContent>
                      <div className={cn(
                        'absolute -bottom-4 -right-4 h-20 w-20 rounded-full opacity-[0.04]',
                        stat.label === 'Total Organizations' && 'bg-secondary',
                        stat.label === 'Total Events' && 'bg-primary',
                        stat.label === 'Total Responses' && 'bg-accent-teal',
                        stat.label === 'Pending Requests' && 'bg-accent-rose'
                      )} />
                    </Card>
                  ))}
                </motion.div>

                {/* Two column layout */}
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Recent Activity */}
                  <motion.div variants={itemVariants}>
                    <Card variant="default" padding="md">
                      <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                        <CardDescription>Latest events and requests across the platform</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {recentActivity.length === 0 ? (
                          <p className="text-center py-8 text-sm text-text-muted">No recent activity</p>
                        ) : (
                          <div className="space-y-3">
                            {recentActivity.map((activity) => (
                              <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.02] transition-colors">
                                <div className={cn(
                                  'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                                  activity.type === 'event'
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-secondary/10 text-secondary'
                                )}>
                                  {activity.type === 'event' ? (
                                    <Calendar className="h-4 w-4" />
                                  ) : (
                                    <Building2 className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-text-primary">{activity.text}</p>
                                  <p className="text-xs text-text-muted mt-0.5">{formatDateTime(activity.time)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Quick Actions */}
                  <motion.div variants={itemVariants}>
                    <Card variant="default" padding="md">
                      <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>Common superadmin tasks</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Link to="/dashboard">
                          <Button variant="outline" size="md" fullWidth className="justify-start">
                            <Building2 className="h-4 w-4" />
                            Browse Organizations
                          </Button>
                        </Link>
                        <Link to="/dashboard/events/new">
                          <Button variant="outline" size="md" fullWidth className="justify-start">
                            <Calendar className="h-4 w-4" />
                            Create Event (as any org)
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="md"
                          fullWidth
                          className="justify-start"
                          onClick={loadPendingRequests}
                        >
                          <Clock className="h-4 w-4" />
                          Refresh Pending Requests
                          {pendingCount > 0 && (
                            <span className="ml-auto px-2 py-0.5 text-[10px] font-bold bg-secondary text-white rounded-full">
                              {pendingCount}
                            </span>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="md"
                          fullWidth
                          className="justify-start"
                          onClick={() => navigate('/')}
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Back to CampusPass
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Admin Info */}
                    <Card variant="default" padding="md" className="mt-4">
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-secondary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text-primary">
                              {profile?.full_name || 'Superadmin'}
                            </p>
                            <p className="text-xs text-text-muted">
                              {profile?.email || user?.email || ''}
                            </p>
                          </div>
                          <span className="ml-auto px-2.5 py-1 rounded-lg bg-secondary/10 border border-secondary/20 text-[11px] font-semibold text-secondary uppercase tracking-wider">
                            Superadmin
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </div>
              </motion.div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  )
}
