import { Link } from 'react-router-dom'
import { Code, Heart, Mail, MessageCircle, Ticket } from 'lucide-react'

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
    <footer className="mt-auto" style={{ background: '#14110E', borderTop: '2.5px solid #14110E' }}>
      <div className="relative mx-auto px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="h-10 w-10 flex items-center justify-center" style={{ background: '#FF4D2E', border: '2.5px solid #FBF8F0' }}>
                <Ticket className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#FBF8F0' }}>CampusPass</span>
            </Link>
            <p className="text-sm font-semibold leading-relaxed mb-4" style={{ color: '#B8B2A6' }}>
              Marian Engineering College's event platform. Register, organize, and show up.
            </p>
            <div className="flex items-center gap-2">
              {[
                { href: 'https://github.com', icon: Code, label: 'GitHub' },
                { href: 'https://twitter.com', icon: MessageCircle, label: 'Twitter' },
                { href: 'mailto:hello@campuspass.app', icon: Mail, label: 'Email' },
              ].map(({ href, icon: Icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                  className="flex h-9 w-9 items-center justify-center"
                  style={{ background: '#FFD23F', border: '2.5px solid #FBF8F0', color: '#14110E' }}>
                  <Icon className="h-4 w-4" strokeWidth={2.5} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-extrabold uppercase tracking-widest mb-4" style={{ fontFamily: 'Syne, sans-serif', color: '#FFD23F' }}>{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('http') || link.href.startsWith('mailto') ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm font-bold transition-colors" style={{ color: '#B8B2A6' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#FF4D2E'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#B8B2A6'}>
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.href} className="text-sm font-bold transition-colors" style={{ color: '#B8B2A6' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#FF4D2E'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#B8B2A6'}>
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
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: '2px solid #4A4640' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#B8B2A6' }}>
            &copy; {new Date().getFullYear()} CampusPass — All rights reserved
          </p>
          <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#B8B2A6' }}>
            Made with <Heart className="h-3.5 w-3.5" strokeWidth={2.5} style={{ color: '#FF4D2E' }} fill="#FF4D2E" /> by the CampusPass team
          </p>
        </div>
      </div>
    </footer>
  )
}
