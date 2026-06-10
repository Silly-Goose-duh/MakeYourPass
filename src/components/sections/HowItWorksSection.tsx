import { motion } from 'framer-motion'
import { Sparkles, Settings, Share2, QrCode, Users, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const steps = [
  {
    step: '01',
    icon: Settings,
    title: 'Set Up Your Event',
    description: 'Fill in event details, choose ticket types, set prices, and customize the page. Takes 5 minutes — no tech skills needed.',
    color: 'yellow',
  },
  {
    step: '02',
    icon: Share2,
    title: 'Share & Sell Tickets',
    description: 'Get a custom link for your event page. Share it anywhere — social media, email, WhatsApp. Payments handled seamlessly.',
    color: 'white',
  },
  {
    step: '03',
    icon: QrCode,
    title: 'Check-In Instantly',
    description: 'On event day, scan QR codes for lightning-fast entry. Real-time tracking shows you who\'s in the door.',
    color: 'yellow',
  },
  {
    step: '04',
    icon: Users,
    title: 'Engage Attendees',
    description: 'Send updates, manage networking, and keep your audience hooked before, during, and after the event.',
    color: 'white',
  },
  {
    step: '05',
    icon: BarChart3,
    title: 'Analyze & Improve',
    description: 'Get detailed reports on ticket sales, attendance, and engagement. Use insights to make your next event even better.',
    color: 'yellow',
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto px-6 max-w-7xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-16 sm:mb-20"
        >
          <Badge variant="yellow" size="lg" className="mb-4">
            Simple Process
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
            How it <span className="gradient-text">works</span>
          </h2>
          <p className="text-text-secondary text-lg sm:text-xl max-w-2xl mx-auto">
            From zero to a live event in minutes. No complex setup, no learning curve.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-5 gap-6 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-yellow-400/40 via-yellow-400/60 to-yellow-400/40 pointer-events-none" />

          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative flex flex-col items-center text-center"
            >
              {/* Step number */}
              <div className={cn(
                'w-20 h-20 rounded-2xl flex items-center justify-center mb-4 relative z-10 transition-all duration-300',
                'border-2',
                step.color === 'yellow' 
                  ? 'bg-yellow-400/20 border-yellow-400/50 shadow-lg shadow-yellow-400/20' 
                  : 'bg-white/5 border-white/10'
              )}>
                <step.icon className={cn(
                  'h-8 w-8',
                  step.color === 'yellow' ? 'text-yellow-400' : 'text-text-secondary'
                )} />
              </div>

              {/* Label */}
              <span className={cn(
                'text-xs font-bold tracking-wider uppercase mb-2',
                step.color === 'yellow' ? 'text-yellow-400' : 'text-text-muted'
              )}>
                Step {step.step}
              </span>

              <h3 className="text-base font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-text-secondary text-xs leading-relaxed max-w-[220px]">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}