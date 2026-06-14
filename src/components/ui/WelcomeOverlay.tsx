import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, ArrowRight, Zap, Ticket, QrCode, BarChart3 } from 'lucide-react'
import { Button } from './Button'

const STORAGE_KEY = 'makeyourpass_welcomed'

const tips = [
  {
    icon: Ticket,
    title: 'Create Events',
    desc: 'Build stunning event pages with ticket types, pricing, and custom branding.',
  },
  {
    icon: QrCode,
    title: 'QR Check-In',
    desc: 'Scan tickets at the door with your phone — fast, contactless entry.',
  },
  {
    icon: BarChart3,
    title: 'Live Analytics',
    desc: 'Track sales, check-ins, and revenue in real-time from your dashboard.',
  },
  {
    icon: Zap,
    title: 'Free to Start',
    desc: 'No setup costs, no hidden fees. You only pay when you sell tickets.',
  },
]

export function WelcomeOverlay() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const alreadySeen = localStorage.getItem(STORAGE_KEY)
    if (!alreadySeen) {
      const timer = setTimeout(() => setVisible(true), 1500)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.6 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl p-6 sm:p-8 z-10 border border-yellow-400/20"
          >
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 text-text-muted hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-yellow-400 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-black" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Welcome to <span className="text-yellow-400">MakeYour</span>Pass
                </h2>
                <p className="text-sm text-text-muted">Here's your quick headstart</p>
              </div>
            </div>

            {/* Tips */}
            <div className="space-y-3 mb-6">
              {tips.map((tip) => (
                <div key={tip.title} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="h-9 w-9 rounded-lg bg-yellow-400/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <tip.icon className="h-4 w-4 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{tip.title}</h3>
                    <p className="text-xs text-text-muted mt-0.5">{tip.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex gap-3">
              <Button variant="primary" size="md" fullWidth onClick={handleDismiss}>
                Got it, let's go!
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Skip hint */}
            <p className="text-center mt-3 text-xs text-text-muted">
              You can always find help in Settings
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
