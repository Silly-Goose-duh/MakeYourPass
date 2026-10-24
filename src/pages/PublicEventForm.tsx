import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Calendar, MapPin, Clock, Building2, AlertCircle, Palette, IndianRupee, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatTime, cn } from '@/lib/utils'
import {
  getEventBySlug,
  getEventQuestions,
  submitEventResponse,
  submitAuthenticatedEventResponse,
  submitResponseAnswers,
  getCurrentProfile,
  getOrganizationBySlug,
  getMyEventRegistration,
  updateProfile,
} from '@/lib/supabase'
import { DEPARTMENTS, SEMESTERS, isDepartment, isSemester, isValidAge } from '@/lib/studentProfile'
import { PaymentPanel } from '@/components/event/PaymentPanel'
import { TicketSuccess } from '@/components/event/TicketSuccess'
import { FreeTicketSuccess } from '@/components/event/FreeTicketSuccess'
import type { CampusEvent, Organization, EventQuestion, EventResponse } from '@/types'
import { useAuth } from '@/hooks/useAuth'

interface PosterTheme {
  palette: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  vibe: string
  isDark: boolean
  suggestedAccent: string
}

type CampusEventWithOrg = CampusEvent & { organizations: Organization }

/** Optional (migration-002-ready) fields read defensively off the event row. */
interface EventExtras {
  post_register_message?: string | null
  whatsapp_group_url?: string | null
}

/** Paid-flow stages reached after the first submit ("Continue"). */
type PaidStage = 'payment' | 'success' | 'waitlisted' | 'holdExpired'

/** Seat hold for paid registrations before the server self-cancels it (migration 002). */
const HOLD_WINDOW_MS = 15 * 60 * 1000

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * submit_event_response's return shape may be a bare uuid string, a full
 * event_responses row, or (post-migration-002) an { id, unique_code } payload —
 * and src/lib/supabase.ts additionally wraps it as { id: <rpc result> }.
 * Normalise all of those here.
 */
function extractRegistration(data: unknown): { id: string; uniqueCode: string } | null {
  if (isUuid(data)) return { id: data, uniqueCode: '' }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  const rawId = row.id
  if (rawId && typeof rawId === 'object' && !Array.isArray(rawId)) {
    const nested = rawId as Record<string, unknown>
    if (!isUuid(nested.id)) return null
    return { id: nested.id, uniqueCode: typeof nested.unique_code === 'string' ? nested.unique_code : '' }
  }
  if (!isUuid(rawId)) return null
  return { id: rawId, uniqueCode: typeof row.unique_code === 'string' ? row.unique_code : '' }
}

export function PublicEventForm() {
  const { eventSlug } = useParams<{ eventSlug: string }>()
  const { user, loading: authLoading } = useAuth()
  const [event, setEvent] = useState<CampusEventWithOrg | null>(null)
  const [questions, setQuestions] = useState<EventQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  // Poster-driven theme
  const [theme, setTheme] = useState<PosterTheme | null>(null)
  const [themeLoading, setThemeLoading] = useState(false)

  const [respondentName, setRespondentName] = useState('')
  const [respondentEmail, setRespondentEmail] = useState('')
  const [respondentPhone, setRespondentPhone] = useState('')
  const [respondentAge, setRespondentAge] = useState('')
  const [respondentSemester, setRespondentSemester] = useState('')
  const [respondentDepartment, setRespondentDepartment] = useState('')
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [resendEmail, setResendEmail] = useState('')
  const [resendBusy, setResendBusy] = useState(false)
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Paid flow (events.price > 0): registration id/code from the first submit,
  // the 15-minute seat hold, and the step the user is on.
  const [paidStage, setPaidStage] = useState<PaidStage | null>(null)
  const [freeReg, setFreeReg] = useState('')
  const [freeCode, setFreeCode] = useState('')
  const [paidRegId, setPaidRegId] = useState('')
  const [paidCode, setPaidCode] = useState('')
  const [holdExpiresAt, setHoldExpiresAt] = useState(0)
  const [ticketInfo, setTicketInfo] = useState<{ ticketImageUrl: string; uniqueCode: string } | null>(null)

  // Existing registration for this attendee (loaded before showing the form so
  // a pending paid registration can resume straight into PaymentPanel).
  const [existing, setExisting] = useState<EventResponse | null>(null)
  const [existingChecked, setExistingChecked] = useState(false)

  // UPI fields are not always present in the event→org embed select, so
  // fetch the club row the same way the page already loads data and merge
  // it with whatever the embed carries.
  const [upiFields, setUpiFields] = useState<Organization | null>(null)

  // Attendee details are collected once and reused for every event.
  useEffect(() => {
    if (!user) return
    getCurrentProfile().then(({ data }) => {
      if (!data) return
      setRespondentName((current) => current || data.full_name || '')
      setRespondentEmail((current) => current || data.email || user.email || '')
      setRespondentPhone((current) => current || data.phone || '')
      setRespondentAge((current) => current || (data.age ? String(data.age) : ''))
      setRespondentSemester((current) => current || data.semester || '')
      setRespondentDepartment((current) => current || data.department || '')
    }).catch(() => {})
  }, [user])

  // Load the event itself first (fast) so the page renders immediately.
  useEffect(() => {
    let cancelled = false
    let safetyTimer: ReturnType<typeof setTimeout> | undefined

    async function loadEvent() {
      if (!eventSlug) return
      setLoading(true)
      setError('')
      setNotFound(false)
      // Safety net: never let the form hang forever on a stalled request.
      safetyTimer = setTimeout(() => {
        if (!cancelled) {
          setLoading(false)
          setError('The event is taking too long to load. Check your connection and refresh.')
        }
      }, 12000)

      try {
        const { data: eventData, error: eventError } = await getEventBySlug(eventSlug)
        if (cancelled) return
        if (eventError || !eventData) {
          if (eventError?.message?.includes('RLS_RECURSION')) {
            setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
            return
          }
          setNotFound(true)
          return
        }
        setEvent(eventData as unknown as CampusEventWithOrg)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load event'
        if (message.includes('RLS_RECURSION')) {
          setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
        } else {
          setError(message)
        }
      } finally {
        if (!cancelled) setLoading(false)
        if (safetyTimer) clearTimeout(safetyTimer)
      }
    }
    loadEvent()
    return () => { cancelled = true; if (safetyTimer) clearTimeout(safetyTimer) }
  }, [eventSlug])

  // Load questions separately so the form header shows instantly.
  useEffect(() => {
    if (!event?.id) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuestionsLoading(true)
    getEventQuestions(event.id)
      .then(({ data }) => { if (!cancelled && data) setQuestions(data) })
      .catch(() => { /* keep empty; validation handles required */ })
      .finally(() => { if (!cancelled) setQuestionsLoading(false) })
    return () => { cancelled = true }
  }, [event?.id])

  // Resume an existing registration: a pending paid row reopens the payment
  // panel, while confirmed/waitlisted rows get a status card instead of the
  // form (previously they only found out after submitting again).
  useEffect(() => {
    if (!event?.id || !user) return
    let cancelled = false
    /* eslint-disable react-hooks/set-state-in-effect */
    setExisting(null)
    setExistingChecked(false)
    /* eslint-enable react-hooks/set-state-in-effect */
    getMyEventRegistration(event.id)
      .then(({ data }) => {
        if (cancelled) return
        setExisting(data)
        if (!data) return
        setRespondentName((current) => current || data.respondent_name || '')
        setRespondentEmail((current) => current || data.respondent_email || user.email || '')
        setRespondentPhone((current) => current || data.respondent_phone || '')
        setRespondentAge((current) => current || (data.age ? String(data.age) : ''))
        setRespondentSemester((current) => current || data.semester || '')
        setRespondentDepartment((current) => current || data.department || '')
        if (data.status === 'pending' && event.payment_type === 'paid') {
          const expires = data.hold_expires_at ? Date.parse(data.hold_expires_at) : 0
          if (!expires || expires > Date.now()) {
            setPaidRegId(data.id)
            setPaidCode(data.unique_code || '')
            setHoldExpiresAt(expires)
            setPaidStage('payment')
          } else {
            setPaidStage('holdExpired')
          }
        }
      })
      .catch(() => { /* the submit path still guards duplicates */ })
      .finally(() => { if (!cancelled) setExistingChecked(true) })
    return () => { cancelled = true }
  }, [event?.id, event?.payment_type, user])

  // When the event has a poster, analyze it with Groq to auto-theme the form.
  useEffect(() => {
    if (!event?.poster_url) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeLoading(true)
    fetch('/api/poster-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: event.poster_url }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('theme failed'))))
      .then((data: PosterTheme) => { if (!cancelled) setTheme(data) })
      .catch(() => { if (!cancelled) { /* keep default zine theme */ } })
      .finally(() => { if (!cancelled) setThemeLoading(false) })
    return () => { cancelled = true }
  }, [event?.poster_url])

  // Paid events only: grab the club's UPI setup (VPA / phone / uploaded QR) by
  // slug — the event embed may not select the upi_* columns.
  useEffect(() => {
    const slug = event?.organizations?.slug
    if (!slug) return
    let cancelled = false
    getOrganizationBySlug(slug)
      .then(({ data }) => { if (!cancelled && data) setUpiFields(data) })
      .catch(() => { /* fall back to whatever the event embed carries */ })
    return () => { cancelled = true }
  }, [event?.organizations?.slug])

  function getAnswer(questionId: string): string | string[] {
    return answers[questionId] ?? (questions.find(q => q.id === questionId)?.question_type === 'checkboxes' ? [] : '')
  }

  function setAnswer(questionId: string, value: string | string[]) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
    setErrors(prev => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  function handleCheckboxToggle(questionId: string, option: string) {
    const current = (getAnswer(questionId) as string[]) || []
    const next = current.includes(option)
      ? current.filter(v => v !== option)
      : [...current, option]
    setAnswer(questionId, next)
  }

  const isPaid = event?.payment_type === 'paid'
  const org = event?.organizations
  const upiVpa = upiFields?.upi_id || org?.upi_id || ''
  const upiPhone = upiFields?.upi_phone || org?.upi_phone || ''
  const orgQrUrl = upiFields?.upi_qr_url || org?.upi_qr_url || ''
  const price = event?.price || 0
  const extras = (event ?? {}) as EventExtras

  // Stable callbacks for PaymentPanel so its polling loops never re-run mid-flow.
  const handleConfirmed = useCallback((info: { ticketImageUrl: string; uniqueCode: string }) => {
    setTicketInfo({ ticketImageUrl: info.ticketImageUrl, uniqueCode: info.uniqueCode })
    setPaidStage('success')
  }, [])
  const handleWaitlisted = useCallback(() => setPaidStage('waitlisted'), [])
  const handleHoldExpired = useCallback(() => setPaidStage('holdExpired'), [])

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!respondentName.trim()) newErrors.name = 'Name is required'
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!respondentEmail.trim()) newErrors.email = 'Email is required'
    else if (!emailRe.test(respondentEmail.trim())) newErrors.email = 'Enter a valid email address'
    const digits = respondentPhone.replace(/[^\d]/g, '')
    if (!respondentPhone.trim()) newErrors.phone = 'Phone is required'
    else if (digits.length < 10 || digits.length > 15) {
      newErrors.phone = 'Enter a valid phone number'
    }
    if (!isValidAge(respondentAge)) newErrors.age = 'Enter an age between 10 and 100'
    if (!isSemester(respondentSemester)) newErrors.semester = 'Select your semester'
    if (!isDepartment(respondentDepartment)) newErrors.department = 'Select your department'
    for (const q of questions) {
      if (!q.required) continue
      const val = getAnswer(q.id)
      if (q.question_type === 'checkboxes') {
        if (!val || (val as string[]).length === 0) newErrors[q.id] = 'This field is required'
      } else if (!val || (val as string).trim() === '') {
        newErrors[q.id] = 'This field is required'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !event) return

    // Client rate limit: max 1 successful attempt / 20s per event in this browser
    try {
      const rk = `myp_reg_${event.id}`
      const last = Number(localStorage.getItem(rk) || '0')
      if (last && Date.now() - last < 20_000) {
        setError('Please wait a few seconds before trying again.')
        return
      }
    } catch { /* private mode */ }

    setSubmitting(true)
    setError('')
    try {
      const formattedAnswers = questions
        .filter(q => {
          const val = getAnswer(q.id)
          if (q.question_type === 'checkboxes') return (val as string[]).length > 0
          return (val as string)?.trim()
        })
        .map(q => ({
          question_id: q.id,
          value: q.question_type === 'checkboxes' ? (getAnswer(q.id) as string[]).join(', ') : (getAnswer(q.id) as string),
        }))

      let registrationId = ''
      let uniqueCode = ''
      let responseError: Error | null = null
      if (user) {
        // The registration RPC snapshots the attendee's academic details from
        // their profile, so save any edits here before creating the ticket.
        const { error: profileError } = await updateProfile(user.id, {
          full_name: respondentName.trim(),
          phone: respondentPhone.trim(),
          age: Number(respondentAge),
          semester: respondentSemester,
          department: respondentDepartment,
        })
        if (profileError) {
          setError('Could not save your details. Please check your connection and try again.')
          return
        }
        const result = await submitAuthenticatedEventResponse(event.id, {
          respondent_name: respondentName.trim(),
          respondent_email: respondentEmail.trim(),
          respondent_phone: respondentPhone.trim() || undefined,
        }, formattedAnswers)
        registrationId = typeof result.data === 'string' ? result.data : ''
        responseError = result.error
      } else {
        const result = await submitEventResponse(event.id, {
          respondent_name: respondentName.trim(),
          respondent_email: respondentEmail.trim(),
          respondent_phone: respondentPhone.trim() || undefined,
        })
        responseError = result.error
        const reg = extractRegistration(result.data)
        registrationId = reg?.id ?? (isUuid(result.data?.id) ? result.data.id : '')
        uniqueCode = reg?.uniqueCode ?? ''
        if (!responseError && registrationId) {
          const { error: answersError } = await submitResponseAnswers(registrationId, formattedAnswers)
          responseError = answersError
        }
      }
      if (responseError || !registrationId) {
        const msg = (responseError?.message || 'Failed to submit response').toLowerCase()
        if (msg.includes('rls_recursion')) {
          setError('Registration is temporarily unavailable while the database is being configured. Please try again later.')
        } else if (
          msg.includes('duplicate') ||
          msg.includes('unique') ||
          msg.includes('already exists') ||
          msg.includes('uniq_response_event_email')
        ) {
          setError("You're already registered for this event. Scroll down and use “Resend my ticket” if you need the email again.")
        } else {
          setError(responseError?.message || 'Failed to submit response')
        }
        return
      }
      // Free: generate the ticket PNG and send the ticket email BEFORE the
      // success screen mounts, so the ticket is visible and downloadable
      // on-screen — not "email-only". The anonymous kick is honoured inside
      // the public send window; failures self-heal via the status endpoint
      // and the daily sweep.
      if (event.payment_type !== 'paid') {
        try {
          const apiBase = import.meta.env.VITE_API_BASE || ''
          await fetch(`${apiBase}/api/on-registration`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registration_id: registrationId }),
          })
        } catch { /* status self-heal + daily sweep retry generation/emails */ }
        try { localStorage.setItem(`myp_reg_${event.id}`, String(Date.now())) } catch { /* ignore */ }
        setFreeReg(registrationId)
        setFreeCode(uniqueCode)
        setSubmitted(true)
        return
      }
      if (!registrationId) {
        setError('Registration saved, but we could not start the payment step. Please visit this page again with the same email to continue.')
        return
      }
      try { localStorage.setItem(`myp_reg_${event.id}`, String(Date.now())) } catch { /* ignore */ }

      // The paid hold is capacity-gated, so a full event leaves the new row
      // `waitlisted` (no 15-min hold) instead of `pending`. Read the status
      // back and route those buyers straight to the waitlist screen instead
      // of a payment panel whose proof upload could never succeed.
      try {
        const apiBase = import.meta.env.VITE_API_BASE || ''
        const stRes = await fetch(
          `${apiBase}/api/payments?action=status&registration_id=${encodeURIComponent(registrationId)}`,
        )
        if (stRes.ok) {
          const stPayload = (await stRes.json()) as { ticket_state?: unknown; registration_status?: unknown }
          const stState = String(stPayload?.ticket_state ?? '').toLowerCase()
          const stRow = String(stPayload?.registration_status ?? '').toLowerCase()
          if (stState === 'waitlisted' || stRow === 'waitlisted') {
            setPaidStage('waitlisted')
            return
          }
        }
      } catch { /* transient — the payment panel's own poll still guards */ }

      setPaidRegId(registrationId)
      setPaidCode(uniqueCode)
      setHoldExpiresAt(Date.now() + HOLD_WINDOW_MS)
      setPaidStage('payment')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Compute theme-aware style props. Falls back to the zine defaults.
  const accent = theme?.suggestedAccent ?? '#FF4D2E'
  const accentSoft = theme ? `${accent}1A` : 'rgba(255,77,46,0.1)'
  const rootStyle: React.CSSProperties = theme
    ? {
        // Expose theme tokens as CSS variables; the form UI references them.
        ['--event-accent' as string]: accent,
        ['--event-accent-soft' as string]: accentSoft,
        ['--event-secondary' as string]: theme.palette.secondary,
        ['--event-bg' as string]: theme.palette.background,
        ['--event-text' as string]: theme.palette.text,
        background: theme.isDark
          ? `linear-gradient(160deg, ${theme.palette.background} 0%, #0c0c0c 100%)`
          : `linear-gradient(160deg, ${theme.palette.background} 0%, #F4EFE1 100%)`,
      }
    : {}

  if (loading || (!!user && !!event && !existingChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Loading event form...</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-strong rounded-2xl p-10 max-w-md w-full text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-[#14110E] mb-3">Event not found</h2>
          <p className="text-text-secondary mb-6">
            This event doesn't exist or has been removed.
          </p>
          <Link to="/">
            <Button variant="primary" size="lg">
              Back to Home
            </Button>
          </Link>
        </motion.div>
      </div>
    )
  }

  // ── Paid flow screens (step 2 payment + step 3 terminal states) ──

  // Defensive: a stage is active but the event row vanished — show a spinner card.
  if (paidStage && !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Loading your registration…</p>
        </div>
      </div>
    )
  }

  if (paidStage === 'payment' && event) {
    return (
      <div className="min-h-screen bg-background py-12 px-4 relative" style={rootStyle}>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-text-secondary hover:text-primary-hover transition-colors mb-8 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to events
          </Link>

          <AnimatePresence mode="wait">
            <motion.div
              key="payment"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6 max-w-3xl mx-auto"
            >
              <EventHeaderCard event={event} />
              <PaymentPanel
                eventId={event.id}
                registrationId={paidRegId}
                initialCode={paidCode}
                amount={price}
                orgName={org?.name || ''}
                upiVpa={upiVpa}
                upiPhone={upiPhone || undefined}
                orgQrUrl={orgQrUrl || null}
                holdExpiresAt={holdExpiresAt}
                onExpired={handleHoldExpired}
                onWaitlisted={handleWaitlisted}
                onConfirmed={handleConfirmed}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  if (paidStage === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative w-full max-w-xl">
          <TicketSuccess
            uniqueCode={ticketInfo?.uniqueCode || paidCode}
            ticketImageUrl={ticketInfo?.ticketImageUrl ?? null}
            eventName={event?.title ?? ''}
            attendeeName={respondentName.trim()}
            email={respondentEmail.trim()}
            message={(extras.post_register_message || '').trim()}
            whatsappUrl={(extras.whatsapp_group_url || '').trim() || null}
          />
        </div>
      </div>
    )
  }

  if (paidStage === 'waitlisted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="glass-strong rounded-2xl p-10 max-w-md w-full text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-warning/20 flex items-center justify-center mx-auto mb-6">
            <Users className="h-8 w-8 text-text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-[#14110E] mb-3">Seats just filled — you're on the waiting list</h2>
          <p className="text-text-secondary text-sm leading-relaxed mb-2">
            Seats filled up just before your payment could be confirmed, so your registration moved to the waiting
            list.
          </p>
          <p className="text-text-secondary text-sm leading-relaxed mb-6">
            If you already paid, the club will contact you about a refund — or a seat opening up. If you haven't paid
            yet, please don't send any payment unless the club asks you to.
          </p>
          <Link to="/">
            <Button variant="primary" size="lg">
              Back to Home
            </Button>
          </Link>
        </motion.div>
      </div>
    )
  }

  if (paidStage === 'holdExpired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="glass-strong rounded-2xl p-10 max-w-md w-full text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <Clock className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-[#14110E] mb-3">Your hold expired — please re-register</h2>
          <p className="text-text-secondary text-sm leading-relaxed mb-6">
            We held your seat for 15 minutes and the hold lapsed without a confirmed payment, so the registration was
            cancelled. Nothing was charged. Start below — your details are still filled in. If the form then says
            you're already registered, use “Resend my ticket” instead.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setPaidStage(null)
                setTicketInfo(null)
              }}
            >
              Re-register
            </Button>
            <Link to="/">
              <Button variant="outline" size="lg">
                Back to Home
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative w-full max-w-xl">
          <FreeTicketSuccess
            registrationId={freeReg}
            fallbackCode={freeCode}
            eventName={event?.title ?? ''}
            attendeeName={respondentName.trim()}
            email={respondentEmail.trim()}
            message={(extras.post_register_message || '').trim()}
            whatsappUrl={(extras.whatsapp_group_url || '').trim() || null}
            onWaitlisted={handleWaitlisted}
          />
        </div>
      </div>
    )
  }

  if (user && event && existing && (existing.status === 'confirmed' || existing.status === 'waitlisted') && !paidStage) {
    const waitlisted = existing.status === 'waitlisted'
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Link
            to={`/event/${event.slug}`}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-primary-hover transition-colors mb-8 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to event
          </Link>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-10 text-center"
          >
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-[#14110E] mb-3">
              {waitlisted ? "You're on the waiting list" : "You're already registered"}
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed mb-2">
              {waitlisted
                ? 'Seats are full right now. The club will email you the moment one opens up — you do not need to register again.'
                : 'Your seat is confirmed. Your ticket and any club instructions are in My Tickets.'}
            </p>
            {existing.unique_code && (
              <p className="text-sm font-bold text-text-muted mb-6">
                Registration code: <span className="text-text-primary">{existing.unique_code}</span>
              </p>
            )}
            <div className="flex flex-col gap-3 mt-6">
              {!waitlisted && (
                <Link to="/account/tickets" className="block">
                  <Button variant="success" size="lg" fullWidth>View my ticket</Button>
                </Link>
              )}
              <Link to={`/event/${event.slug}`} className="block">
                <Button variant="outline" size="lg" fullWidth>Event page</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 relative" style={rootStyle}>
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-primary-hover transition-colors mb-8 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </Link>

        <AnimatePresence mode="wait">
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Event header */}
            {event && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <EventHeaderCard event={event} className="mb-6" />
              </motion.div>
            )}

            {/* Auto-themed notice — tell respondents the page adapted to the poster */}
            {event?.poster_url && (theme || themeLoading) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-strong rounded-2xl px-5 py-3 mb-6 flex items-center gap-3"
                style={{ borderColor: 'var(--event-accent, #14110E)' }}
              >
                <Palette className="h-5 w-5 shrink-0" style={{ color: 'var(--event-accent, #FF4D2E)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--event-text, #14110E)' }}>
                  {themeLoading
                    ? 'Reading the event poster to theme this page…'
                    : `This page is themed to match the ${theme?.vibe || 'event'} poster 🎨`}
                </p>
              </motion.div>
            )}

            {/* Form */}
            {!authLoading && !user ? (
              <AccountRequired eventSlug={event?.slug || eventSlug || ''} />
            ) : <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-strong rounded-2xl p-8 sm:p-10 space-y-8"
            >
              {/* Respondent info */}
              <div>
                <h2 className="text-lg font-semibold text-[#14110E] mb-4">Your Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={respondentName}
                      onChange={e => { setRespondentName(e.target.value); if (errors.name) setErrors(prev => { const n = { ...prev }; delete n.name; return n }) }}
                      placeholder="Your full name"
                      className={cn(
                        'w-full px-4 py-3 bg-primary/50 border rounded-xl text-text-primary placeholder:text-text-muted',
                        'transition-all duration-200 hover:border-border-light',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
                        errors.name && 'border-red-500 focus-visible:ring-red-500'
                      )}
                    />
                    {errors.name && <p className="mt-1.5 text-sm text-red-400">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
                    <input
                      type="email"
                      value={respondentEmail}
                      onChange={e => { setRespondentEmail(e.target.value); if (errors.email) setErrors(prev => { const n = { ...prev }; delete n.email; return n }) }}
                      placeholder="you@example.com"
                      className={cn(
                        'w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
                        errors.email && 'border-red-500 focus-visible:ring-red-500'
                      )}
                    />
                    {errors.email && <p className="mt-1.5 text-sm text-red-400">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">Phone</label>
                    <input
                      type="tel"
                      value={respondentPhone}
                      onChange={e => { setRespondentPhone(e.target.value); if (errors.phone) setErrors(prev => { const n = { ...prev }; delete n.phone; return n }) }}
                      placeholder="+91 98765 43210"
                      className={cn(
                        'w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
                        errors.phone && 'border-red-500 focus-visible:ring-red-500'
                      )}
                    />
                    {errors.phone && <p className="mt-1.5 text-sm text-red-400">{errors.phone}</p>}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        Age <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={respondentAge}
                        onChange={e => { setRespondentAge(e.target.value); if (errors.age) setErrors(prev => { const n = { ...prev }; delete n.age; return n }) }}
                        placeholder="19"
                        className={cn(
                          'w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
                          errors.age && 'border-red-500 focus-visible:ring-red-500'
                        )}
                      />
                      {errors.age && <p className="mt-1.5 text-sm text-red-400">{errors.age}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        Semester <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={respondentSemester}
                        onChange={e => { setRespondentSemester(e.target.value); if (errors.semester) setErrors(prev => { const n = { ...prev }; delete n.semester; return n }) }}
                        className={cn(
                          'w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
                          errors.semester && 'border-red-500 focus-visible:ring-red-500'
                        )}
                      >
                        <option value="">Select</option>
                        {SEMESTERS.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                      {errors.semester && <p className="mt-1.5 text-sm text-red-400">{errors.semester}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-2">
                        Department <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={respondentDepartment}
                        onChange={e => { setRespondentDepartment(e.target.value); if (errors.department) setErrors(prev => { const n = { ...prev }; delete n.department; return n }) }}
                        className={cn(
                          'w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
                          errors.department && 'border-red-500 focus-visible:ring-red-500'
                        )}
                      >
                        <option value="">Select</option>
                        {DEPARTMENTS.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                      {errors.department && <p className="mt-1.5 text-sm text-red-400">{errors.department}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Questions */}
              {questionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-[#4A4640]">
                  <div className="h-4 w-4 border-2 border-[#14110E] border-t-transparent rounded-full animate-spin" />
                  Loading questions…
                </div>
              ) : questions.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-[#14110E] mb-4">Questions</h2>
                  <div className="space-y-6">
                    {questions.map((q, index) => (
                      <motion.div
                        key={q.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index }}
                      >
                        <QuestionField
                          question={q}
                          value={getAnswer(q.id)}
                          error={errors[q.id]}
                          onChange={(val) => setAnswer(q.id, val)}
                          onCheckboxToggle={(opt) => handleCheckboxToggle(q.id, opt)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paid events: no payment here — the next step handles UPI + proof */}
              {isPaid && (
                <div className="rounded-xl border border-border bg-surface/80 p-4 flex items-start gap-3">
                  <IndianRupee className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-text-secondary">
                    This is a paid event — <strong className="text-[#14110E]">₹{price}</strong>. After you continue,
                    you'll be walked through the UPI payment and asked to upload a payment screenshot. Your seat is
                    held for 15 minutes until the payment is confirmed.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                style={{ background: 'var(--event-accent, #FF4D2E)', borderColor: '#14110E' }}
              >
                <Send className="h-4 w-4" />
                {isPaid ? 'Continue to payment' : 'Submit Registration'}
              </Button>
            </motion.form>}

            {/* Public resend-my-ticket */}
            {event && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="glass-strong rounded-2xl p-6 sm:p-8 mt-6"
              >
                <h3 className="text-lg font-semibold text-[#14110E] mb-1">Already registered?</h3>
                <p className="text-sm text-text-secondary mb-4">
                  Lost the email? Enter the same email you used and we’ll resend your ticket.
                </p>
                <form
                  className="flex flex-col sm:flex-row gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const em = resendEmail.trim().toLowerCase()
                    if (!em || !event) return
                    setResendBusy(true)
                    setResendMsg(null)
                    try {
                      const r = await fetch('/api/on-registration', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'resend', event_id: event.id, email: em }),
                      })
                      const j = await r.json().catch(() => ({}))
                      if (!r.ok) throw new Error(j.error || 'Could not resend ticket')
                      // Use the server's deliberately non-committal wording. It
                      // never confirms whether an address is registered on this
                      // event, which is what stops this form being used to
                      // enumerate who signed up for what.
                      setResendMsg({
                        ok: true,
                        text: j.message || 'If that email has a ticket, it has been sent.',
                      })
                    } catch (err) {
                      setResendMsg({ ok: false, text: err instanceof Error ? err.message : 'Resend failed' })
                    } finally {
                      setResendBusy(false)
                    }
                  }}
                >
                  <input
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <Button type="submit" variant="primary" loading={resendBusy} disabled={resendBusy}>
                    Resend my ticket
                  </Button>
                </form>
                {resendMsg && (
                  <p className={`mt-3 text-sm ${resendMsg.ok ? 'text-green-600' : 'text-red-400'}`}>
                    {resendMsg.text}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function EventHeaderCard({
  event,
  className,
}: {
  event: CampusEventWithOrg
  className?: string
}) {
  return (
    <div className={cn('glass-strong rounded-2xl p-8', className)}>
      <div className="flex items-start gap-4 mb-4">
        {event.organizations?.logo_url ? (
          <img
            src={event.organizations.logo_url}
            alt=""
            className="h-12 w-12 rounded-xl object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#14110E] mb-1">{event.title}</h1>
          {event.organizations?.name && (
            <p className="text-text-secondary text-sm">{event.organizations.name}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
        {event.date && (
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-primary" />
            {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        )}
        {event.time && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            {formatTime(event.time)}
          </span>
        )}
        {event.venue && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" />
            {event.venue}
          </span>
        )}
      </div>
      {event.description && (
        <p className="mt-4 text-text-secondary text-sm leading-relaxed">{event.description}</p>
      )}
    </div>
  )
}

function AccountRequired({ eventSlug }: { eventSlug: string }) {
  const next = `/event/${eventSlug}/register`
  return (
    <div className="glass-strong rounded-2xl p-8 sm:p-10 text-center">
      <div className="h-14 w-14 mx-auto mb-5 flex items-center justify-center" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
        <Send className="h-6 w-6" style={{ color: '#14110E' }} />
      </div>
      <h2 className="text-2xl font-extrabold text-[#14110E] mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>Create an account to register</h2>
      <p className="text-sm text-text-secondary leading-relaxed mb-6">
        Register once with MakeYourPass, then join this and future events without filling in your details again.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link to={`/account/signup?next=${encodeURIComponent(next)}`} className="flex-1">
          <Button variant="primary" size="lg" fullWidth>Create account</Button>
        </Link>
        <Link to={`/login?next=${encodeURIComponent(next)}`} className="flex-1">
          <Button variant="outline" size="lg" fullWidth>Sign in</Button>
        </Link>
      </div>
    </div>
  )
}

function QuestionField({
  question,
  value,
  error,
  onChange,
  onCheckboxToggle,
}: {
  question: EventQuestion
  value: string | string[]
  error?: string
  onChange: (val: string) => void
  onCheckboxToggle: (option: string) => void
}) {
  const rawOpts = (question.options as unknown) as string[] | string | null | undefined
  const options = Array.isArray(rawOpts)
    ? rawOpts
    : typeof rawOpts === 'string' && rawOpts.trim()
      ? (() => {
          try { const p = JSON.parse(rawOpts); return Array.isArray(p) ? p.map(String) : String(p).split(',').map((s: string) => s.trim()) }
          catch { return rawOpts.split(',').map((s: string) => s.trim()) }
        })()
      : []
  const inputClasses = cn(
    'w-full px-4 py-3 bg-primary/50 border rounded-xl text-text-primary placeholder:text-text-muted',
    'transition-all duration-200 hover:border-border-light',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary',
    error && 'border-red-500 focus-visible:ring-red-500'
  )

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">
        {question.title}
        {question.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {question.description && (
        <p className="text-xs text-text-muted mb-3">{question.description}</p>
      )}

      {question.question_type === 'short_text' && (
        <input
          type="text"
          value={value as string}
          onChange={e => onChange(e.target.value)}
          placeholder="Your answer"
          className={inputClasses}
        />
      )}

      {question.question_type === 'paragraph' && (
        <textarea
          value={value as string}
          onChange={e => onChange(e.target.value)}
          placeholder="Your answer"
          rows={4}
          className={cn(inputClasses, 'resize-y min-h-[100px]')}
        />
      )}

      {question.question_type === 'multiple_choice' && (
        <div className="space-y-2">
          {options.map((opt) => (
            <label
              key={opt}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200',
                value === opt
                  ? 'border-[color:var(--event-accent,#FF4D2E)] bg-[color:var(--event-accent,#FF4D2E)]/10 text-white'
                  : 'border-border bg-primary/30 text-text-secondary hover:border-border-light hover:bg-primary/40'
              )}
            >
              <div
                className={cn(
                  'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                  value === opt ? 'border-[color:var(--event-accent,#FF4D2E)]' : 'border-text-muted'
                )}
              >
                {value === opt && <div className="h-2 w-2 rounded-full bg-[color:var(--event-accent,#FF4D2E)]" />}
              </div>
              <span className="text-sm">{opt}</span>
              <input
                type="radio"
                name={question.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="sr-only"
              />
            </label>
          ))}
        </div>
      )}

      {question.question_type === 'checkboxes' && (
        <div className="space-y-2">
          {options.map((opt) => {
            const checked = (value as string[])?.includes(opt) ?? false
            return (
              <label
                key={opt}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200',
                  checked
                    ? 'border-[color:var(--event-accent,#FF4D2E)] bg-[color:var(--event-accent,#FF4D2E)]/10 text-white'
                    : 'border-border bg-primary/30 text-text-secondary hover:border-border-light hover:bg-primary/40'
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                    checked ? 'border-[color:var(--event-accent,#FF4D2E)] bg-[color:var(--event-accent,#FF4D2E)]' : 'border-text-muted'
                  )}
                >
                  {checked && (
                    <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <span className="text-sm">{opt}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onCheckboxToggle(opt)}
                  className="sr-only"
                />
              </label>
            )
          })}
        </div>
      )}

      {question.question_type === 'dropdown' && (
        <div className="relative">
          <select
            value={value as string}
            onChange={e => onChange(e.target.value)}
            className={cn(
              inputClasses,
              'appearance-none cursor-pointer'
            )}
          >
            <option value="" disabled>Select an option</option>
            {options.map((opt) => (
              <option key={opt} value={opt} className="bg-surface-elevated text-text-primary">{opt}</option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      )}

      {question.question_type === 'linear_scale' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onChange(String(num))}
                className={cn(
                  'flex-1 py-3 rounded-xl border text-center font-semibold transition-all duration-200',
                  value === String(num)
                    ? 'border-[color:var(--event-accent,#FF4D2E)] bg-[color:var(--event-accent,#FF4D2E)] text-white shadow-lg shadow-primary/25'
                    : 'border-border bg-primary/30 text-text-secondary hover:border-border-light hover:bg-primary/40'
                )}
              >
                {num}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-text-muted px-1">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
    </div>
  )
}
