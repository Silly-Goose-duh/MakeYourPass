import { Link } from 'react-router-dom'
import { Heart, Mail, Ticket } from 'lucide-react'

// Inline LinkedIn glyph (lucide-react has no LinkedIn icon)
function LinkedIn({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z" />
    </svg>
  )
}

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
              {/* PLACEHOLDER hrefs — replace with real profiles before launch */}
              {[
                { href: '#', icon: (props: React.SVGProps<SVGSVGElement>) => (
                  <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden="true">
                    <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
                  </svg>
                ), label: 'GitHub' },
                { href: 'mailto:hello@campuspass.app', icon: Mail, label: 'Email' },
                { href: '#', icon: LinkedIn, label: 'LinkedIn' },
              ].map(({ href, icon: Icon, label }) => (
                <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" aria-label={label}
                  className="flex h-9 w-9 items-center justify-center"
                  style={{ background: '#FFD23F', border: '2.5px solid #FBF8F0', color: '#14110E' }}>
                  <Icon className="h-4 w-4" />
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
