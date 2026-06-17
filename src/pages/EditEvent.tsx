import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Sparkles, Loader2, IndianRupee, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { FormBuilder } from '@/components/forms/FormBuilder'
import { getEventById, getEventQuestions, updateEvent, saveEventQuestions } from '@/lib/supabase'
import type { CampusEvent, EventQuestion, FormQuestion } from '@/types'

export function EditEvent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [venue, setVenue] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [brochureUrl, setBrochureUrl] = useState('')
  const [paymentType, setPaymentType] = useState<'free' | 'paid'>('free')
  const [price, setPrice] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'cancelled'>('draft')

  const [questions, setQuestions] = useState<FormQuestion[]>([])

  useEffect(() => {
    const eid = id
    if (!eid) return
    async function load() {
      if (!eid) return
      setLoading(true)
      setError('')

      const { data: eventData, error: eventErr } = await getEventById(eid!)
      if (eventErr || !eventData) {
        const msg = eventErr?.message || 'Failed to load event'
        if (msg.includes('RLS_RECURSION')) {
          setError('Events are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
        } else {
          setError(msg)
        }
        setLoading(false)
        return
      }

      const event = eventData as CampusEvent
      setTitle(event.title)
      setDescription(event.description)
      setDate(event.date || '')
      setTime(event.time || '')
      setVenue(event.venue || '')
      setPosterUrl(event.poster_url || '')
      setBrochureUrl(event.brochure_url || '')
      setPaymentType(event.payment_type || 'free')
      setPrice(event.price ? String(event.price) : '')
      setStatus(event.status || 'draft')

      const { data: questionsData } = await getEventQuestions(eid!)
      if (questionsData) {
        setQuestions(
          (questionsData as EventQuestion[]).map(q => ({
            id: q.id,
            title: q.title,
            description: q.description,
            question_type: q.question_type,
            options: q.options,
            required: q.required,
            sort_order: q.sort_order,
          }))
        )
      }

      setLoading(false)
    }
    load()
  }, [id])

  const handleSave = async () => {
    if (!id) return
    if (!title.trim()) {
      setError('Event title is required')
      return
    }

    setSaving(true)
    setError('')

    const { error: updateErr } = await updateEvent(id, {
      title: title.trim(),
      description,
      date: date || null,
      time: time || null,
      venue,
      poster_url: posterUrl,
      brochure_url: brochureUrl,
      payment_type: paymentType,
      price: paymentType === 'paid' ? (parseFloat(price) || 0) : 0,
      status,
    })

    if (updateErr) {
      if (updateErr.message?.includes('RLS_RECURSION')) {
        setError('Event editing is unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
      } else {
        setError(updateErr.message)
      }
      setSaving(false)
      return
    }

    const { error: questionsErr } = await saveEventQuestions(id, questions)
    if (questionsErr) {
      if (questionsErr.message?.includes('RLS_RECURSION')) {
        setError('Form questions could not be saved due to a database configuration issue. Please apply the SQL fix in the Supabase dashboard SQL editor.')
      } else {
        setError('Event saved but failed to save questions: ' + questionsErr.message)
      }
      setSaving(false)
      return
    }

    setSaving(false)
    navigate('/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-text-muted text-sm">Loading event...</p>
        </div>
      </div>
    )
  }

  if (error && !title) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-error/10 mx-auto mb-4 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-error" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Event not found</h1>
          <p className="text-text-secondary text-sm mb-6">{error}</p>
          <Link to="/dashboard">
            <Button variant="primary">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-surface/80 backdrop-blur-md border-b border-border">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-text-secondary hover:text-primary transition-colors text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold">
            <span className="text-text-primary">MakeYour</span>
            <span className="text-primary">Pass</span>
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">Edit Event</h1>
            <p className="text-text-secondary text-sm">Update your event details and form</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-error/10 border border-error/30 rounded-xl text-error text-sm"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-6">
            <Card>
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Event Details</h2>
                </div>

                <Input
                  label="Event Title *"
                  placeholder="e.g., Tech Fest 2026"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Description</label>
                  <Textarea
                    placeholder="Describe your event..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                  <Input
                    label="Time"
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                  />
                </div>

                <Input
                  label="Venue"
                  placeholder="e.g., Main Auditorium"
                  value={venue}
                  onChange={e => setVenue(e.target.value)}
                />

                <Input
                  label="Poster URL"
                  placeholder="https://example.com/poster.jpg"
                  value={posterUrl}
                  onChange={e => setPosterUrl(e.target.value)}
                />

                <Input
                  label="Brochure URL"
                  placeholder="https://example.com/brochure.pdf"
                  value={brochureUrl}
                  onChange={e => setBrochureUrl(e.target.value)}
                />

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-3">Payment</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentType('free')}
                      className={`flex items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                        paymentType === 'free'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                      }`}
                    >
                      <IndianRupee className="h-4 w-4" />
                      <span className="text-sm font-medium">Free</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentType('paid')}
                      className={`flex items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                        paymentType === 'paid'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                      }`}
                    >
                      <IndianRupee className="h-4 w-4" />
                      <span className="text-sm font-medium">Paid</span>
                    </button>
                  </div>
                  {paymentType === 'paid' && (
                    <div className="mt-3 relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                      <Input
                        type="number"
                        placeholder="0"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-3">Status</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['draft', 'published', 'cancelled'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`flex items-center justify-center gap-2 p-4 rounded-xl border transition-all capitalize ${
                          status === s
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                        }`}
                      >
                        <span className="text-sm font-medium">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <FormBuilder questions={questions} onChange={setQuestions} />
            </Card>

            <div className="flex items-center justify-between pt-2">
              <Link to="/dashboard">
                <Button variant="ghost">
                  <ArrowLeft className="h-4 w-4" />
                  Cancel
                </Button>
              </Link>
              <Button
                variant="primary"
                size="lg"
                onClick={handleSave}
                loading={saving}
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
