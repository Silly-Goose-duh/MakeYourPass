import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export function CTASection() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-yellow-400/10 to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-400/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative mx-auto px-6 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="yellow" size="lg" className="mb-6">
            Get Started Today
          </Badge>

          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
            It&apos;s <span className="gradient-text">100% free</span> to get started
          </h2>

          <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
            No hidden fees, no credit card required. You only pay processing fees on paid tickets 
            when you sell them. Start creating events right now.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link to="/signup">
              <Button variant="primary" size="xl" className="group shadow-glow">
                Create Your First Event
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="/#features">
              <Button variant="secondary" size="xl">
                Explore Features
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-muted">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-green-400" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-yellow-400" />
              5-minute setup
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-green-400" />
              Free forever plan
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}