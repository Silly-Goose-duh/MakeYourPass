import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Explore Events', href: '/events' },
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Docs', href: '/docs' },
]

export function Navbar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const isAuthPage = location.pathname.startsWith('/login') || location.pathname.startsWith('/signup')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = () => {
    setIsMobileOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="relative">
        {/* Glass backdrop */}
        <div
          className={cn(
            'absolute inset-0 border-b transition-all duration-500',
            scrolled
              ? 'bg-surface/95 backdrop-blur-2xl border-border'
              : 'bg-surface/80 backdrop-blur-lg border-transparent'
          )}
        />

        <nav className="relative mx-auto flex items-center justify-between px-6 py-4 max-w-7xl">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-all duration-300 group-hover:scale-105 overflow-hidden">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
              <Zap className="h-5 w-5 text-white relative z-10" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-lg font-bold tracking-tight text-text-primary">
                MakeYour<span className="text-primary">Pass</span>
              </span>
              <span className="text-[10px] font-medium text-text-muted tracking-widest uppercase -mt-0.5">
                Event OS
              </span>
            </div>
          </Link>

          {/* Desktop Nav — left-aligned after logo */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => handleNavClick()}
                className="relative px-4 py-2 text-sm font-medium text-text-secondary hover:text-primary rounded-lg hover:bg-primary-muted transition-all group"
              >
                {link.label}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-primary rounded-full transition-all duration-300 group-hover:w-3/4" />
              </a>
            ))}
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
                  <Button variant="gradient" size="sm" glow>
                    Get Started Free
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            className="md:hidden p-2 text-text-secondary hover:text-text-primary"
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
              className="md:hidden border-b border-border bg-surface/95 backdrop-blur-2xl"
            >
              <div className="px-6 py-4 space-y-1">
                {navLinks.map((link, i) => (
                  <motion.a
                    key={link.label}
                    href={link.href}
                    onClick={() => handleNavClick()}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="block px-4 py-3 text-sm font-medium text-text-secondary hover:text-primary rounded-lg hover:bg-primary-muted transition-all"
                  >
                    {link.label}
                  </motion.a>
                ))}
                <hr className="border-border my-3" />

                {!isAuthPage && (
                  <div className="space-y-2 px-1">
                    <Link to="/login" onClick={() => setIsMobileOpen(false)}>
                      <Button variant="ghost" fullWidth size="sm">
                        Log In
                      </Button>
                    </Link>
                    <Link to="/signup" onClick={() => setIsMobileOpen(false)}>
                      <Button variant="gradient" fullWidth size="sm">
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
