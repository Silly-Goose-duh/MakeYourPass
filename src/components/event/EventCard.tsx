import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Calendar, Clock, MapPin, ArrowRight } from 'lucide-react'
import { zineColorFor, getDaysAway, isSoldOut, isPast, type EventWithOrg } from './eventUtils'

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

export function EventCard({ event }: { event: EventWithOrg }) {
  const orgName = event.organizations?.name ?? ''
  const c = zineColorFor(orgName || event.title)
  const daysAway = event.date ? getDaysAway(event.date) : ''
  const soldOut = isSoldOut(event)
  const past = isPast(event)
  // Sold-out = strongest dim+grayscale; past = lighter grayscale to differentiate.
  const cardStyle = soldOut
    ? { opacity: 0.6, filter: 'grayscale(0.9)' }
    : past
      ? { opacity: 0.85, filter: 'grayscale(0.55)' }
      : undefined
  return (
    <motion.div
      layout
      variants={itemVariants}
      transition={{ layout: { duration: 0.3 } }}
      className="zine-card group relative"
      style={cardStyle}
    >
      <Link to={`/event/${event.slug}`} className="block">
        {/* Poster band */}
        <div className="relative h-[120px] overflow-hidden flex items-center justify-center" style={{ background: c, borderBottom: '2.5px solid #14110E' }}>
          <span className="text-outline font-extrabold" style={{ fontFamily: 'Syne, sans-serif', fontSize: '3.5rem', opacity: 0.35, WebkitTextStrokeColor: '#14110E' }}>
            {orgName.charAt(0) || '★'}
          </span>
          <span className="zine-sticker absolute bottom-2 left-2" style={{ background: '#fff' }}>{orgName || 'Event'}</span>
          <span className="absolute top-0 right-0 px-2 py-1 text-[10px] font-extrabold uppercase text-white" style={{ background: '#14110E', fontFamily: 'Syne, sans-serif' }}>{daysAway}</span>
          {soldOut && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white" style={{ background: '#E11D1D', border: '2.5px solid #14110E', transform: 'rotate(-6deg)', fontFamily: 'Syne, sans-serif', boxShadow: '2px 2px 0 #14110E' }}>
              Sold out
            </span>
          )}
        </div>
        {/* Body */}
        <div className="p-4 space-y-3">
          <h3 className="text-base font-extrabold leading-tight line-clamp-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>{event.title}</h3>
          <div className="space-y-1.5">
            {event.date && (
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#4A4640' }}>
                <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                <span>{new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
            )}
            {event.time && (
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#4A4640' }}>
                <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /><span>{event.time.substring(0, 5)}</span>
              </div>
            )}
            {event.venue && (
              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#4A4640' }}>
                <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /><span className="truncate">{event.venue}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '2px solid #14110E' }}>
            <span className="pulse-dot" style={{ background: c }} />
            {past ? (
              <span className="inline-flex items-center gap-1 text-xs font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#7A756B' }}>
                View <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-extrabold uppercase" style={{ fontFamily: 'Syne, sans-serif', color: '#FF4D2E' }}>
                Register <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

