import { motion } from 'framer-motion'
import {
  Ticket, QrCode, BarChart3, CreditCard, Users, Bell,
  Palette, Shield, Share2, Zap, Globe, Sparkles
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const features = [
  {
    icon: Ticket,
    title: 'Smart Ticketing',
    description: 'Create custom ticket types, set pricing, and sell with built-in payment processing. Group bookings, early bird, and promo codes included.',
    badge: 'Popular',
  },
  {
    icon: QrCode,
    title: 'QR Check-In',
    description: 'Fast, contactless entry with QR scanning. Real-time validation prevents duplicates and flags suspicious tickets instantly.',
    badge: 'New',
  },
  {
    icon: BarChart3,
    title: 'Live Analytics',
    description: 'Track ticket sales, check-ins, and revenue in real-time. Export reports for stakeholders without spreadsheets.',
    badge: '',
  },
  {
    icon: CreditCard,
    title: 'Payment Processing',
    description: 'Accept payments via Razorpay, Slice, and more. No setup fees, no monthly charges — just seamless transactions.',
    badge: 'Free',
  },
  {
    icon: Users,
    title: 'Attendee Management',
    description: 'View, search, and manage all attendees in one place. Send bulk updates, export lists, and track engagement.',
    badge: '',
  },
  {
    icon: Bell,
    title: 'Automated Notifications',
    description: 'Keep attendees informed with automated email and WhatsApp reminders. Customize templates for every touchpoint.',
    badge: '',
  },
  {
    icon: Palette,
    title: 'Event Branding',
    description: 'Customize your event page with your brand colors, logo, and domain. No coding or design skills needed.',
    badge: '',
  },
  {
    icon: Shield,
    title: 'Fraud Protection',
    description: 'Built-in anti-scalping, duplicate ticket detection, and secure QR codes. Your event, protected.',
    badge: 'Secure',
  },
  {
    icon: Share2,
    title: 'Social Sharing',
    description: 'Built-in social sharing tools. Let attendees spread the word with shareable ticket graphics and referral links.',
    badge: '',
  },
  {
    icon: Zap,
    title: 'Instant Setup',
    description: 'Create a professional event page in minutes. No coding required — just fill in details and publish.',
    badge: 'Fast',
  },
  {
    icon: Globe,
    title: 'Multi-Event Support',
    description: 'Manage recurring events, conferences with multiple tracks, and multi-day festivals from a single dashboard.',
    badge: '',
  },
  {
    icon: Sparkles,
    title: 'AI Poster Generator',
    description: 'Just describe your event — the AI generates a stunning poster in seconds. No design skills needed.',
    badge: 'Soon',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="relative px-8 lg:px-12 mx-auto max-w-7xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 sm:mb-20"
        >
          <div className="left-accent">
            <Badge variant="primary" size="md" className="mb-4">
              Everything You Need
            </Badge>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text-primary mb-4">
              All the tools to run{' '}
              <br />
              <span className="gradient-text">events like a pro</span>
            </h2>
            <p className="text-text-secondary text-lg sm:text-xl max-w-2xl">
              No more juggling spreadsheets, payment links, and check-in apps.{' '}
              CampusPass brings it all under one roof.
            </p>
          </div>
        </motion.div>

        {/* Features grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            >
              <Card
                variant="default"
                padding="lg"
                hover
                className="group h-full"
              >
                <CardContent>
                  <div className="flex items-start gap-4 mb-4">
                    <div className="p-2.5 rounded-xl bg-primary-muted text-text-primary transition-all duration-300 group-hover:scale-110 group-hover:text-primary">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    {feature.badge && (
                      <Badge variant="primary" size="sm" className="ml-auto">
                        {feature.badge}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">{feature.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
