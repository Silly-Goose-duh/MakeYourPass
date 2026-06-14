import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export function CTASection() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Multi-colored background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-yellow-400/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-accent-pink/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/2 w-[300px] h-[300px] bg-accent-cyan/8 rounded-full blur-[80px]" />
      </div>

      <div className="relative mx-auto px-6 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="yellow" size="lg" className="mb-6">
            Start Building
          </Badge>

          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
            It&apos;s <span className="gradient-text">100% free</span> —{' '}
            <br />
            start now
          </h2>

          <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            No hidden fees, no credit card required. You only pay processing fees on paid tickets
            when you sell them. Start creating events right now.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link to="/signup">
              <Button variant="gradient" size="xl" glow className="group text-lg px-10">
                Create Your First Event
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="/#features">
              <Button variant="secondary" size="xl" className="text-lg px-8">
                Explore Features
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
            <span className="flex items-center gap-2 text-text-muted">
              <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
              No credit card
            </span>
            <span className="flex items-center gap-2 text-text-muted">
              <span className="h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(245,215,0,0.5)]" />
              5-minute setup
            </span>
            <span className="flex items-center gap-2 text-text-muted">
              <span className="h-2 w-2 rounded-full bg-accent-pink shadow-[0_0_10px_rgba(255,45,149,0.5)]" />
              Free forever plan
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
