import { Link } from 'react-router-dom'
import { Sparkles, Code, Heart, Mail, MessageCircle } from 'lucide-react'

const footerLinks = {
  Product: [
    { label: 'Features', href: '/#features' },
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'Integrations', href: '/integrations' },
  ],
  Resources: [
    { label: 'Blog', href: '/blog' },
    { label: 'Documentation', href: '/docs' },
    { label: 'API Reference', href: '/api' },
    { label: 'Community', href: '/community' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Contact', href: '/contact' },
  ],
}

export function Footer() {
  return (
    <footer className="relative border-t border-border mt-auto">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-yellow-400/5" />

      <div className="relative mx-auto px-6 py-16 max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="h-9 w-9 rounded-xl bg-yellow-400 flex items-center justify-center">
                <Sparkles className="h-4.5 w-4.5 text-black" />
              </div>
              <span className="text-lg font-bold">
                <span className="text-white">MakeYour</span>
                <span className="text-yellow-400">Pass</span>
              </span>
            </Link>
            <p className="text-text-secondary text-sm leading-relaxed mb-4">
              The all-in-one event OS that makes ticketing seamless, check-ins instant, and your guests go, "Whoa, that was smooth."
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-text-muted hover:text-yellow-400 transition-colors"
                aria-label="GitHub"
              >
                <Code className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-text-muted hover:text-yellow-400 transition-colors"
                aria-label="Twitter"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
              <a
                href="mailto:hello@makeyourpass.com"
                className="p-2 text-text-muted hover:text-yellow-400 transition-colors"
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
                        className="text-sm text-text-secondary hover:text-yellow-400 transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-sm text-text-secondary hover:text-yellow-400 transition-colors"
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
            &copy; {new Date().getFullYear()} MakeYourPass. All rights reserved.
          </p>
          <p className="text-sm text-text-muted flex items-center gap-1">
            Made with <Heart className="h-3.5 w-3.5 text-yellow-400" /> by the MakeYourPass team
          </p>
        </div>
      </div>
    </footer>
  )
}