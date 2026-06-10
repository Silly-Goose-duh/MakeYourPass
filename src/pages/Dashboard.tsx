import { useState, useEffect } from 'react'
import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { User } from '@supabase/supabase-js'
import {
  Sparkles, LayoutDashboard, Calendar, Ticket, BarChart3,
  Users, Settings, LogOut, Menu, X, Plus, Bell, Search,
  ChevronDown, CreditCard
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const sidebarLinks = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Events', href: '/dashboard/events', icon: Calendar },
  { label: 'Tickets', href: '/dashboard/tickets', icon: Ticket },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Attendees', href: '/dashboard/attendees', icon: Users },
  { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [orgName] = useState('My Organization')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login')
      else setUser(user)
    })
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-72 bg-surface border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-6 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-yellow-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-black" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-white">MakeYour</span>
              <span className="text-yellow-400">Pass</span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {sidebarLinks.map((link) => {
            const isActive = location.pathname === link.href
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                    : 'text-text-secondary hover:text-white hover:bg-white/5 border border-transparent'
                )}
              >
                <link.icon className="h-5 w-5 flex-shrink-0" />
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <Avatar name={user?.user_metadata?.full_name || 'User'} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.full_name || 'User'}
              </p>
              <p className="text-xs text-text-muted truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleSignOut}
            className="justify-start text-text-muted hover:text-red-400"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-2xl border-b border-border">
          <div className="flex items-center justify-between px-4 sm:px-6 h-16">
            {/* Left */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="lg:hidden p-2 text-text-secondary hover:text-white"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden sm:flex items-center gap-2">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search events..."
                  className="bg-transparent text-sm text-text-primary placeholder:text-text-muted border-none focus:outline-none w-48"
                />
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative p-2 text-text-secondary hover:text-white transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-yellow-400 rounded-full" />
              </button>
              <Link to="/dashboard/events/new">
                <Button variant="primary" size="sm" className="hidden sm:flex">
                  <Plus className="h-4 w-4" />
                  New Event
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet context={{ user, orgName }} />
        </main>
      </div>
    </div>
  )
}

// Dashboard Home
export function DashboardHome() {
  const [stats] = useState({
    totalEvents: 0,
    activeEvents: 0,
    totalTickets: 0,
    totalRevenue: 0,
    totalAttendees: 0,
  })

  const statCards = [
    { label: 'Total Events', value: stats.totalEvents, icon: Calendar, color: 'yellow' },
    { label: 'Active Events', value: stats.activeEvents, icon: Calendar, color: 'white' },
    { label: 'Tickets Sold', value: stats.totalTickets, icon: Ticket, color: 'yellow' },
    { label: 'Revenue', value: `₹${stats.totalRevenue}`, icon: BarChart3, color: 'white' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl"
    >
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-text-secondary">Welcome back! Here&apos;s your event overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'p-5 rounded-2xl border transition-all',
              stat.color === 'yellow'
                ? 'bg-yellow-400/10 border-yellow-400/30'
                : 'bg-surface border-border'
            )}
          >
            <div className={cn(
              'p-2 rounded-xl w-fit mb-3',
              stat.color === 'yellow' ? 'bg-yellow-400/20' : 'bg-white/5'
            )}>
              <stat.icon className={cn(
                'h-5 w-5',
                stat.color === 'yellow' ? 'text-yellow-400' : 'text-text-secondary'
              )} />
            </div>
            <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
            <p className="text-xs text-text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="glass-strong rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Link to="/dashboard/events/new">
            <div className="p-4 rounded-xl border border-dashed border-border hover:border-yellow-400/50 transition-colors cursor-pointer group">
              <Plus className="h-6 w-6 text-yellow-400 mb-2" />
              <p className="font-medium text-white group-hover:text-yellow-400 transition-colors">Create Event</p>
              <p className="text-xs text-text-muted mt-1">Set up a new event in minutes</p>
            </div>
          </Link>
          <Link to="/dashboard/tickets">
            <div className="p-4 rounded-xl border border-dashed border-border hover:border-yellow-400/50 transition-colors cursor-pointer group">
              <Ticket className="h-6 w-6 text-yellow-400 mb-2" />
              <p className="font-medium text-white group-hover:text-yellow-400 transition-colors">View Tickets</p>
              <p className="text-xs text-text-muted mt-1">Manage and verify tickets</p>
            </div>
          </Link>
          <Link to="/dashboard/analytics">
            <div className="p-4 rounded-xl border border-dashed border-border hover:border-yellow-400/50 transition-colors cursor-pointer group">
              <BarChart3 className="h-6 w-6 text-yellow-400 mb-2" />
              <p className="font-medium text-white group-hover:text-yellow-400 transition-colors">View Analytics</p>
              <p className="text-xs text-text-muted mt-1">Track performance and insights</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent events placeholder */}
      <div className="text-center py-16">
        <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
          <Calendar className="h-8 w-8 text-yellow-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No events yet</h3>
        <p className="text-text-secondary mb-6">Create your first event to get started</p>
        <Link to="/dashboard/events/new">
          <Button variant="primary">Create Your First Event</Button>
        </Link>
      </div>
    </motion.div>
  )
}