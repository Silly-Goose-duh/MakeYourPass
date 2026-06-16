import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative text-center max-w-md"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.15, stiffness: 200 }}
          className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6"
        >
          <Sparkles className="h-10 w-10 text-primary/60" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-7xl font-bold gradient-text mb-2"
        >
          404
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl font-semibold text-text-primary mb-2"
        >
          Page not found
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-text-secondary text-sm mb-8"
        >
          This page doesn't exist or has been moved. Let's get you back on track.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-3"
        >
          <Link to="/">
            <Button variant="primary" size="lg">
              <ArrowLeft className="h-4 w-4" />
              Back to Events
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="ghost" size="lg">
              Sign In
            </Button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-12 text-xs text-text-muted"
        >
          CampusPass — Marian Engineering College
        </motion.p>
      </motion.div>
    </div>
  )
}
