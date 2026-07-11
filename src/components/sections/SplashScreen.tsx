import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface SplashScreenProps {
  onComplete: () => void
}

/**
 * SplashScreen
 *
 * 1. Shows full-viewport branding for 2 seconds
 * 2. Content fades out (0.3s)
 * 3. Container wobbles off-screen right with a liquid slosh:
 *    - y oscillates (wave bounce)
 *    - scaleX pulses (liquid stretch/squeeze)
 *    - rotate tilts (wobble)
 *    - x slides right (the sweep)
 * 4. A gradient mask overlay creates a soft trailing edge
 * 5. Component removed from DOM → onComplete fires
 */
export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'sweeping' | 'gone'>('visible')

  // After 2s → start content fade
  useEffect(() => {
    if (phase !== 'visible') return
    const timer = setTimeout(() => setPhase('fading'), 2000)
    return () => clearTimeout(timer)
  }, [phase])

  // 0.3s after fade starts → begin the sweep
  useEffect(() => {
    if (phase !== 'fading') return
    const timer = setTimeout(() => setPhase('sweeping'), 300)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {phase !== 'gone' && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-50 overflow-hidden"
          style={{ backgroundColor: '#FFD23F' }}
          // ── Liquid wobble sweep ──
          animate={
            phase === 'sweeping'
              ? {
                  x: '100%',
                  y: [0, -14, 8, -4, 0],
                  scaleX: [1, 0.95, 1.05, 0.98, 1],
                  rotate: [0, -2, 1.5, -0.5, 0],
                }
              : { x: '0%', y: 0, scaleX: 1, rotate: 0 }
          }
          transition={{
            duration: 1.6,
            ease: [0.32, 0.72, 0, 1],
          }}
          onAnimationComplete={() => {
            if (phase === 'sweeping') setPhase('gone')
          }}
        >
          {/* ── Liquid gradient mask ──
              Creates a soft/blurry trailing edge as the container slides,
              mimicking the surface tension of a liquid sheet. */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            animate={
              phase === 'sweeping'
                ? { opacity: 1 }
                : { opacity: 0 }
            }
            transition={{ duration: 0.3 }}
            style={{
              background: `
                linear-gradient(to right,
                  transparent 0%,
                  rgba(255,210,63,0.3) 15%,
                  rgba(255,210,63,0.7) 35%,
                  #FFD23F 55%,
                  #FFD23F 100%
                )
              `,
              maskImage: `
                radial-gradient(ellipse 25% 100% at 0% 50%, black 0%, transparent 100%),
                linear-gradient(to right, black 50%, transparent 100%)
              `,
              WebkitMaskImage: `
                radial-gradient(ellipse 25% 100% at 0% 50%, black 0%, transparent 100%),
                linear-gradient(to right, black 50%, transparent 100%)
              `,
              maskComposite: 'add',
              WebkitMaskComposite: 'source-over',
            }}
          />

          {/* ── Ambient gradient orbs ── */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-3xl"
              style={{ backgroundColor: 'rgba(124, 58, 237, 0.08)' }}
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full blur-2xl"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)' }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.4, 0.8, 0.4],
              }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
          </div>

          {/* ── Content (fades out at 'fading' phase) ── */}
          <motion.div
            className="relative z-10 flex h-full items-center justify-center"
            animate={
              phase === 'fading' || phase === 'sweeping'
                ? { opacity: 0, scale: 1.05, y: -10 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={{ duration: 0.35, ease: 'easeIn' }}
          >
            <div className="text-center px-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-1.5 text-sm text-text-secondary"
              >
                <Sparkles className="h-4 w-4 text-secondary" />
                <span>Discover campus life</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.25 }}
                className="mb-4 text-5xl font-bold tracking-tight sm:text-7xl lg:text-8xl"
              >
                <span className="gradient-text">MakeYourPass</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.35 }}
                className="text-lg font-medium text-text-primary/80 sm:text-xl"
              >
                Get your pass. Show up. Done.
              </motion.p>

              {/* Animated loading dots */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-16 flex items-center justify-center gap-3"
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-primary/80"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
