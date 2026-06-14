import { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

const Scene3D = lazy(() => import('@/components/3d/ThreeHero').then(m => ({ default: m.Scene3D })))

const floatingEmojis = ['🎪', '✨', '🚀', '🎯', '⚡', '🎨']

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-background">
      {/* Light ambient gradient — subtle and professional */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary-muted rounded-full blur-[150px] opacity-60" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-secondary-muted rounded-full blur-[120px] opacity-40" />
      </div>

      {/* Floating decorative elements — repositioned to right side */}
      {floatingEmojis.map((emoji, i) => (
        <motion.div
          key={emoji}
          className="absolute pointer-events-none select-none text-3xl hidden md:block"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.5, 0],
            scale: [0, 1, 0],
            x: [0, (i % 2 === 0 ? -1 : 1) * (60 + i * 20)],
            y: [0, -(40 + i * 15)],
          }}
          transition={{
            duration: 4 + i * 0.5,
            delay: 1 + i * 0.3,
            repeat: Infinity,
            repeatDelay: 3,
          }}
          style={{
            right: `${10 + i * 6}%`,
            top: `${20 + (i % 3) * 15}%`,
          }}
        >
          {emoji}
        </motion.div>
      ))}

      {/* Content — left-anchored grid split */}
      <div className="relative w-full px-8 lg:px-12 pt-32 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl">
          {/* Left: Text content — left-aligned */}
          <div className="text-left">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-muted border border-primary/10 text-primary text-sm font-medium mb-8"
            >
              <Zap className="h-4 w-4 fill-primary" />
              <span>Now free for all organizers</span>
              <span className="w-1 h-1 rounded-full bg-secondary inline-block" />
              <span className="text-text-muted">Built for college fests</span>
            </motion.div>

            {/* Main heading */}
            <motion.h1
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="font-bold leading-[1.02] tracking-tight mb-8"
            >
              <span className="text-5xl sm:text-6xl md:text-7xl lg:text-7xl xl:text-8xl block text-text-primary">
                Your Event,
              </span>
              <span className="text-5xl sm:text-6xl md:text-7xl lg:text-7xl xl:text-8xl gradient-text block mt-2">
                Zero Drama
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-lg sm:text-xl text-text-secondary max-w-xl mb-10 leading-relaxed"
            >
              Create stunning event pages, sell tickets in seconds, and check in guests —
              <span className="text-text-primary font-semibold"> no fees, no coding, no nonsense.</span>
            </motion.p>

            {/* CTA Buttons — left-aligned */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.55 }}
              className="flex flex-col sm:flex-row items-start gap-4"
            >
              <Link to="/signup">
                <Button variant="gradient" size="xl" glow className="group text-lg px-10">
                  Create Your First Event
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a href="/#how-it-works">
                <Button variant="outline" size="xl" className="text-lg px-8">
                  See How It Works
                </Button>
              </a>
            </motion.div>

            {/* Social proof */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-10 text-sm text-text-muted"
            >
              Trusted by college fests across India —{' '}
              <span className="text-text-secondary underline underline-offset-2 decoration-border">
                no credit card required
              </span>
            </motion.p>
          </div>

          {/* Right: 3D Scene */}
          <div className="relative h-[500px] lg:h-[600px] hidden lg:block">
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center bg-surface rounded-3xl">
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-text-muted text-sm font-medium">Loading experience...</p>
                  </div>
                </div>
              }
            >
              <Scene3D />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-xs text-text-muted tracking-widest uppercase">
            Scroll
          </span>
          <div className="w-[2px] h-8 bg-gradient-to-b from-primary to-transparent rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
