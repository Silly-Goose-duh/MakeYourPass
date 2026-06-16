import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Menu, X, User, LayoutDashboard, Shield, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, getUserOrganizations, signOut } from '@/lib/supabase'
import type { Profile, Organization } from '@/types'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (user) {
      getProfile(user.id).then(({ data }) => setProfile(data))
      getUserOrganizations().then(({ data }) => {
        if (data) setOrgs(data.map(m => m.organizations))
      })
    }
  }, [user])

  // Close profile dropdown on click outside
  useEffect(() => {
    if (!profileMenuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.profile-dropdown-area')) setProfileMenuOpen(false)
    }
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [profileMenuOpen])

  const isMc = location.pathname.startsWith('/mc')
  if (isMc) return null

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/'
  }

  const navLinks = [
    { label: 'Events', href: '/' },
  ]

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-surface/95 backdrop-blur-2xl border-b border-border'
          : 'bg-surface/80 backdrop-blur-lg border-transparent'
      }`}
    >
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <motion.div
              whileHover={{ scale: 1.05, rotate: -5 }}
              className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/25"
            >
              <Sparkles className="h-5 w-5 text-white relative z-10" />
            </motion.div>
            <div>
              <span className="text-lg font-bold font-display text-text-primary">
                Campus<span className="text-primary">Pass</span>
              </span>
              <p className="text-[10px] text-text-muted -mt-0.5 leading-none">Marian Engineering College</p>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === link.href ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                {profile?.is_superadmin && (
                  <Link
                    to="/mc"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                  >
                    <Shield className="h-3 w-3" />
                    MC Panel
                  </Link>
                )}
                {orgs.length > 0 && (
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    <LayoutDashboard className="h-3 w-3" />
                    Dashboard
                  </Link>
                )}
                {/* User profile button */}
                <div className="relative profile-dropdown-area">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border border-border hover:border-primary/30 hover:bg-surface transition-colors"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-violet-600 text-[10px] font-bold text-white">
                      {profile?.full_name
                        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                        : <User className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-xs font-medium text-text-primary max-w-[100px] truncate hidden sm:block">
                      {profile?.full_name || user.email?.split('@')[0] || 'User'}
                    </span>
                    <ChevronDown className={cn('h-3 w-3 text-text-muted transition-transform', profileMenuOpen && 'rotate-180')} />
                  </button>
                  <AnimatePresence>
                    {profileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <div className="p-1.5 space-y-0.5">
                          <div className="px-3 py-2 border-b border-border mb-1">
                            <p className="text-xs font-medium text-text-primary truncate">{profile?.full_name || 'User'}</p>
                            <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                          </div>
                          <Link
                            to="/dashboard"
                            onClick={() => setProfileMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                          >
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                          </Link>
                          {profile?.is_superadmin && (
                            <Link
                              to="/mc"
                              onClick={() => setProfileMenuOpen(false)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-amber-500/10 transition-colors"
                            >
                              <Shield className="h-4 w-4" />
                              MC Panel
                            </Link>
                          )}
                          <button
                            onClick={() => { handleSignOut(); setProfileMenuOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-error hover:bg-error/5 transition-colors"
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/signup"
                  className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Sign Up
                </Link>
                <Link
                  to="/login"
                  className="text-sm font-semibold px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors shadow-lg shadow-primary/25"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-b border-border bg-surface/95 backdrop-blur-2xl overflow-hidden"
          >
            <div className="px-4 py-4 space-y-3">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block text-sm font-medium transition-colors ${
                    location.pathname === link.href ? 'text-primary' : 'text-text-secondary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {user ? (
                <div className="space-y-2 pt-2 border-t border-border">
                  {profile?.is_superadmin && (
                    <Link to="/mc" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 text-sm text-amber-400 font-medium">
                      <Shield className="h-4 w-4" /> MC Panel
                    </Link>
                  )}
                  {orgs.length > 0 && (
                    <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 text-sm text-primary font-medium">
                      <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="flex items-center gap-2 text-sm text-text-secondary hover:text-error transition-colors">
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block text-center text-sm font-semibold px-4 py-2.5 rounded-xl bg-primary text-white"
                >
                  Sign In
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
