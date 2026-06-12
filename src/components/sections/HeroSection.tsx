import { Suspense, lazy } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

const Scene3D = lazy(() => import('@/components/3d/ThreeHero').then(m => ({ default: m.Scene3D })))

const floatingEmojis = ['🎪', '✨', '🚀', '🎯', '⚡', '🎨']

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* 3D Background */}
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-text-muted text-sm font-medium">Loading experience...</p>
            </div>
          </div>
        }
      >
        <Scene3D />
      </Suspense>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent pointer-events-none" />

      {/* Floating decorative elements */}
      {floatingEmojis.map((emoji, i) => (
        <motion.div
          key={emoji}
          className="absolute pointer-events-none select-none text-3xl hidden md:block"
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.6, 0],
            scale: [0, 1, 0],
            x: [0, (i % 2 === 0 ? 1 : -1) * (80 + i * 30)],
            y: [0, -(60 + i * 20)],
          }}
          transition={{
            duration: 4 + i * 0.5,
            delay: 1 + i * 0.3,
            repeat: Infinity,
            repeatDelay: 3,
          }}
          style={{
            left: `${15 + i * 12}%`,
            top: `${20 + (i % 3) * 15}%`,
          }}
        >
          {emoji}
        </motion.div>
      ))}

      {/* Content */}
      <div className="relative mx-auto px-6 max-w-7xl w-full pt-32 pb-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/[0.06] border border-white/10 text-yellow-400 text-sm font-medium mb-8 shadow-[0_0_20px_rgba(245,215,0,0.1)]"
          >
            <Zap className="h-4 w-4 fill-yellow-400" />
            <span>Now free for all organizers</span>
            <span className="w-1 h-1 rounded-full bg-yellow-400 inline-block" />
            <span className="text-text-muted">Built for college fests</span>
          </motion.div>

          {/* Main heading — Typography drama */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-bold leading-[1.02] tracking-tight mb-8"
          >
            <span className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl block">
              Your Event,
            </span>
            <span className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl gradient-text block mt-2">
              Zero Drama
            </span>
          </motion.h1>

          {/* Subtitle — punchy, youthful */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-lg sm:text-xl md:text-2xl text-text-secondary max-w-3xl mx-auto mb-12 leading-relaxed"
          >
            Create stunning event pages, sell tickets in seconds, and check in guests —
            <span className="text-white font-semibold"> no fees, no coding, no nonsense.</span>
          </motion.p>

          {/* CTA Buttons — Distinctive */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/signup">
              <Button variant="gradient" size="xl" glow className="group text-lg px-10">
                Create Your First Event
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="/#how-it-works">
              <Button variant="secondary" size="xl" className="text-lg px-8">
                See How It Works
              </Button>
            </a>
          </motion.div>

          {/* Social proof — minimal, no fake stats */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-10 text-sm text-text-muted"
          >
            Trusted by college fests across India —{' '}
            <span className="text-text-secondary underline underline-offset-2 decoration-white/20">
              no credit card required
            </span>
          </motion.p>
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
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-xs text-text-muted tracking-widest uppercase">
            Scroll
          </span>
          <div className="w-[2px] h-8 bg-gradient-to-b from-yellow-400 to-transparent rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
