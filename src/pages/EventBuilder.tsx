import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Lock, Check, Sparkles,
  ArrowLeft, ArrowRight, Save, Ticket,
  ExternalLink, Wand2, AlertCircle,
  MapPin, Calendar,
  IndianRupee, ChevronRight,
  ShieldCheck, FileText,
  PartyPopper, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { DatePicker } from '@/components/ui/DatePicker'
import { cn, generateSlug } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { parseEventDocument } from '@/lib/groq'
import type { ExtractedEventData } from '@/lib/groq'

const eventCategories = [
  'Conference', 'Workshop', 'Meetup', 'Festival',
  'Concert', 'Sports', 'Networking', 'College Fest',
  'Webinar', 'Other'
]

const shortDescriptionOptions = [
  'Annual college fest with competitions, performances, and events',
  'Tech conference for developers, innovators, and tech enthusiasts',
  'Cultural event showcasing music, dance, art, and creativity',
  'Hands-on workshop with expert-led learning sessions',
  'Live music concert featuring top artists and bands',
  'Sports tournament and athletic competition event',
  'Professional networking and community meetup',
  'Industry conference with expert speakers and panels',
  'Community gathering and social event for all ages',
  'Hackathon — build, innovate, and compete with the best',
  'Seminar with guest lectures and knowledge sessions',
  'Custom...',
]

// ===== TOGGLE COMPONENT =====
function ToggleSwitch({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className="w-full flex items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all duration-300 group cursor-pointer"
      style={{
        borderColor: enabled ? 'rgba(99, 102, 241, 0.3)' : 'rgba(0,0,0,0.06)',
        background: enabled ? 'rgba(99, 102, 241, 0.04)' : 'rgba(0,0,0,0.02)',
      }}
    >
      <div className="text-left">
        <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">
          {label}
        </p>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <div
        className="relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 ml-4"
        style={{
          background: enabled
            ? 'linear-gradient(135deg, #6366F1, #8B5CF6)'
            : 'rgba(0,0,0,0.08)',
          boxShadow: enabled ? '0 0 20px rgba(99, 102, 241, 0.2)' : 'none',
        }}
      >
        <motion.div
          className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg"
          animate={{ x: enabled ? 24 : 4 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
    </button>
  )
}

// ===== STEP INDICATOR DOTS =====
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            background: i <= current
              ? 'linear-gradient(135deg, #6366F1, #8B5CF6)'
              : 'rgba(0,0,0,0.08)',
            boxShadow: i === current ? '0 0 12px rgba(99, 102, 241, 0.3)' : 'none',
          }}
          layout
        />
      ))}
    </div>
  )
}

// ===== VISIBILITY CARDS =====
const visibilityCards = [
  {
    id: 'public' as const,
    icon: Globe,
    title: 'Public Event',
    subtitle: 'Listed on the events page & discoverable by everyone',
    gradient: 'from-primary/20 via-primary/5 to-transparent',
    borderGlow: 'rgba(99, 102, 241, 0.3)',
    accentColor: '#6366F1',
    features: [
      'Appears on /events and landing page',
      'SEO indexed for search discovery',
      'Anyone can find and register',
      'Maximum visibility & reach',
    ],
  },
  {
    id: 'private' as const,
    icon: Lock,
    title: 'Private Event',
    subtitle: 'Hidden from listings — only accessible via direct link',
    gradient: 'from-accent-rose/20 via-accent-teal/5 to-transparent',
    borderGlow: 'rgba(244, 63, 94, 0.3)',
    accentColor: '#F43F5E',
    features: [
      'Hidden from all public listings',
      'Shareable secret link only',
      'Perfect for invite-only events',
      'Exclusive, gated experience',
    ],
  },
]

export function EventBuilderPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // Phase: 'select' | 'create'
  const [phase, setPhase] = useState<'select' | 'create'>('select')
  const [selectedVisibility, setSelectedVisibility] = useState<'public' | 'private' | null>(null)
  const [zoomingCard, setZoomingCard] = useState(false)

  // Form step
  const [formStep, setFormStep] = useState(0) // 0=upload, 1=details, 2=payment

  // Upload / manual toggle
  const [manualMode, setManualMode] = useState(false)
  const [customShortDesc, setCustomShortDesc] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parseProgress, setParseProgress] = useState('')
  const [parseError, setParseError] = useState('')
  const [parsedSuccess, setParsedSuccess] = useState(false)

  // Event data
  const [eventData, setEventData] = useState({
    title: '',
    description: '',
    shortDescription: '',
    category: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    venueName: '',
    venueAddress: '',
    city: '',
    state: '',
    maxAttendees: '',
    useExternalForm: false,
    formLink: '',
    ticketing: {
      isFree: true,
      price: '',
      quantity: '',
    },
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ===== SELECT VISIBILITY (with zoom animation) =====
  const handleSelectVisibility = useCallback((visibility: 'public' | 'private') => {
    setSelectedVisibility(visibility)
    setZoomingCard(true)
    // Wait for zoom animation, then switch phase
    setTimeout(() => {
      setPhase('create')
      setZoomingCard(false)
    }, 500)
  }, [])

  const handleBackToSelect = useCallback(() => {
    setPhase('select')
    setSelectedVisibility(null)
    setFormStep(0)
    setManualMode(false)
    setCustomShortDesc(false)
    setParsedSuccess(false)
    setParseError('')
    setParseProgress('')
    setEventData({
      title: '', description: '', shortDescription: '', category: '',
      startDate: '', endDate: '', startTime: '', endTime: '',
      venueName: '', venueAddress: '', city: '', state: '',
      maxAttendees: '', useExternalForm: false, formLink: '',
      ticketing: { isFree: true, price: '', quantity: '' },
    })
  }, [])

  // ===== DOCUMENT UPLOAD & AI PARSING =====
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsParsing(true)
    setParseProgress('Reading document...')
    setParseError('')
    setParsedSuccess(false)

    try {
      const data = await parseEventDocument(file, (msg) => setParseProgress(msg))
      if (data) {
        applyExtractedData(data)
        setParsedSuccess(true)
        setParseProgress('✨ All fields auto-filled! Review below.')
        setTimeout(() => setParseProgress(''), 3000)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setParseError(msg || 'Failed to parse document')
    } finally {
      setIsParsing(false)
      if (e.target) e.target.value = ''
    }
  }

  const applyExtractedData = (data: ExtractedEventData) => {
    setEventData(prev => ({
      ...prev,
      title: data.title || prev.title,
      description: data.description || prev.description,
      shortDescription: data.shortDescription || prev.shortDescription,
      category: data.category || prev.category,
      startDate: data.startDate || prev.startDate,
      endDate: data.endDate || prev.endDate,
      startTime: data.startTime || prev.startTime,
      endTime: data.endTime || prev.endTime,
      venueName: data.venueName || prev.venueName,
      venueAddress: data.venueAddress || prev.venueAddress,
      city: data.city || prev.city,
      state: data.state || prev.state,
      maxAttendees: data.maxAttendees || prev.maxAttendees,
    }))
  }

  const updateField = (field: string, value: string) => {
    setEventData(prev => ({ ...prev, [field]: value }))
  }

  // ===== PUBLISH =====
  const handlePublish = async () => {
    setSaving(true)
    setSaveError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      const slug = generateSlug(eventData.title)
      const ticketQty = eventData.ticketing.quantity ? parseInt(eventData.ticketing.quantity) : 0
      const ticketPrice = eventData.ticketing.isFree ? 0 : (parseInt(eventData.ticketing.price) || 0)

      // Strategy 1: Try RPC function (bypasses RLS — runs as SECURITY DEFINER)
      // Requires supabase/rpc-create-event.sql to be run in Supabase SQL Editor
      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_event_with_ticket_type', {
        p_title: eventData.title,
        p_slug: slug,
        p_description: eventData.description || '',
        p_short_description: eventData.shortDescription || null,
        p_venue_name: eventData.venueName || null,
        p_venue_address: eventData.venueAddress || null,
        p_city: eventData.city || null,
        p_state: eventData.state || null,
        p_start_date: eventData.startDate,
        p_end_date: eventData.endDate,
        p_start_time: eventData.startTime,
        p_end_time: eventData.endTime,
        p_category: eventData.category || 'other',
        p_visibility: selectedVisibility || 'public',
        p_max_attendees: ticketQty || null,
        p_use_external_form: eventData.useExternalForm,
        p_form_link: eventData.formLink || null,
        p_ticket_name: eventData.ticketing.isFree ? 'Free Entry' : 'General Admission',
        p_ticket_price: ticketPrice,
        p_ticket_quantity: ticketQty,
      })

      if (!rpcError && rpcResult && !rpcResult.error) {
        navigate(`/dashboard/events`)
        return
      }

      // Strategy 2: RPC not available — fall back to direct inserts with RLS fix
      // Find or create organization
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('owner_id', user.id)
        .limit(1)

      let orgId: string
      if (!orgs || orgs.length === 0) {
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: `${user.user_metadata?.full_name || 'My'} Organization`,
            slug: generateSlug(user.email?.split('@')[0] || 'my-org'),
            owner_id: user.id,
          })
          .select('id')
          .single()

        if (orgError) { setSaveError(orgError.message); setSaving(false); return }
        orgId = newOrg!.id
      } else {
        orgId = orgs[0].id
      }

      // CRITICAL FIX: Always ensure org_members row exists with active status
      // Try RPC first (bypasses RLS if function exists on Supabase),
      // then fall back to direct insert
      const { error: memberError } = await supabase.rpc('ensure_org_member', {
        p_org_id: orgId,
      })

      // If RPC doesn't exist, try direct insert (requires RLS policy on org_members)
      if (memberError && memberError.message?.includes('function "ensure_org_member" does not exist')) {
        const { data: existingMembership } = await supabase
          .from('org_members')
          .select('id')
          .eq('org_id', orgId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!existingMembership) {
          const { error: directError } = await supabase.from('org_members').insert({
            org_id: orgId, user_id: user.id, role: 'owner', status: 'active',
          })
          if (directError) { setSaveError(directError.message); setSaving(false); return }
        }
      } else if (memberError) {
        setSaveError(memberError.message)
        setSaving(false)
        return
      }

      // Create the event
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          org_id: orgId,
          title: eventData.title,
          slug,
          description: eventData.description || '',
          short_description: eventData.shortDescription || null,
          venue_name: eventData.venueName || null,
          venue_address: eventData.venueAddress || null,
          city: eventData.city || null,
          state: eventData.state || null,
          start_date: eventData.startDate,
          end_date: eventData.endDate,
          start_time: eventData.startTime,
          end_time: eventData.endTime,
          category: eventData.category || 'other',
          status: 'published',
          visibility: selectedVisibility || 'public',
          max_attendees: ticketQty || null,
          use_external_form: eventData.useExternalForm,
          form_link: eventData.formLink || null,
        })
        .select('id')
        .single()

      if (eventError) { setSaveError(eventError.message); setSaving(false); return }

      const { error: ticketError } = await supabase
        .from('ticket_types')
        .insert({
          event_id: event.id,
          name: eventData.ticketing.isFree ? 'Free Entry' : 'General Admission',
          price: ticketPrice,
          quantity: ticketQty,
          max_per_order: 5,
          is_active: true,
          sort_order: 0,
        })

      if (ticketError) { setSaveError(ticketError.message); setSaving(false); return }

      navigate(`/dashboard/events`)
    } catch {
      setSaveError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const accentColor = selectedVisibility === 'public' ? '#6366F1' : '#F43F5E'

  // ===== ANIMATION VARIANTS =====
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 } as const,
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 20 } },
  }

  // ===== RENDER =====
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient background — slowly shifting ambient glow */}
      <motion.div
        className="absolute inset-0 -z-10 pointer-events-none"
        animate={{
          background: [
            'radial-gradient(ellipse 60% 50% at 20% 30%, rgba(99,102,241,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 70%, rgba(245,158,11,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 50% 50%, rgba(244,63,94,0.04) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 50% at 30% 40%, rgba(245,158,11,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 70% 60%, rgba(99,102,241,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 40% 50%, rgba(16,185,129,0.04) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 50% at 50% 20%, rgba(244,63,94,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 60% 80%, rgba(99,102,241,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 30% 60%, rgba(245,158,11,0.04) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 50% at 20% 30%, rgba(99,102,241,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 70%, rgba(245,158,11,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 50% 50%, rgba(244,63,94,0.04) 0%, transparent 60%)',
          ],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* ===== PHASE: SELECT VISIBILITY ===== */}
      <AnimatePresence mode="wait">
        {phase === 'select' && !zoomingCard && (
          <motion.div
            key="select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="min-h-screen flex flex-col -mt-[4.625rem]"
          >
            {/* Back button — pinned top */}
            <div className="px-6 sm:px-10 pt-14 w-full">
              <button
                onClick={() => navigate('/dashboard/events')}
                className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to events
              </button>
            </div>

            {/* Center content */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10">
              <div className="w-full max-w-7xl">

                {/* Header */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mb-12"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent-rose/20 border border-primary/20 mx-auto mb-6 flex items-center justify-center"
                  >
                    <PartyPopper className="h-8 w-8 text-primary" />
                  </motion.div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-text-primary mb-3">
                    Create Your Event
                  </h1>
                  <p className="text-text-secondary text-lg max-w-md mx-auto">
                    First, choose how your event will be listed
                  </p>
                </motion.div>

                {/* Two cards */}
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                  className="grid sm:grid-cols-2 gap-8 xl:gap-12"
                >
                  {visibilityCards.map((card) => {
                    const Icon = card.icon
                    return (
                      <motion.button
                        key={card.id}
                        variants={itemVariants}
                        onClick={() => handleSelectVisibility(card.id)}
                        className="relative group text-left w-full"
                      >
                        {/* Glow bg */}
                        <div
                          className="absolute -inset-0.5 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-all duration-500"
                          style={{ background: card.borderGlow }}
                        />

                        {/* Card */}
                        <div
                          className="relative p-8 sm:p-10 lg:p-12 rounded-3xl border-2 transition-all duration-300 overflow-hidden group-hover:scale-[1.02]"
                          style={{
                            borderColor: `${card.accentColor}25`,
                            background: `linear-gradient(135deg, ${card.accentColor}08 0%, rgba(255,255,255,0.01) 100%)`,
                            boxShadow: `0 0 0 1px ${card.accentColor}10`,
                          }}
                        >
                          {/* Hover gradient overlay */}
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{
                              background: `radial-gradient(ellipse at 50% 0%, ${card.accentColor}20 0%, transparent 70%)`,
                            }}
                          />

                          {/* Icon */}
                          <div
                            className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                            style={{
                              background: `${card.accentColor}15`,
                              borderColor: `${card.accentColor}30`,
                              borderWidth: 1,
                            }}
                          >
                            <Icon
                              className="h-7 w-7 transition-all duration-300"
                              style={{ color: card.accentColor }}
                            />
                          </div>

                          {/* Title */}
                          <h2
                            className="relative text-2xl font-bold mb-2 transition-all duration-300"
                            style={{
                              color: card.accentColor,
                              textShadow: `0 0 40px ${card.accentColor}30`,
                            }}
                          >
                            {card.title}
                          </h2>
                          <p className="relative text-text-secondary text-sm mb-6 leading-relaxed">
                            {card.subtitle}
                          </p>

                          {/* Features */}
                          <div className="relative space-y-3 mb-8">
                            {card.features.map((feat, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                  style={{ background: `${card.accentColor}20` }}
                                >
                                  <Check className="h-3 w-3" style={{ color: card.accentColor }} />
                                </div>
                                <span className="text-sm text-text-secondary">{feat}</span>
                              </div>
                            ))}
                          </div>

                          {/* CTA */}
                          <div className="relative flex items-center gap-2 text-sm font-semibold transition-all duration-300 group-hover:gap-3"
                            style={{ color: card.accentColor }}
                          >
                            Select {card.title.split(' ')[0]}
                            <ChevronRight className="h-4 w-4 transition-all duration-300 group-hover:translate-x-1" />
                          </div>

                          {/* Corner decoration */}
                          <div
                            className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-0 group-hover:opacity-30 transition-all duration-700"
                            style={{
                              background: `radial-gradient(circle, ${card.accentColor}40 0%, transparent 70%)`,
                            }}
                          />
                        </div>
                      </motion.button>
                    )
                  })}
                </motion.div>

                {/* Bottom note */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="text-center mt-10 text-text-muted text-xs"
                >
                  You can change visibility settings anytime from the event dashboard
                </motion.p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ===== ZOOM ANIMATION OVERLAY ===== */}
        {zoomingCard && selectedVisibility && (
          <motion.div
            key="zoom"
            initial={{ scale: 0.8, opacity: 0, borderRadius: '24px' }}
            animate={{ scale: 1, opacity: 1, borderRadius: '0px' }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.99) 100%)`,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
                style={{
                  background: `${accentColor}20`,
                  borderColor: `${accentColor}40`,
                  borderWidth: 1,
                }}
              >
                {selectedVisibility === 'public'
                  ? <Globe className="h-8 w-8" style={{ color: accentColor }} />
                  : <Lock className="h-8 w-8" style={{ color: accentColor }} />
                }
              </div>
              <p className="text-lg font-semibold text-text-primary">
                {selectedVisibility === 'public' ? 'Public Event' : 'Private Event'}
              </p>
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: accentColor }} />
            </motion.div>
          </motion.div>
        )}

        {/* ===== PHASE: CREATE EVENT FORM ===== */}
        {phase === 'create' && !zoomingCard && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-5xl mx-auto px-6 sm:px-10 py-8"
          >
            {/* Back + visibility badge */}
            <div className="flex items-center justify-between mb-8">
              <button
                onClick={handleBackToSelect}
                className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-all text-sm group"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                Change visibility
              </button>
              <Badge variant={selectedVisibility === 'public' ? 'primary' : 'accent'}>
                {selectedVisibility === 'public' ? '🌍 Public' : '🔒 Private'}
              </Badge>
            </div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8"
            >
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">
                {selectedVisibility === 'public'
                  ? 'Share with the World'
                  : 'Create Something Exclusive'}
              </h1>
              <p className="text-text-secondary text-sm">
                {selectedVisibility === 'public'
                  ? 'Your event will be listed publicly for everyone to discover.'
                  : 'Your event stays hidden — only people with the link can find it.'
                }
              </p>
            </motion.div>

            {/* Step dots */}
            <div className="mb-8">
              <StepDots current={formStep} total={3} />
              <div className="flex justify-between mt-3 text-xs text-text-muted px-2">
                <span className={formStep >= 0 ? 'text-primary font-medium' : ''}>Brochure</span>
                <span className={formStep >= 1 ? 'text-primary font-medium' : ''}>Details</span>
                <span className={formStep >= 2 ? 'text-primary font-medium' : ''}>Payment</span>
              </div>
            </div>

            <div ref={formRef} className="space-y-8">
              {/* ===== STEP 0: BROCHURE UPLOAD ===== */}
              {formStep === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Upload area */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Wand2 className="h-5 w-5" style={{ color: accentColor }} />
                      <h2 className="text-lg font-bold text-text-primary">Do you have a brochure or flyer?</h2>
                    </div>
                    <p className="text-text-muted text-sm mb-5">
                      Upload a PDF or image — we&apos;ll auto-fill all the details using AI. Saves you minutes.
                    </p>

                    <div
                      onClick={() => !isParsing && !parsedSuccess && fileInputRef.current?.click()}
                      className={cn(
                        'relative overflow-hidden p-10 sm:p-14 rounded-3xl border-2 border-dashed text-center cursor-pointer transition-all duration-300',
                        isParsing && 'pointer-events-none',
                        parsedSuccess
                          ? 'border-success/40 bg-success/5'
                          : 'hover:border-primary/40 hover:bg-white/[0.02]',
                      )}
                      style={{
                        borderColor: parsedSuccess
                          ? 'rgba(16, 185, 129, 0.4)'
                          : isParsing
                            ? `${accentColor}50`
                            : 'rgba(0,0,0,0.08)',
                        background: isParsing
                          ? `${accentColor}08`
                          : parsedSuccess
                            ? 'rgba(16, 185, 129, 0.05)'
                            : 'rgba(0,0,0,0.02)',
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,image/*,.txt"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isParsing}
                      />

                      <AnimatePresence mode="wait">
                        {isParsing ? (
                          <motion.div
                            key="parsing"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-4"
                          >
                            <div className="relative">
                              <div
                                className="h-16 w-16 rounded-full flex items-center justify-center"
                                style={{ background: `${accentColor}15` }}
                              >
                                <motion.div
                                  className="h-10 w-10 rounded-full border-2 border-t-transparent"
                                  style={{
                                    borderColor: `${accentColor}80`,
                                    borderTopColor: 'transparent',
                                  }}
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                />
                              </div>
                            </div>
                            <p className="font-semibold text-base" style={{ color: accentColor }}>
                              {parseProgress}
                            </p>
                            <p className="text-text-muted text-xs">Analyzing with AI...</p>
                          </motion.div>
                        ) : parsedSuccess ? (
                          <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-3"
                          >
                            <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center">
                              <Check className="h-8 w-8 text-success" />
                            </div>
                            <p className="text-success font-semibold text-base">✨ Brochure parsed successfully!</p>
                            <p className="text-text-muted text-xs">All fields filled below — scroll down to review</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setParsedSuccess(false)
                                setManualMode(true)
                              }}
                            >
                              Re-upload or edit manually
                            </Button>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="upload"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center gap-4"
                          >
                            {/* Decorative circles */}
                            <div className="relative">
                              <div className="absolute -inset-4 rounded-full opacity-30 blur-xl"
                                style={{ background: `radial-gradient(circle, ${accentColor}30 0%, transparent 70%)` }}
                              />
                              <div
                                className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
                                style={{
                                  background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}05)`,
                                  borderColor: `${accentColor}30`,
                                  borderWidth: 1,
                                }}
                              >
                                <FileText className="h-10 w-10" style={{ color: accentColor }} />
                              </div>
                            </div>

                            <div>
                              <p className="text-text-primary font-semibold text-lg mb-1">
                                Click to upload event brochure, flyer, or PDF
                              </p>
                              <p className="text-text-muted text-sm">
                                Supports PDF, PNG, JPG, TXT
                              </p>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-text-muted">
                              <span className="flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-primary" />
                                AI auto-fill
                              </span>
                              <span className="w-1 h-1 rounded-full bg-text-muted" />
                              <span className="flex items-center gap-1">
                                <Check className="h-3 w-3 text-success" />
                                No account needed
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Pulse ring on hover when idle */}
                      {!isParsing && !parsedSuccess && (
                        <div
                          className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{
                            background: `radial-gradient(ellipse at 50% 50%, ${accentColor}08 0%, transparent 60%)`,
                          }}
                        />
                      )}
                    </div>

                    {parseError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-4 bg-red-500/15 border border-red-500/25 rounded-2xl text-red-400 text-sm flex items-start gap-3"
                      >
                        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold mb-1">Could not read document</p>
                          <p className="text-red-400/80">{parseError}</p>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Manual mode toggle */}
                  <div className={cn('transition-all duration-300', parsedSuccess && 'opacity-50 pointer-events-none')}>
                    <ToggleSwitch
                      enabled={manualMode}
                      onChange={setManualMode}
                      label="I'll enter details manually"
                      description={parsedSuccess ? 'Already filled by brochure — toggle to override' : 'Skip the upload and type everything yourself'}
                    />
                  </div>

                  {/* Quick tip */}
                  <div
                    className="p-4 rounded-2xl border text-sm flex items-start gap-3"
                    style={{
                      borderColor: `${accentColor}20`,
                      background: `${accentColor}08`,
                    }}
                  >
                    <Sparkles className="h-5 w-5 shrink-0 mt-0.5" style={{ color: accentColor }} />
                    <div>
                      <p className="font-semibold text-text-primary mb-1">Pro tip</p>
                      <p className="text-text-secondary text-xs leading-relaxed">
                        Upload a brochure PDF or event poster image and we&apos;ll extract the title, description, dates, venue,
                        and more automatically. Everything is editable afterwards.
                      </p>
                    </div>
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-end pt-4">
                    <Button
                      variant="gradient"
                      onClick={() => setFormStep(1)}
                      disabled={!manualMode && !parsedSuccess && !eventData.title}
                    >
                      Continue to Details
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ===== STEP 1: EVENT DETAILS ===== */}
              {formStep === 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${accentColor}20` }}
                    >
                      <FileText className="h-4 w-4" style={{ color: accentColor }} />
                    </div>
                    <h2 className="text-lg font-bold text-text-primary">Event Details</h2>
                  </div>

                  {/* Auto-filled indicator */}
                  {parsedSuccess && (
                    <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-success text-sm flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Auto-filled from brochure — edit any field below
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="sm:col-span-2">
                      <Input
                        label="Event Title"
                        placeholder="e.g., Tech Conference 2026"
                        value={eventData.title}
                        onChange={(e) => updateField('title', e.target.value)}
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Textarea
                        label="Description"
                        placeholder="Describe what your event is about..."
                        value={eventData.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-text-primary mb-2">Short Description</label>
                      <div className="flex flex-wrap gap-2">
                        {shortDescriptionOptions.map((opt) => {
                          const isCustom = opt === 'Custom...'
                          const isSelected = isCustom
                            ? customShortDesc
                            : eventData.shortDescription === opt
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                if (isCustom) {
                                  setCustomShortDesc(true)
                                  updateField('shortDescription', '')
                                } else {
                                  setCustomShortDesc(false)
                                  updateField('shortDescription', opt)
                                }
                              }}
                              className={cn(
                                'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                                isSelected
                                  ? 'border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                                  : 'border-border text-text-secondary hover:text-text-primary hover:border-primary/30 bg-surface/50'
                              )}
                            >
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                      {customShortDesc && (
                        <Input
                          placeholder="Type your own short description..."
                          value={eventData.shortDescription}
                          onChange={(e) => updateField('shortDescription', e.target.value)}
                          className="mt-2"
                        />
                      )}
                      {!eventData.shortDescription && !customShortDesc && (
                        <p className="text-xs text-text-muted mt-2">Pick a preset or select &quot;Custom...&quot; to write your own</p>
                      )}
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-3">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {eventCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => updateField('category', cat.toLowerCase())}
                          className={cn(
                            'px-4 py-2 rounded-full text-sm font-medium transition-all border',
                            eventData.category === cat.toLowerCase()
                              ? 'border-primary bg-primary/20 text-primary shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                              : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-primary/30'
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Date & Time */}
                  <div className="p-5 rounded-2xl border border-border bg-surface/50">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-text-primary">Date & Time</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <DatePicker
                        label="Start Date"
                        value={eventData.startDate}
                        onChange={(v) => updateField('startDate', v)}
                        required
                      />
                      <DatePicker
                        label="End Date"
                        value={eventData.endDate}
                        onChange={(v) => updateField('endDate', v)}
                        minDate={eventData.startDate ? new Date(eventData.startDate) : undefined}
                        required
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4 mt-4">
                      <Input
                        label="Start Time"
                        type="time"
                        value={eventData.startTime}
                        onChange={(e) => updateField('startTime', e.target.value)}
                        required
                      />
                      <Input
                        label="End Time"
                        type="time"
                        value={eventData.endTime}
                        onChange={(e) => updateField('endTime', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Venue */}
                  <div className="p-5 rounded-2xl border border-border bg-surface/50">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="h-4 w-4 text-accent-rose" />
                      <span className="text-sm font-semibold text-text-primary">Venue</span>
                    </div>
                    <div className="space-y-4">
                      <Input
                        label="Venue Name"
                        placeholder="e.g., Bangalore International Centre"
                        value={eventData.venueName}
                        onChange={(e) => updateField('venueName', e.target.value)}
                      />
                      <Input
                        label="Venue Address"
                        placeholder="Full address"
                        value={eventData.venueAddress}
                        onChange={(e) => updateField('venueAddress', e.target.value)}
                      />
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Input
                          label="City"
                          placeholder="e.g., Bangalore"
                          value={eventData.city}
                          onChange={(e) => updateField('city', e.target.value)}
                        />
                        <Input
                          label="State"
                          placeholder="e.g., Karnataka"
                          value={eventData.state}
                          onChange={(e) => updateField('state', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Registration Method */}
                  <div className="p-5 rounded-2xl border border-border bg-surface/50">
                    <div className="flex items-center gap-2 mb-4">
                      <Ticket className="h-4 w-4 text-accent-teal" />
                      <span className="text-sm font-semibold text-text-primary">Registration Method</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <button
                        type="button"
                        onClick={() => setEventData(prev => ({ ...prev, useExternalForm: false, formLink: '' }))}
                        className={cn(
                          'px-5 py-3 rounded-xl border-2 text-sm font-semibold transition-all flex-1 text-center',
                          !eventData.useExternalForm
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border text-text-secondary hover:border-white/30'
                        )}
                      >
                        <Ticket className="h-4 w-4 mx-auto mb-1" />
                        Use MakeYourPass Ticketing
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventData(prev => ({ ...prev, useExternalForm: true }))}
                        className={cn(
                          'px-5 py-3 rounded-xl border-2 text-sm font-semibold transition-all flex-1 text-center',
                          eventData.useExternalForm
                            ? 'bg-accent-rose/20 border-accent-rose text-accent-rose'
                            : 'border-border text-text-secondary hover:border-white/30'
                        )}
                      >
                        <ExternalLink className="h-4 w-4 mx-auto mb-1" />
                        Use External Form
                      </button>
                    </div>
                    {eventData.useExternalForm && (
                      <Input
                        label="Form Link"
                        type="url"
                        placeholder="https://forms.google.com/..."
                        value={eventData.formLink}
                        onChange={(e) => updateField('formLink', e.target.value)}
                        hint="Attendees will be redirected to this link to register"
                      />
                    )}
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between pt-4">
                    <Button variant="ghost" onClick={() => setFormStep(0)}>
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button variant="gradient" onClick={() => setFormStep(2)}>
                      Continue to Payment
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ===== STEP 2: PAYMENT & TICKETING ===== */}
              {formStep === 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${accentColor}20` }}
                    >
                      <IndianRupee className="h-4 w-4" style={{ color: accentColor }} />
                    </div>
                    <h2 className="text-lg font-bold text-text-primary">Tickets & Pricing</h2>
                  </div>

                  {eventData.useExternalForm ? (
                    <div className="p-8 bg-accent-rose/10 border border-accent-rose/20 rounded-3xl text-center">
                      <ExternalLink className="h-12 w-12 text-accent-rose mx-auto mb-4" />
                      <p className="text-text-primary font-semibold text-lg mb-2">External Form Mode</p>
                      <p className="text-text-secondary text-sm max-w-sm mx-auto">
                        Ticket management is handled by your external form provider.
                        No payment setup needed here.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Free / Paid toggle */}
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, isFree: true } }))}
                          className={cn(
                            'relative p-6 rounded-2xl border-2 text-center transition-all duration-300 overflow-hidden',
                            eventData.ticketing.isFree
                              ? 'bg-success/10 border-success text-success shadow-[0_0_30px_rgba(16,185,129,0.1)]'
                              : 'bg-surface border-border text-text-secondary hover:border-white/30'
                          )}
                        >
                          {eventData.ticketing.isFree && (
                            <motion.div
                              layoutId="tick-bg"
                              className="absolute inset-0 bg-gradient-to-b from-success/10 to-transparent"
                              initial={false}
                            />
                          )}
                          <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center mx-auto mb-3">
                              <Ticket className="h-5 w-5 text-success" />
                            </div>
                            <p className="font-bold text-lg mb-1">Free</p>
                            <p className="text-xs opacity-60">No cost to attend</p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, isFree: false } }))}
                          className={cn(
                            'relative p-6 rounded-2xl border-2 text-center transition-all duration-300 overflow-hidden',
                            !eventData.ticketing.isFree
                              ? 'bg-primary/10 border-primary text-primary shadow-[0_0_30px_rgba(99,102,241,0.1)]'
                              : 'bg-surface border-border text-text-secondary hover:border-white/30'
                          )}
                        >
                          {!eventData.ticketing.isFree && (
                            <motion.div
                              layoutId="tick-bg"
                              className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent"
                              initial={false}
                            />
                          )}
                          <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center mx-auto mb-3">
                              <IndianRupee className="h-5 w-5 text-secondary" />
                            </div>
                            <p className="font-bold text-lg mb-1">Paid</p>
                            <p className="text-xs opacity-60">Sell tickets online</p>
                          </div>
                        </button>
                      </div>

                      {/* Price & Quantity */}
                      {!eventData.ticketing.isFree && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="grid sm:grid-cols-2 gap-4"
                        >
                          <Input
                            label="Ticket Price (₹)"
                            type="number"
                            placeholder="e.g., 499"
                            value={eventData.ticketing.price}
                            onChange={(e) => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, price: e.target.value } }))}
                          />
                          <Input
                            label="Number of Tickets"
                            type="number"
                            placeholder="e.g., 100"
                            value={eventData.ticketing.quantity}
                            onChange={(e) => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, quantity: e.target.value } }))}
                          />
                        </motion.div>
                      )}

                      {eventData.ticketing.isFree && (
                        <Input
                          label="Number of Tickets"
                          type="number"
                          placeholder="e.g., 100"
                          value={eventData.ticketing.quantity}
                          onChange={(e) => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, quantity: e.target.value } }))}
                          hint="How many free tickets are available?"
                        />
                      )}

                      {/* Payment info card */}
                      <div
                        className="p-5 rounded-2xl border flex items-start gap-4"
                        style={{
                          borderColor: `${accentColor}20`,
                          background: `${accentColor}06`,
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${accentColor}15` }}
                        >
                          <ShieldCheck className="h-5 w-5" style={{ color: accentColor }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-primary mb-1">Secure Payment Processing</p>
                          <p className="text-xs text-text-secondary leading-relaxed">
                            Tickets are processed securely via <strong className="text-text-primary">Razorpay</strong>.
                            Payment gateway fee (2% + GST) is deducted per transaction.
                            Funds settle to your bank account within 2-3 business days.
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-text-muted">
                        Need multiple ticket types (e.g., VIP, Early Bird)? You can add more after creating the event.
                      </p>
                    </>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between pt-4">
                    <Button variant="ghost" onClick={() => setFormStep(1)}>
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>

                    {saveError && (
                      <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm max-w-xs">
                        {saveError}
                      </div>
                    )}

                    <Button
                      variant="gradient"
                      onClick={handlePublish}
                      loading={saving}
                      className="text-base px-8"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Publishing...' : 'Publish Event'}
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
