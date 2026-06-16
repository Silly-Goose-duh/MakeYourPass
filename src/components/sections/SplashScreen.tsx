import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'

interface SplashScreenProps {
  onComplete: () => void
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'gone'>('visible')

  useEffect(() => {
    const timer = setTimeout(() => setPhase('exiting'), 4000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {phase !== 'gone' && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: '#08080D' }}
          exit={{
            x: '100%',
          }}
          transition={{
            duration: 1.4,
            ease: [0.32, 0.72, 0, 1],
          }}
          onAnimationComplete={() => {
            if (phase === 'exiting') setPhase('gone')
          }}
        >
          {/* Ambient gradient orbs */}
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

          {/* Liquid sweep overlay — trails the container with a soft gradient edge */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-20"
            exit={{
              x: '100%',
            }}
            transition={{
              duration: 1.6,
              ease: [0.32, 0.72, 0, 1],
              delay: 0.05,
            }}
            style={{
              background:
                'linear-gradient(to right, transparent 0%, rgba(8,8,13,0.6) 30%, rgba(8,8,13,0.9) 60%, #08080D 100%)',
              maskImage:
                'linear-gradient(to right, transparent 0%, black 40%, black 60%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 40%, black 60%, transparent 100%)',
              maskSize: '300% 100%',
              WebkitMaskSize: '300% 100%',
              maskPosition: '0% 0%',
              WebkitMaskPosition: '0% 0%',
            }}
          />

          {/* Content */}
          <div className="relative z-10 text-center px-6">
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
              <span className="gradient-text">CampusPass</span>
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
      )}
    </AnimatePresence>
  )
}
