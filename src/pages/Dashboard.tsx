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
    // ProtectedRoute wrapper will auto-redirect to /login via auth listener
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
