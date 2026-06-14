import { motion } from 'framer-motion'
import { Settings, Share2, QrCode, Users, BarChart3, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const steps = [
  {
    step: '01',
    icon: Settings,
    title: 'Set Up Your Event',
    description: 'Fill in details, choose ticket types, set prices. Takes 5 minutes — no tech skills needed.',
    glass: 'glass-primary',
    glow: 'shadow-[0_0_30px_rgba(99,102,241,0.2)]',
    iconColor: 'text-primary',
  },
  {
    step: '02',
    icon: Share2,
    title: 'Share & Sell Tickets',
    description: 'Get a custom link for your event page. Share anywhere — social media, email, WhatsApp.',
    glass: 'glass-accent',
    glow: 'shadow-[0_0_30px_rgba(244,63,94,0.2)]',
    iconColor: 'text-accent-rose',
  },
  {
    step: '03',
    icon: QrCode,
    title: 'Check-In Instantly',
    description: 'On event day, scan QR codes for lightning-fast entry. Real-time tracking shows who\'s in the door.',
    glass: 'glass-primary',
    glow: 'shadow-[0_0_30px_rgba(99,102,241,0.2)]',
    iconColor: 'text-accent-teal',
  },
  {
    step: '04',
    icon: Users,
    title: 'Engage Attendees',
    description: 'Send updates, manage networking, keep your audience hooked before, during, and after.',
    glass: 'glass-primary',
    glow: 'shadow-[0_0_30px_rgba(99,102,241,0.2)]',
    iconColor: 'text-primary',
  },
  {
    step: '05',
    icon: BarChart3,
    title: 'Analyze & Improve',
    description: 'Get detailed reports on sales, attendance, and engagement. Make your next event even better.',
    glass: 'glass-accent',
    glow: 'shadow-[0_0_30px_rgba(244,63,94,0.2)]',
    iconColor: 'text-accent-rose',
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="px-8 lg:px-12 mx-auto max-w-7xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 sm:mb-20"
        >
          <div className="left-accent">
            <Badge variant="primary" size="lg" className="mb-4">
              Simple Process
            </Badge>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text-primary mb-4">
              How it <span className="gradient-text">works</span>
            </h2>
            <p className="text-text-secondary text-lg sm:text-xl max-w-2xl">
              From zero to a live event in minutes. No complex setup, no learning curve.
            </p>
          </div>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-5 gap-6 relative">
          {/* Connecting line with gradient */}
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-primary/40 via-accent-rose/40 to-accent-teal/40 pointer-events-none" />
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-primary via-accent-rose to-accent-teal pointer-events-none animate-pulse opacity-30" />

          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative flex flex-col items-center text-center group"
            >
              {/* Step icon container */}
              <div className={cn(
                'w-24 h-24 rounded-2xl flex items-center justify-center mb-4 relative z-10 transition-all duration-500',
                step.glass,
                step.glow,
                'group-hover:scale-110 group-hover:-translate-y-1'
              )}>
                <step.icon className={cn('h-9 w-9 transition-transform duration-300 group-hover:scale-110', step.iconColor)} />
                {/* Glow overlay on hover */}
                <div className={cn(
                  'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                  step.glass === 'glass-primary' && 'bg-primary/10',
                  step.glass === 'glass-accent' && 'bg-accent-rose/10',
                )} />
              </div>

              {/* Step number label */}
              <span className={cn(
                'text-[10px] font-bold tracking-[0.15em] uppercase mb-2 px-2 py-0.5 rounded-full',
                step.iconColor,
                'bg-surface'
              )}>
                Step {step.step}
              </span>

              <h3 className="text-base font-semibold text-text-primary mb-2">{step.title}</h3>
              <p className="text-text-secondary text-xs leading-relaxed max-w-[200px]">
                {step.description}
              </p>

              {/* Arrow connector */}
              {index < steps.length - 1 && (
                <ArrowRight className="hidden md:block absolute -right-4 top-12 h-4 w-4 text-text-muted z-20" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
