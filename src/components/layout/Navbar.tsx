import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronDown, Sparkles, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Blog', href: '/#blogs' },
  { label: 'Docs', href: '/docs' },
]

export function Navbar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isAuthPage = location.pathname.startsWith('/login') || location.pathname.startsWith('/signup')

  const handleNavClick = (href: string) => {
    setIsMobileOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="relative">
        {/* Glass backdrop */}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-2xl border-b border-border" />

        <nav className="relative mx-auto flex items-center justify-between px-6 py-4 max-w-7xl">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-10 w-10 rounded-xl bg-yellow-400 flex items-center justify-center shadow-lg shadow-yellow-400/30 group-hover:shadow-yellow-400/50 transition-all">
              <Sparkles className="h-5 w-5 text-black" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-white">MakeYour</span>
              <span className="text-yellow-400">Pass</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => handleNavClick(link.href)}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-white rounded-lg hover:bg-white/5 transition-all"
              >
                {link.label}
              </a>
            ))}

            {/* Pricing placeholder */}
            <Link
              to="/pricing"
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-white rounded-lg hover:bg-white/5 transition-all"
            >
              Pricing
            </Link>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {!isAuthPage && (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Log In
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button variant="primary" size="sm">
                    Get Started Free
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            className="md:hidden p-2 text-text-secondary hover:text-white"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
          >
            {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </nav>

        {/* Mobile Nav */}
        <AnimatePresence>
          {isMobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-b border-border bg-background/95 backdrop-blur-2xl"
            >
              <div className="px-6 py-4 space-y-1">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => handleNavClick(link.href)}
                    className="block px-4 py-3 text-sm font-medium text-text-secondary hover:text-white rounded-lg hover:bg-white/5 transition-all"
                  >
                    {link.label}
                  </a>
                ))}
                <Link
                  to="/pricing"
                  onClick={() => setIsMobileOpen(false)}
                  className="block px-4 py-3 text-sm font-medium text-text-secondary hover:text-white rounded-lg hover:bg-white/5 transition-all"
                >
                  Pricing
                </Link>

                <hr className="border-border my-3" />

                {!isAuthPage && (
                  <div className="space-y-2 px-1">
                    <Link to="/login" onClick={() => setIsMobileOpen(false)}>
                      <Button variant="ghost" fullWidth size="sm">
                        Log In
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setIsMobileOpen(false)}>
                      <Button variant="primary" fullWidth size="sm">
                        Get Started Free
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}