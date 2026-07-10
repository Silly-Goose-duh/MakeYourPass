import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, User, LayoutDashboard, Shield, LogOut, ChevronDown, Zap } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, getUserOrganizations, signOut } from '@/lib/supabase'
import type { Profile, Organization } from '@/types'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { user } = useAuth()
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
      className="glass sticky top-0 z-50 transition-all duration-200"
      style={{
        borderBottom: scrolled
          ? '0.5px solid rgba(139,92,246,0.30)'
          : '0.5px solid rgba(139,92,246,0.14)',
        boxShadow: scrolled ? '0 4px 24px rgba(0,0,0,0.35)' : 'none',
      }}
    >
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div
              className="h-[30px] w-[30px] rounded-lg flex items-center justify-center"
              style={{ background: 'var(--gradient-brand)', boxShadow: '0 2px 10px rgba(139,92,246,0.4)' }}
            >
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <span className="text-[13px] font-bold" style={{ color: 'var(--color-cp-text-primary)' }}>
                CampusPass
              </span>
              <p className="text-[10px] -mt-0.5 leading-none" style={{ color: 'var(--color-cp-text-muted)' }}>
                Marian Engineering College
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="text-[12px] font-medium transition-colors duration-150"
                style={{
                  color: location.pathname === link.href ? 'var(--color-cp-accent-purple)' : 'var(--color-cp-text-muted)',
                }}
                onMouseEnter={e => { if (location.pathname !== link.href) (e.target as HTMLElement).style.color = '#C4B5FD' }}
                onMouseLeave={e => { if (location.pathname !== link.href) (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' }}
              >
                {link.label}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                {profile?.is_superadmin && (
                  <Link
                    to="/mc"
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}
                  >
                    <Shield className="h-3 w-3" />
                    MC Panel
                  </Link>
                )}
                {orgs.length > 0 && (
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(124,92,252,0.1)', color: '#7C5CFC', border: '1px solid rgba(124,92,252,0.2)' }}
                  >
                    <LayoutDashboard className="h-3 w-3" />
                    Dashboard
                  </Link>
                )}
                {/* User profile button */}
                <div className="relative profile-dropdown-area">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg transition-colors"
                    style={{ border: '1px solid rgba(124,92,252,0.2)' }}
                    onMouseEnter={e => (e.target as HTMLElement).style.borderColor = 'rgba(124,92,252,0.4)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.borderColor = 'rgba(124,92,252,0.2)'}
                  >
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold text-white"
                      style={{ background: 'var(--gradient-brand)' }}
                    >
                      {profile?.full_name
                        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                        : <User className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-xs font-medium max-w-[100px] truncate hidden sm:block" style={{ color: 'var(--color-cp-text-primary)' }}>
                      {profile?.full_name || user.email?.split('@')[0] || 'User'}
                    </span>
                    <ChevronDown className={cn('h-3 w-3 transition-transform', profileMenuOpen && 'rotate-180')} style={{ color: 'var(--color-cp-text-muted)' }} />
                  </button>
                  <AnimatePresence>
                    {profileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-xl z-50 overflow-hidden"
                        style={{ background: 'var(--color-cp-bg-surface)', border: '1px solid rgba(124,92,252,0.15)' }}
                      >
                        <div className="p-1.5 space-y-0.5">
                          <div className="px-3 py-2 mb-1" style={{ borderBottom: '1px solid rgba(124,92,252,0.15)' }}>
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--color-cp-text-primary)' }}>{profile?.full_name || 'User'}</p>
                            <p className="text-[10px] truncate" style={{ color: 'var(--color-cp-text-muted)' }}>{user.email}</p>
                          </div>
                          <Link
                            to="/dashboard"
                            onClick={() => setProfileMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                            style={{ color: 'var(--color-cp-text-muted)' }}
                            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.08)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-primary)' }}
                            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' }}
                          >
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                          </Link>
                          {profile?.is_superadmin && (
                            <Link
                              to="/mc"
                              onClick={() => setProfileMenuOpen(false)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                              style={{ color: '#F59E0B' }}
                              onMouseEnter={e => (e.target as HTMLElement).style.background = 'rgba(245,158,11,0.1)'}
                              onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
                            >
                              <Shield className="h-4 w-4" />
                              MC Panel
                            </Link>
                          )}
                          <button
                            onClick={() => { handleSignOut(); setProfileMenuOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
                            style={{ color: 'var(--color-cp-text-muted)' }}
                            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.08)'; (e.target as HTMLElement).style.color = '#EF4444' }}
                            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' }}
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
                  className="text-[12px] font-medium transition-colors"
                  style={{ color: 'var(--color-cp-text-muted)' }}
                  onMouseEnter={e => (e.target as HTMLElement).style.color = '#C4B5FD'}
                  onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)'}
                >
                  Sign Up
                </Link>
                <Link
                  to="/login"
                  className="text-[12px] font-semibold px-4 py-1.5 rounded-full transition-colors"
                  style={{
                    border: '1px solid rgba(124,92,252,0.4)',
                    background: 'rgba(124,92,252,0.08)',
                    color: '#7C5CFC',
                  }}
                  onMouseEnter={e => (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.2)'}
                  onMouseLeave={e => (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.08)'}
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'var(--color-cp-text-muted)' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(124,92,252,0.1)'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-primary)' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)' }}
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
            className="md:hidden overflow-hidden"
            style={{ background: 'var(--color-cp-bg-surface)', borderBottom: '1px solid rgba(124,92,252,0.15)' }}
          >
            <div className="px-4 py-4 space-y-3">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-sm font-medium transition-colors"
                  style={{
                    color: location.pathname === link.href ? '#7C5CFC' : 'var(--color-cp-text-muted)',
                  }}
                >
                  {link.label}
                </Link>
              ))}
              {user ? (
                <div className="space-y-2 pt-2" style={{ borderTop: '1px solid rgba(124,92,252,0.15)' }}>
                  {profile?.is_superadmin && (
                    <Link to="/mc" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 text-sm" style={{ color: '#F59E0B' }}>
                      <Shield className="h-4 w-4" /> MC Panel
                    </Link>
                  )}
                  {orgs.length > 0 && (
                    <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 text-sm" style={{ color: '#7C5CFC' }}>
                      <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="flex items-center gap-2 text-sm transition-colors" style={{ color: 'var(--color-cp-text-muted)' }}>
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block text-center text-sm font-semibold px-4 py-2.5 rounded-full"
                  style={{
                    background: 'var(--gradient-brand)',
                    color: '#fff',
                  }}
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