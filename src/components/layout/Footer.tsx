import { Link } from 'react-router-dom'
import { Code, Heart, Mail, MessageCircle, Zap } from 'lucide-react'

const footerLinks = {
  Product: [
    { label: 'Events', href: '/' },
    { label: 'How It Works', href: '/#events-section' },
    { label: 'Register Your Club', href: '/signup' },
  ],
  Account: [
    { label: 'Sign In', href: '/login' },
    { label: 'Create Account', href: '/signup' },
    { label: 'Dashboard', href: '/dashboard' },
  ],
  Links: [
    { label: 'About MEC', href: 'https://marian.ac.in' },
    { label: 'Contact Us', href: 'mailto:hello@campuspass.app' },
    { label: 'MC Panel', href: '/mc' },
  ],
}

export function Footer() {
  return (
    <footer
      className="mt-auto"
      style={{
        background: 'var(--color-cp-bg-surface)',
        borderTop: '0.5px solid rgba(124,92,252,0.15)',
      }}
    >
      <div className="relative mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div
                className="h-[30px] w-[30px] rounded-lg flex items-center justify-center"
                style={{ background: 'var(--gradient-brand)', boxShadow: '0 2px 10px rgba(139,92,246,0.4)' }}
              >
                <Zap className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[13px] font-bold" style={{ color: 'var(--color-cp-text-primary)' }}>
                CampusPass
              </span>
            </Link>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--color-cp-text-muted)' }}>
              Marian Engineering College's event platform. Register, organize, and attend campus events seamlessly.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 transition-colors"
                style={{ color: 'var(--color-cp-text-muted)' }}
                onMouseEnter={e => (e.target as HTMLElement).style.color = '#7C5CFC'}
                onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)'}
                aria-label="GitHub"
              >
                <Code className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 transition-colors"
                style={{ color: 'var(--color-cp-text-muted)' }}
                onMouseEnter={e => (e.target as HTMLElement).style.color = '#7C5CFC'}
                onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)'}
                aria-label="Twitter"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              <a
                href="mailto:hello@campuspass.app"
                className="p-2 transition-colors"
                style={{ color: 'var(--color-cp-text-muted)' }}
                onMouseEnter={e => (e.target as HTMLElement).style.color = '#7C5CFC'}
                onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)'}
                aria-label="Email"
              >
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-cp-text-primary)' }}>{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('http') ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm transition-colors"
                        style={{ color: 'var(--color-cp-text-muted)' }}
                        onMouseEnter={e => (e.target as HTMLElement).style.color = '#7C5CFC'}
                        onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)'}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm transition-colors"
                        style={{ color: 'var(--color-cp-text-muted)' }}
                        onMouseEnter={e => (e.target as HTMLElement).style.color = '#7C5CFC'}
                        onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--color-cp-text-muted)'}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: '0.5px solid rgba(124,92,252,0.1)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-cp-text-muted)' }}>
            &copy; {new Date().getFullYear()} CampusPass. All rights reserved.
          </p>
          <p className="text-sm flex items-center gap-1" style={{ color: 'var(--color-cp-text-muted)' }}>
            Made with <Heart className="h-3.5 w-3.5" style={{ color: '#EF4444' }} /> by the CampusPass team
          </p>
        </div>
      </div>
    </footer>
  )
}
