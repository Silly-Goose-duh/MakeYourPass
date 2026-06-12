import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, MapPin, Clock, ExternalLink, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/utils'
import type { Event } from '@/types'

interface PublicEventModalProps {
  event: Event
  isOpen: boolean
  onClose: () => void
}

export function PublicEventModal({ event, isOpen, onClose }: PublicEventModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleRegister = () => {
    // If event has an external form link, redirect there
    if (event.use_external_form && event.form_link) {
      window.open(event.form_link, '_blank', 'noopener')
      onClose()
      return
    }
    // Otherwise go to the event page
    window.open(`/event/${event.slug}`, '_blank')
    onClose()
  }

  const handleQuickRegister = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Blurred backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="relative rounded-3xl border border-white/10 bg-black/90 backdrop-blur-2xl shadow-2xl shadow-yellow-400/10 overflow-hidden">
              {/* Glow accents */}
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-yellow-400/10 rounded-full blur-[60px]" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent-pink/10 rounded-full blur-[60px]" />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-all"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Content */}
              <div className="p-6 sm:p-8">
                {/* Gradient header area */}
                <div className="h-24 -mx-8 -mt-8 mb-6 bg-gradient-to-br from-yellow-400/20 via-accent-pink/10 to-accent-cyan/20 flex items-end px-8 pb-4">
                  <Badge variant="yellow" size="md">
                    {event.category.replace('_', ' ')}
                  </Badge>
                  {event.use_external_form && event.form_link && (
                    <Badge variant="pink" size="sm" className="ml-2">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      External
                    </Badge>
                  )}
                </div>

                {/* Event title */}
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-tight">
                  {event.title}
                </h2>

                {event.short_description && (
                  <p className="text-text-secondary text-sm mb-5 line-clamp-3">
                    {event.short_description}
                  </p>
                )}

                {/* Event details */}
                <div className="space-y-2.5 mb-6 text-sm">
                  <div className="flex items-center gap-2.5 text-text-secondary">
                    <Calendar className="h-4 w-4 text-yellow-400" />
                    <span>{formatDate(event.start_date)}</span>
                    {event.end_date && event.end_date !== event.start_date && (
                      <span>— {formatDate(event.end_date)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 text-text-secondary">
                    <Clock className="h-4 w-4 text-yellow-400" />
                    <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                  </div>
                  {(event.venue_name || event.city) && (
                    <div className="flex items-center gap-2.5 text-text-secondary">
                      <MapPin className="h-4 w-4 text-yellow-400" />
                      <span className="truncate">
                        {event.venue_name}{event.venue_name && event.city ? ', ' : ''}{event.city}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick register form */}
                {!submitted ? (
                  <form onSubmit={handleQuickRegister} className="space-y-3">
                    <p className="text-sm font-medium text-white">Quick Register</p>
                    <Input
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <Input
                      type="email"
                      placeholder="Your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <Input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <div className="flex gap-2 pt-1">
                      <Button type="submit" variant="gradient" size="md" glow fullWidth>
                        <Send className="h-4 w-4" />
                        Register Interest
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={handleRegister}
                      >
                        <ExternalLink className="h-4 w-4" />
                        {event.use_external_form ? 'Open Form' : 'View Page'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-6"
                  >
                    <div className="h-12 w-12 rounded-2xl bg-green-500/20 mx-auto mb-3 flex items-center justify-center">
                      <Sparkles className="h-6 w-6 text-green-400" />
                    </div>
                    <p className="text-white font-semibold mb-1">You're in! 🎉</p>
                    <p className="text-text-secondary text-sm">
                      We've noted your interest. Check your email for updates!
                    </p>
                    <div className="mt-4">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleRegister}
                      >
                        {event.use_external_form ? 'Complete Registration' : 'View Event Page'}
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
