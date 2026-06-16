import { Link } from 'react-router-dom'
import { Sparkles, Code, Heart, Mail, MessageCircle, Building2, Shield } from 'lucide-react'

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
    <footer className="relative border-t border-border bg-surface mt-auto">
      <div className="relative mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-text-primary">
                Campus<span className="text-primary">Pass</span>
              </span>
            </Link>
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              Marian Engineering College's event platform. Register, organize, and attend campus events seamlessly.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-text-muted hover:text-primary transition-colors"
                aria-label="GitHub"
              >
                <Code className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-text-muted hover:text-primary transition-colors"
                aria-label="Twitter"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              <a
                href="mailto:hello@campuspass.app"
                className="p-2 text-text-muted hover:text-primary transition-colors"
                aria-label="Email"
              >
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-text-primary mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('http') ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-text-secondary hover:text-primary transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm text-text-secondary hover:text-primary transition-colors"
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
        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-text-muted">
            &copy; {new Date().getFullYear()} CampusPass. All rights reserved.
          </p>
          <p className="text-sm text-text-muted flex items-center gap-1">
            Made with <Heart className="h-3.5 w-3.5 text-accent-rose" /> by the CampusPass team
          </p>
        </div>
      </div>
    </footer>
  )
}
