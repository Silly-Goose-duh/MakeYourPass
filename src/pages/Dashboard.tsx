import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import {
  Calendar, Settings, LogOut, Menu, Plus, Bell,
  Sparkles, Search
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const sidebarLinks = [
  { label: 'Events', href: '/dashboard/events', icon: Calendar },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [orgName] = useState('My Organization')
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed left */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="p-5 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-sm shadow-primary/30 overflow-hidden">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
              <Sparkles className="h-4 w-4 text-white relative z-10" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-text-primary">MakeYour</span>
              <span className="text-primary">Pass</span>
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
                    ? 'bg-primary-muted text-primary border border-primary/15 shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface border border-transparent'
                )}
              >
                <link.icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'text-primary')} />
                {link.label}
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3 px-1">
            <Avatar name={user?.user_metadata?.full_name || 'User'} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
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
            className="justify-start text-text-muted hover:text-error hover:bg-error/5"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main area — starts after sidebar */}
      <div className="flex-1 flex flex-col min-w-0 relative lg:ml-0">
        {/* Top bar — sticky, left-anchored */}
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-2xl border-b border-border">
          <div className="flex items-center justify-between px-6 h-16">
            {/* Left */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="lg:hidden p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden sm:flex items-center gap-2 bg-surface rounded-xl px-3 py-1.5 border border-border">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search events..."
                  className="bg-transparent text-sm text-text-primary placeholder:text-text-muted border-none focus:outline-none w-48"
                />
                <kbd className="hidden lg:inline-flex text-[10px] text-text-muted bg-surface px-1.5 py-0.5 rounded font-mono border border-border">⌘K</kbd>
              </div>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative p-2 text-text-secondary hover:text-text-primary transition-colors rounded-xl hover:bg-surface"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-secondary rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
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

        {/* Page content — left-anchored, full width */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <Outlet context={{ user, orgName }} />
        </main>
      </div>
    </div>
  )
}
