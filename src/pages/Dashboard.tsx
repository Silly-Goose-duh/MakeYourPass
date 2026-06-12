import { useState, useEffect } from 'react'
import { Link, useNavigate, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { User } from '@supabase/supabase-js'
import {
  LayoutDashboard, Calendar, Ticket, BarChart3,
  Users, Settings, LogOut, Menu, X, Plus, Bell,
  Sparkles, Zap, TrendingUp, ArrowRight, Rocket, Search
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardContent } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const sidebarLinks = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Events', href: '/dashboard/events', icon: Calendar },
  { label: 'Tickets', href: '/dashboard/tickets', icon: Ticket },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Attendees', href: '/dashboard/attendees', icon: Users },
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
    <div className="flex h-screen overflow-hidden bg-black">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-400/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent-pink/5 rounded-full blur-[120px]" />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/70 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-72 bg-black/90 backdrop-blur-2xl border-r border-white/10 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-yellow-400 to-accent-pink flex items-center justify-center shadow-lg shadow-yellow-400/30 overflow-hidden">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
              <Sparkles className="h-4 w-4 text-black relative z-10" />
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
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-yellow-400/15 to-accent-pink/10 text-yellow-400 border border-yellow-400/20 shadow-[0_0_20px_rgba(245,215,0,0.08)]'
                    : 'text-text-secondary hover:text-white hover:bg-white/[0.04] border border-transparent'
                )}
              >
                <link.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'drop-shadow-[0_0_8px_rgba(245,215,0,0.5)]')} />
                {link.label}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(245,215,0,0.8)]" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3 px-1">
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
            className="justify-start text-text-muted hover:text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-black/60 backdrop-blur-2xl border-b border-white/10">
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
              <div className="hidden sm:flex items-center gap-2 bg-white/[0.04] rounded-xl px-3 py-1.5 border border-white/5">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search events..."
                  className="bg-transparent text-sm text-text-primary placeholder:text-text-muted border-none focus:outline-none w-48"
                />
                <kbd className="hidden lg:inline-flex text-[10px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative p-2 text-text-secondary hover:text-white transition-colors rounded-xl hover:bg-white/[0.04]"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(245,215,0,0.8)]" />
              </button>
              <Link to="/dashboard/events/new">
                <Button variant="gradient" size="sm" glow className="hidden sm:flex">
                  <Plus className="h-4 w-4" />
                  New Event
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
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
    { label: 'Total Events', value: String(stats.totalEvents), icon: Calendar, glow: 'yellow' as const, glass: 'glass-yellow' as const },
    { label: 'Active Events', value: String(stats.activeEvents), icon: Zap, glow: 'pink' as const, glass: 'glass-pink' as const },
    { label: 'Tickets Sold', value: String(stats.totalTickets), icon: Ticket, glow: 'cyan' as const, glass: 'glass-cyan' as const },
    { label: 'Revenue', value: stats.totalRevenue === 0 ? '₹0' : `₹${stats.totalRevenue}`, icon: TrendingUp, glow: 'yellow' as const, glass: 'glass-yellow' as const },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl"
    >
      {/* Welcome section with gradient accent */}
      <div className="mb-8 relative">
        <div className="absolute -top-6 -left-6 w-32 h-32 bg-yellow-400/5 rounded-full blur-[60px] pointer-events-none" />
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
          <Badge variant="yellow" size="sm" className="text-[10px]">
            <Zap className="h-3 w-3 mr-1" />
            Free Plan
          </Badge>
        </div>
        <p className="text-text-secondary">Welcome back! Your event empire awaits.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {statCards.map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card variant={stat.glass as any} padding="md" glow={stat.glow} className="group">
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <div className={cn(
                    'p-2 rounded-xl transition-all duration-300 group-hover:scale-110',
                    stat.glow === 'yellow' && 'bg-yellow-400/20 text-yellow-400',
                    stat.glow === 'pink' && 'bg-accent-pink/20 text-accent-pink',
                    stat.glow === 'cyan' && 'bg-accent-cyan/20 text-accent-cyan',
                  )}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white mb-0.5">{stat.value}</p>
                <p className="text-xs text-text-muted">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick actions — game-like */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-yellow-400" />
          Quick Actions
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Link to="/dashboard/events/new">
            <div className="group relative p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-yellow-400/10 to-transparent hover:from-yellow-400/20 hover:border-yellow-400/40 transition-all duration-300 cursor-pointer overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Plus className="h-7 w-7 text-yellow-400 mb-3 relative z-10 group-hover:scale-110 transition-transform" />
              <p className="font-semibold text-white group-hover:text-yellow-400 transition-colors relative z-10">Create Event</p>
              <p className="text-xs text-text-muted mt-1 relative z-10">Set up a new event in minutes</p>
              <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-yellow-400/50 group-hover:text-yellow-400 group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
          <Link to="/dashboard/tickets">
            <div className="group relative p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-accent-pink/10 to-transparent hover:from-accent-pink/20 hover:border-accent-pink/40 transition-all duration-300 cursor-pointer overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-pink/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Ticket className="h-7 w-7 text-accent-pink mb-3 relative z-10 group-hover:scale-110 transition-transform" />
              <p className="font-semibold text-white group-hover:text-accent-pink transition-colors relative z-10">View Tickets</p>
              <p className="text-xs text-text-muted mt-1 relative z-10">Manage and verify tickets</p>
              <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-accent-pink/50 group-hover:text-accent-pink group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
          <Link to="/dashboard/analytics">
            <div className="group relative p-5 rounded-2xl border border-white/10 bg-gradient-to-br from-accent-cyan/10 to-transparent hover:from-accent-cyan/20 hover:border-accent-cyan/40 transition-all duration-300 cursor-pointer overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <BarChart3 className="h-7 w-7 text-accent-cyan mb-3 relative z-10 group-hover:scale-110 transition-transform" />
              <p className="font-semibold text-white group-hover:text-accent-cyan transition-colors relative z-10">View Analytics</p>
              <p className="text-xs text-text-muted mt-1 relative z-10">Track performance and insights</p>
              <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-accent-cyan/50 group-hover:text-accent-cyan group-hover:translate-x-1 transition-all" />
            </div>
          </Link>
        </div>
      </div>

      {/* Empty state — encourage first event */}
      <div className="relative text-center py-16 px-6 rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-yellow-400/5 rounded-full blur-[80px]" />
        <div className="relative">
          <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-yellow-400/20 to-accent-pink/20 mx-auto mb-5 flex items-center justify-center shadow-[0_0_30px_rgba(245,215,0,0.1)]">
            <Calendar className="h-9 w-9 text-yellow-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">No events yet</h3>
          <p className="text-text-secondary mb-8 max-w-md mx-auto">
            Your first event is just a few clicks away. Create one now and start selling tickets in minutes.
          </p>
          <Link to="/dashboard/events/new">
            <Button variant="gradient" size="lg" glow className="group">
              <Rocket className="h-5 w-5 group-hover:-translate-y-0.5 transition-transform" />
              Create Your First Event
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  )
}
