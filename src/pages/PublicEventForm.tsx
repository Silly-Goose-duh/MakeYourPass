import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, CheckCircle, Calendar, MapPin, Clock, Building2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatTime, cn } from '@/lib/utils'
import { getEventBySlug, getEventQuestions, submitEventResponse, submitResponseAnswers } from '@/lib/supabase'
import type { CampusEvent, Organization, EventQuestion } from '@/types'

export function PublicEventForm() {
  const { eventSlug } = useParams<{ eventSlug: string }>()
  const [event, setEvent] = useState<(CampusEvent & { organizations: Organization }) | null>(null)
  const [questions, setQuestions] = useState<EventQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  const [respondentName, setRespondentName] = useState('')
  const [respondentEmail, setRespondentEmail] = useState('')
  const [respondentPhone, setRespondentPhone] = useState('')
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function loadEvent() {
      if (!eventSlug) return
      setLoading(true)
      setError('')
      try {
        const { data: eventData, error: eventError } = await getEventBySlug(eventSlug)
        if (eventError || !eventData) {
          if (eventError?.message?.includes('RLS_RECURSION')) {
            setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
            return
          }
          setNotFound(true)
          return
        }
        setEvent(eventData as unknown as CampusEvent & { organizations: Organization })
        const { data: questionsData } = await getEventQuestions(eventData.id)
        if (questionsData) setQuestions(questionsData)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load event'
        if (message.includes('RLS_RECURSION')) {
          setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
        } else {
          setError(message)
        }
      } finally {
        setLoading(false)
      }
    }
    loadEvent()
  }, [eventSlug])

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

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!respondentName.trim()) newErrors.name = 'Name is required'
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
    setSubmitting(true)
    setError('')
    try {
      const { data: responseData, error: responseError } = await submitEventResponse(event.id, {
        respondent_name: respondentName.trim(),
        respondent_email: respondentEmail.trim(),
        respondent_phone: respondentPhone.trim() || undefined,
      })
      if (responseError || !responseData) {
        const msg = responseError?.message || 'Failed to submit response'
        if (msg.includes('RLS_RECURSION')) {
          setError('Registration is temporarily unavailable while the database is being configured. Please try again later.')
        } else {
          setError(msg)
        }
        return
      }
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
      const { error: answersError } = await submitResponseAnswers(responseData.id, formattedAnswers)
      if (answersError) {
        const msg = answersError.message || 'Failed to save answers'
        if (msg.includes('RLS_RECURSION')) {
          setError('Registration is temporarily unavailable while the database is being configured. Please try again later.')
        } else {
          setError(msg)
        }
        return
      }
      setSubmitted(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      if (message.includes('RLS_RECURSION')) {
        setError('Registration is temporarily unavailable while the database is being configured. Please try again later.')
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
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

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', duration: 0.6 }}
          className="glass-strong rounded-2xl p-10 max-w-lg w-full text-center relative"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2, duration: 0.5 }}
            className="h-20 w-20 rounded-2xl bg-success/20 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="h-10 w-10 text-success" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-2xl font-bold text-[#14110E] mb-3"
          >
            Response Submitted!
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-text-secondary mb-2"
          >
            Thank you for registering for <strong className="text-[#14110E]">{event?.title}</strong>.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-text-muted text-sm mb-8"
          >
            You'll receive a confirmation at {respondentEmail || 'your email'}.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <Link to="/">
              <Button variant="primary" size="lg">
                Back to Home
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 relative">
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
                className="glass-strong rounded-2xl p-8 mb-6"
              >
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
              </motion.div>
            )}

            {/* Form */}
            <motion.form
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
                      onChange={e => setRespondentEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">Phone</label>
                    <input
                      type="tel"
                      value={respondentPhone}
                      onChange={e => setRespondentPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Questions */}
              {questions.length > 0 && (
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

              {error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
                <Send className="h-4 w-4" />
                Submit Registration
              </Button>
            </motion.form>
          </motion.div>
        </AnimatePresence>
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
                  ? 'border-primary bg-primary/10 text-white'
                  : 'border-border bg-primary/30 text-text-secondary hover:border-border-light hover:bg-primary/40'
              )}
            >
              <div
                className={cn(
                  'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                  value === opt ? 'border-primary' : 'border-text-muted'
                )}
              >
                {value === opt && <div className="h-2 w-2 rounded-full bg-primary" />}
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
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-border bg-primary/30 text-text-secondary hover:border-border-light hover:bg-primary/40'
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                    checked ? 'border-primary bg-primary' : 'border-text-muted'
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
                    ? 'border-primary bg-primary text-white shadow-lg shadow-primary/25'
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
