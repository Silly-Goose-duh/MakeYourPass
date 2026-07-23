import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, User, LayoutDashboard, Shield, LogOut, ChevronDown, Ticket } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getProfile, getUserOrganizations, signOut } from '@/lib/supabase'
import type { Profile, Organization } from '@/types'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { user } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => {
    if (user) {
      getProfile(user.id).then(({ data }) => setProfile(data))
      getUserOrganizations().then(({ data }) => {
        if (data) setOrgs(data.map(m => m.organizations).filter(Boolean) as Organization[])
      })
    } else {
      setProfile(null)
      setOrgs([])
    }
  }, [user])

  const dashboardHref = orgs[0]?.slug ? `/${orgs[0].slug}` : '/dashboard'

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

  const navLinks = [{ label: 'Events', href: '/events' }]

  return (
    <nav
      className="sticky top-0 z-50"
      style={{ background: '#F4EFE1', borderBottom: '2.5px solid #14110E' }}
    >
      <div className="px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo — sticker mark */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div
              className="h-10 w-10 flex items-center justify-center"
              style={{ background: '#FF4D2E', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E' }}
            >
              <Ticket className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-none">
              <span className="block text-lg font-extrabold tracking-tight" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                MakeYourPass
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: '#7A756B' }}>
                Marian Engineering College
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="text-sm font-extrabold uppercase tracking-wide px-2 py-1"
                style={{
                  fontFamily: 'Syne, sans-serif',
                  color: '#14110E',
                  textDecoration: location.pathname === link.href ? 'underline' : 'none',
                  textDecorationThickness: '3px',
                  textUnderlineOffset: '4px',
                }}
              >
                {link.label}
              </Link>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                {profile?.is_superadmin && (
                  <Link to="/mc" className="zine-sticker" style={{ background: '#FFD23F' }}>
                    <Shield className="h-3 w-3" strokeWidth={2.5} /> MC
                  </Link>
                )}
                <Link to={dashboardHref} className="zine-sticker" style={{ background: '#2D5BFF', color: '#fff', borderColor: '#14110E' }}>
                  <LayoutDashboard className="h-3 w-3" strokeWidth={2.5} /> Dashboard
                </Link>
                <div className="relative profile-dropdown-area">
                  <button
                    onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                    className="flex items-center gap-2 pl-1.5 pr-2.5 py-1"
                    style={{ border: '2.5px solid #14110E', background: '#fff', boxShadow: '2px 2px 0 #14110E' }}
                  >
                    <div
                      className="flex h-7 w-7 items-center justify-center text-[11px] font-extrabold text-white"
                      style={{ background: '#FF4D2E', border: '2px solid #14110E' }}
                    >
                      {profile?.full_name
                        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                        : <User className="h-3.5 w-3.5" strokeWidth={2.5} />}
                    </div>
                    <span className="text-xs font-bold max-w-[100px] truncate hidden sm:block" style={{ color: '#14110E' }}>
                      {profile?.full_name || user.email?.split('@')[0] || 'User'}
                    </span>
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', profileMenuOpen && 'rotate-180')} strokeWidth={2.5} style={{ color: '#14110E' }} />
                  </button>
                  <AnimatePresence>
                    {profileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-2 w-52 z-50"
                        style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '5px 5px 0 #14110E' }}
                      >
                        <div className="p-2 space-y-1">
                          <div className="px-2 py-2 mb-1" style={{ borderBottom: '2px solid #14110E' }}>
                            <p className="text-sm font-extrabold truncate" style={{ color: '#14110E' }}>{profile?.full_name || 'User'}</p>
                            <p className="text-[11px] truncate font-medium" style={{ color: '#7A756B' }}>{user.email}</p>
                          </div>
                          <Link to={dashboardHref} onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 px-2 py-2 text-sm font-bold" style={{ color: '#14110E' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FFD23F'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <LayoutDashboard className="h-4 w-4" strokeWidth={2.5} /> Dashboard
                          </Link>
                          {profile?.is_superadmin && (
                            <Link to="/mc" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2 px-2 py-2 text-sm font-bold" style={{ color: '#14110E' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FFD23F'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                              <Shield className="h-4 w-4" strokeWidth={2.5} /> MC Panel
                            </Link>
                          )}
                          <button onClick={() => { handleSignOut(); setProfileMenuOpen(false) }} className="w-full flex items-center gap-2 px-2 py-2 text-sm font-bold" style={{ color: '#FF4D2E' }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FFE9E3'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                            <LogOut className="h-4 w-4" strokeWidth={2.5} /> Sign Out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/signup" className="text-sm font-extrabold uppercase tracking-wide" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  Sign Up
                </Link>
                <Link to="/login" className="zine-btn zine-btn-accent text-sm uppercase">
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2"
            style={{ border: '2.5px solid #14110E', background: '#fff', boxShadow: '2px 2px 0 #14110E', color: '#14110E' }}
          >
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={2.5} /> : <Menu className="h-5 w-5" strokeWidth={2.5} />}
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
            style={{ background: '#FBF8F0', borderBottom: '2.5px solid #14110E' }}
          >
            <div className="px-4 py-4 space-y-3">
              {navLinks.map(link => (
                <Link key={link.href} to={link.href} onClick={() => setMobileOpen(false)} className="block text-base font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  {link.label}
                </Link>
              ))}
              {user ? (
                <div className="space-y-2 pt-2" style={{ borderTop: '2px solid #14110E' }}>
                  {profile?.is_superadmin && (
                    <Link to="/mc" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 text-sm font-bold" style={{ color: '#14110E' }}>
                      <Shield className="h-4 w-4" strokeWidth={2.5} /> MC Panel
                    </Link>
                  )}
                  <Link to={dashboardHref} onClick={() => setMobileOpen(false)} className="flex items-center gap-2 text-sm font-bold" style={{ color: '#14110E' }}>
                    <LayoutDashboard className="h-4 w-4" strokeWidth={2.5} /> Dashboard
                  </Link>
                  <button onClick={handleSignOut} className="flex items-center gap-2 text-sm font-bold" style={{ color: '#FF4D2E' }}>
                    <LogOut className="h-4 w-4" strokeWidth={2.5} /> Sign Out
                  </button>
                </div>
              ) : (
                <Link to="/login" onClick={() => setMobileOpen(false)} className="zine-btn zine-btn-accent w-full uppercase">
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
