import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, MapPin, Clock, ExternalLink, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/utils'
import { useColorExtractor, type ExtractedPalette } from '@/hooks/useColorExtractor'
import type { Event } from '@/types'

interface PublicEventModalProps {
  event: Event
  isOpen: boolean
  onClose: () => void
}

function PaletteTheme({ palette, children }: { palette: ExtractedPalette; children: React.ReactNode }) {
  return (
    <div
      className="w-full h-full flex flex-col sm:flex-row"
      style={{
        backgroundColor: palette.bgLight,
        color: palette.primary,
      }}
    >
      {/* Color bar accents - top for mobile, left for desktop */}
      <div
        className="h-1 sm:h-full sm:w-1 sm:min-h-full shrink-0"
        style={{ background: `linear-gradient(180deg, ${palette.primary}, ${palette.secondary}, ${palette.accent})` }}
      />
      {children}
    </div>
  )
}

export function PublicEventModal({ event, isOpen, onClose }: PublicEventModalProps) {
  const { palette } = useColorExtractor(event?.cover_image_url ?? null)
  const { primary, secondary, accent, bgLight } = palette || { primary: '#6366F1', secondary: '#8B5CF6', accent: '#F59E0B', bgLight: '#F8FAFC', bgDark: '#6366F1' }

  const handleRegister = () => {
    if (event.use_external_form && event.form_link) {
      window.open(event.form_link, '_blank', 'noopener')
      onClose()
      return
    }
    window.open(`/event/${event.slug}`, '_blank')
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl"
            style={{ backgroundColor: bgLight }}
          >
            <PaletteTheme palette={palette}>
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-20 p-2 rounded-full bg-surface/80 backdrop-blur-sm hover:bg-surface shadow-md transition-all"
                style={{ color: primary }}
              >
                <X className="h-5 w-5" />
              </button>

              {/* LEFT: Poster */}
              <div className="relative w-full sm:w-[38%] lg:w-[42%] shrink-0 bg-black/5 flex items-start justify-center overflow-hidden">
                {event.cover_image_url ? (
                  <img
                    src={event.cover_image_url}
                    alt={event.title}
                    className="w-full h-full object-cover"
                    style={{ aspectRatio: '9/16', maxHeight: '85vh' }}
                  />
                ) : (
                  <div
                    className="w-full flex items-center justify-center"
                    style={{
                      aspectRatio: '9/16',
                      background: `linear-gradient(135deg, ${primary}22, ${secondary}11)`,
                    }}
                  >
                    <div className="text-center p-6">
                      <div
                        className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                        style={{ backgroundColor: `${primary}20` }}
                      >
                        <Ticket className="h-7 w-7" style={{ color: primary }} />
                      </div>
                      <p className="text-sm font-medium" style={{ color: primary }}>{event.title}</p>
                    </div>
                  </div>
                )}

                {/* Gradient overlay at bottom of poster */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-20"
                  style={{
                    background: `linear-gradient(to top, ${bgLight}, transparent)`,
                    display: 'none',
                  }}
                />
              </div>

              {/* RIGHT: Event Details */}
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 lg:p-10">
                {/* Category badge */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Badge
                    variant="primary"
                    size="md"
                    style={{
                      backgroundColor: `${primary}18`,
                      color: primary,
                      borderColor: `${primary}30`,
                    }}
                  >
                    {event.category.replace('_', ' ')}
                  </Badge>
                  {event.use_external_form && event.form_link && (
                    <Badge
                      variant="accent"
                      size="sm"
                      style={{
                        backgroundColor: `${accent}18`,
                        color: accent,
                        borderColor: `${accent}30`,
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      External
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h2
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 leading-tight"
                  style={{ color: primary }}
                >
                  {event.title}
                </h2>

                {/* Short description */}
                {event.short_description && (
                  <p className="text-sm sm:text-base mb-6 leading-relaxed" style={{ color: `${primary}cc` }}>
                    {event.short_description}
                  </p>
                )}

                {/* Full description */}
                {event.description && (
                  <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: `${primary}08` }}>
                    <p className="text-sm leading-relaxed" style={{ color: `${primary}aa` }}>
                      {event.description}
                    </p>
                  </div>
                )}

                {/* Details grid */}
                <div className="space-y-3 mb-8">
                  <div className="flex items-center gap-3 text-sm" style={{ color: `${primary}cc` }}>
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${primary}12` }}>
                      <Calendar className="h-4 w-4" style={{ color: primary }} />
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: `${primary}88` }}>Date</p>
                      <p className="font-medium" style={{ color: primary }}>
                        {formatDate(event.start_date)}
                        {event.end_date && event.end_date !== event.start_date && (
                          <> — {formatDate(event.end_date)}</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm" style={{ color: `${primary}cc` }}>
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${primary}12` }}>
                      <Clock className="h-4 w-4" style={{ color: primary }} />
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: `${primary}88` }}>Time</p>
                      <p className="font-medium" style={{ color: primary }}>
                        {formatTime(event.start_time)} — {formatTime(event.end_time)}
                      </p>
                    </div>
                  </div>

                  {(event.venue_name || event.city || event.state) && (
                    <div className="flex items-center gap-3 text-sm" style={{ color: `${primary}cc` }}>
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${primary}12` }}>
                        <MapPin className="h-4 w-4" style={{ color: primary }} />
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: `${primary}88` }}>Venue</p>
                        <p className="font-medium" style={{ color: primary }}>
                          {[event.venue_name, event.city, event.state].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Register button */}
                <Button
                  variant="primary"
                  size="lg"
                  glow
                  fullWidth
                  onClick={handleRegister}
                  className="text-base"
                  style={{
                    backgroundColor: primary,
                    borderColor: primary,
                    '--glow-color': `${primary}40`,
                  } as React.CSSProperties}
                >
                  <Ticket className="h-5 w-5" />
                  {event.use_external_form ? 'Register on External Site' : 'Get Tickets'}
                  <ExternalLink className="h-4 w-4" />
                </Button>

                <p className="text-xs text-center mt-3" style={{ color: `${primary}77` }}>
                  {event.use_external_form
                    ? 'You will be redirected to complete registration'
                    : 'Free registration — no payment required'}
                </p>
              </div>
            </PaletteTheme>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
