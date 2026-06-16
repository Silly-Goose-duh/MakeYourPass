import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export function CTASection() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      <div className="relative mx-auto px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="primary" size="lg" className="mb-6">
            Start Building
          </Badge>

          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6 leading-[1.1]">
            It&apos;s <span className="gradient-text">100% free</span> —{' '}
            <br />
            start now
          </h2>

          <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mb-10 leading-relaxed">
            No hidden fees, no credit card required. You only pay processing fees on paid tickets
            when you sell them. Start creating events right now.
          </p>

          <div className="flex flex-col sm:flex-row items-start gap-4 mb-12">
            <Link to="/signup">
              <Button variant="gradient" size="xl" glow className="group text-lg px-10">
                Create Your First Event
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="/#features">
              <Button variant="outline" size="xl" className="text-lg px-8">
                Explore Features
              </Button>
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-8 text-sm">
            <span className="flex items-center gap-2 text-text-muted">
              <Check className="h-4 w-4 text-success" />
              No credit card
            </span>
            <span className="flex items-center gap-2 text-text-muted">
              <Check className="h-4 w-4 text-secondary" />
              5-minute setup
            </span>
            <span className="flex items-center gap-2 text-text-muted">
              <Check className="h-4 w-4 text-primary" />
              Free forever plan
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
