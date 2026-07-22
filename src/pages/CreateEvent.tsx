import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Sparkles, Image, Upload, FileText, X, Loader2, Building2, IndianRupee } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { FormBuilder } from '@/components/forms/FormBuilder'
import { cn, generateSlug } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { getUserOrganizations, createEvent, saveEventQuestions, uploadPoster, getPosterPublicUrl, uploadBrochure, getBrochurePublicUrl } from '@/lib/supabase'
import type { Organization, CampusEvent, FormQuestion } from '@/types'

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
}

export function CreateEvent() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [[step, direction], setStep] = useState<[number, number]>([0, 0])

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [loadingOrgs, setLoadingOrgs] = useState(true)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [venue, setVenue] = useState('')
  const [formType, setFormType] = useState<'manual' | 'brochure'>('manual')
  const [brochureFile, setBrochureFile] = useState<File | null>(null)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const [paymentType, setPaymentType] = useState<'free' | 'paid'>('free')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [idPrefix, setIdPrefix] = useState('')
  const [ticketTemplateFile, setTicketTemplateFile] = useState<File | null>(null)
  const [certTemplateFile, setCertTemplateFile] = useState<File | null>(null)

  const [questions, setQuestions] = useState<FormQuestion[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [posterUploading, setPosterUploading] = useState(false)

  useEffect(() => {
    async function loadOrgs() {
      if (!user) return
      const { data, error: err } = await getUserOrganizations()
      if (err) {
        if (err.message?.includes('RLS_RECURSION')) {
          setError('Organizations are unavailable while the database is being configured. Event creation may be limited.')
        }
        setLoadingOrgs(false)
        return
      }
      if (data) {
        const orgs = data.map(m => m.organizations)
        setOrganizations(orgs)
        if (orgs.length > 0) setSelectedOrgId(orgs[0].id)
      }
      setLoadingOrgs(false)
    }
    loadOrgs()
  }, [user])

  const goToStep = (next: number) => {
    setStep([next, next > step ? 1 : -1])
  }

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPosterFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPosterPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleBrochureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBrochureFile(file)
  }

  const handlePublish = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    if (!selectedOrgId) {
      setError('Please select an organization')
      return
    }
    if (!title.trim()) {
      setError('Event title is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      let posterUrl = ''
      let brochureUrl = ''

      if (posterFile) {
        setPosterUploading(true)
        const ext = posterFile.name.split('.').pop()
        const posterPath = `${selectedOrgId}/${generateSlug(title)}-${Date.now()}.${ext}`
        const { error: uploadErr } = await uploadPoster(posterFile, posterPath)
        if (uploadErr) {
          setError('Failed to upload poster: ' + uploadErr.message)
          setSaving(false)
          setPosterUploading(false)
          return
        }
        posterUrl = getPosterPublicUrl(posterPath)
        setPosterUploading(false)
      }

      if (brochureFile) {
        const ext = brochureFile.name.split('.').pop()
        const brochurePath = `${selectedOrgId}/brochures/${generateSlug(title)}-${Date.now()}.${ext}`
        const { error: uploadErr } = await uploadBrochure(brochureFile, brochurePath)
        if (uploadErr) {
          setError('Failed to upload brochure: ' + uploadErr.message)
          setSaving(false)
          return
        }
        brochureUrl = getBrochurePublicUrl(brochurePath)
      }

      let ticketTemplateUrl = ''
      let certTemplateUrl = ''
      if (ticketTemplateFile) {
        const path = `${selectedOrgId}/templates/ticket-${Date.now()}.png`
        const { error: upErr } = await uploadPoster(ticketTemplateFile, path)
        if (upErr) { setError('Ticket template upload failed: ' + upErr.message); setSaving(false); return }
        ticketTemplateUrl = getPosterPublicUrl(path)
      }
      if (certTemplateFile) {
        const path = `${selectedOrgId}/templates/cert-${Date.now()}.png`
        const { error: upErr } = await uploadPoster(certTemplateFile, path)
        if (upErr) { setError('Certificate template upload failed: ' + upErr.message); setSaving(false); return }
        certTemplateUrl = getPosterPublicUrl(path)
      }

      if (paymentType === 'paid') {
        const org = organizations.find((o) => o.id === selectedOrgId)
        if (!org?.upi_id && !org?.upi_qr_url) {
          setError('Set your org UPI ID / QR on the organization page before publishing a paid event.')
          setSaving(false)
          return
        }
        if (!price || parseFloat(price) <= 0) {
          setError('Enter a valid price for UPI paid events')
          setSaving(false)
          return
        }
      }

      const slug = generateSlug(title)
      const eventPayload: Partial<CampusEvent> = {
        organization_id: selectedOrgId,
        title: title.trim(),
        slug,
        description,
        poster_url: posterUrl,
        brochure_url: brochureUrl,
        date: date || null,
        time: time || null,
        venue,
        form_type: formType,
        payment_type: paymentType,
        price: paymentType === 'paid' ? (parseFloat(price) || 0) : 0,
        capacity: capacity ? (parseInt(capacity, 10) || 0) : 0,
        id_prefix: idPrefix || null,
        ticket_template_url: ticketTemplateUrl,
        certificate_template_url: certTemplateUrl,
        status: 'published',
      }

      const { data: newEvent, error: createErr } = await createEvent(eventPayload)
      if (createErr || !newEvent) {
        setError(createErr?.message || 'Failed to create event')
        setSaving(false)
        return
      }

      if (questions.length > 0) {
        const { error: questionsErr } = await saveEventQuestions(newEvent.id, questions)
        if (questionsErr) {
          setError('Event created but failed to save questions: ' + questionsErr.message)
          setSaving(false)
          return
        }
      }

      navigate('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      if (message.includes('RLS_RECURSION')) {
        setError('Event creation is unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const canProceedFromStep1 = title.trim() && selectedOrgId
  const canProceedFromStep2 = true

  if (loadingOrgs) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-text-muted text-sm">Loading...</p>
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
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">Create Event</h1>
          <p className="text-text-secondary text-sm">Set up a new event with registration form</p>
        </div>

        <div className="flex items-center gap-3 mb-8">
          {['Event Details', 'Form Questions', 'Review & Publish'].map((label, i) => (
            <div key={i} className="flex items-center gap-3">
              <button
                onClick={() => i <= step && goToStep(i)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  i === step
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : i < step
                      ? 'text-primary bg-primary/10'
                      : 'text-text-muted bg-surface'
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < 2 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-error/10 border border-error/30 rounded-xl text-error text-sm flex items-start gap-3"
          >
            <X className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto shrink-0">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          {/* ===== STEP 1: EVENT DETAILS ===== */}
          {step === 0 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-6"
            >
              <Card>
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">Organization</h2>
                  </div>
                  {organizations.length === 0 ? (
                    <div className="p-4 bg-surface-elevated rounded-xl text-center">
                      <p className="text-text-muted text-sm mb-3">You are not a member of any organization.</p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate('/dashboard')}
                      >
                        Back to Dashboard
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {organizations.map(org => (
                        <button
                          key={org.id}
                          type="button"
                          onClick={() => setSelectedOrgId(org.id)}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                            selectedOrgId === org.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-surface/50 hover:border-primary/30'
                          )}
                        >
                          <div className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold',
                            selectedOrgId === org.id ? 'bg-primary text-white' : 'bg-surface-elevated text-text-secondary'
                          )}>
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{org.name}</p>
                            <p className="text-xs text-text-muted truncate">{org.slug}</p>
                          </div>
                          {selectedOrgId === org.id && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

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
                    onChange={e => {
                      const v = e.target.value
                      setTitle(v)
                      // Auto-suggest a prefix from title + year (editable later).
                      if (!idPrefix) {
                        const yr = new Date().getFullYear().toString().slice(-2)
                        const base = v.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
                        if (base) setIdPrefix(base + yr)
                      }
                    }}
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

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-3">Form Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormType('manual')}
                        className={cn(
                          'flex items-center justify-center gap-2 p-4 rounded-xl border transition-all',
                          formType === 'manual'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                        )}
                      >
                        <FileText className="h-4 w-4" />
                        <span className="text-sm font-medium">Manual</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormType('brochure')}
                        className={cn(
                          'flex items-center justify-center gap-2 p-4 rounded-xl border transition-all',
                          formType === 'brochure'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                        )}
                      >
                        <FileText className="h-4 w-4" />
                        <span className="text-sm font-medium">Brochure</span>
                      </button>
                    </div>
                    {formType === 'brochure' && (
                      <div className="mt-3">
                        <label className="relative flex items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-surface/50 cursor-pointer hover:border-primary/40 transition-colors">
                          <input
                            type="file"
                            accept=".pdf"
                            className="sr-only"
                            onChange={handleBrochureChange}
                          />
                          {brochureFile ? (
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-primary" />
                              <span className="text-sm text-text-primary">{brochureFile.name}</span>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setBrochureFile(null) }}
                                className="p-1 hover:bg-error/10 rounded"
                              >
                                <X className="h-4 w-4 text-error" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <Upload className="h-5 w-5 text-text-muted" />
                              <span className="text-sm text-text-muted">Upload brochure PDF</span>
                            </div>
                          )}
                        </label>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-3">Poster</label>
                    <label className="relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border bg-surface/50 cursor-pointer hover:border-primary/40 transition-colors overflow-hidden">
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={handlePosterChange}
                      />
                      {posterPreview ? (
                        <div className="relative w-full max-w-[200px] aspect-[9/16] rounded-lg overflow-hidden border border-border">
                          <img
                            src={posterPreview}
                            alt="Poster preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setPosterFile(null); setPosterPreview(null) }}
                            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Image className="h-5 w-5 text-text-muted" />
                          <span className="text-sm text-text-muted">Click to upload poster (9:16 recommended)</span>
                        </div>
                      )}
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-3">Payment</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => { setPaymentType('free'); setPrice('') }}
                        className={cn(
                          'flex items-center justify-center gap-2 p-4 rounded-xl border transition-all',
                          paymentType === 'free'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                        )}
                      >
                        <Check className="h-4 w-4" />
                        <span className="text-sm font-medium">Free</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentType('paid')}
                        className={cn(
                          'flex items-center justify-center gap-2 p-4 rounded-xl border transition-all',
                          paymentType === 'paid'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-surface/50 text-text-secondary hover:border-primary/30'
                        )}
                      >
                        <IndianRupee className="h-4 w-4" />
                        <span className="text-sm font-medium">UPI paid</span>
                      </button>
                    </div>
                    {paymentType === 'paid' && (
                      <div className="mt-3 relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                        <Input
                          type="number"
                          placeholder="Amount in ₹"
                          value={price}
                          onChange={e => setPrice(e.target.value)}
                          className="pl-9"
                        />
                        <p className="mt-2 text-xs text-text-muted">
                          Registrants pay via your org UPI QR and must upload a screenshot. You review and Send ticket from Live panel.
                          Set UPI on your org page first.
                        </p>
                      </div>
                    )}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Capacity (leave empty for unlimited)</label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Unlimited"
                        value={capacity}
                        onChange={e => setCapacity(e.target.value)}
                      />
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-text-primary mb-1.5">Ticket ID prefix (e.g. TPT26 → TPT26-0007)</label>
                      <Input
                        placeholder="Auto (from title + year)"
                        value={idPrefix}
                        onChange={e => setIdPrefix(e.target.value.toUpperCase())}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      <label className="block text-xs font-medium text-text-primary">Ticket template (PNG, optional)</label>
                      <input type="file" accept="image/png,image/jpeg" onChange={(e) => setTicketTemplateFile(e.target.files?.[0] || null)} className="text-xs text-text-secondary" />
                      <label className="block text-xs font-medium text-text-primary mt-2">Certificate template (PNG, optional)</label>
                      <input type="file" accept="image/png,image/jpeg" onChange={(e) => setCertTemplateFile(e.target.files?.[0] || null)} className="text-xs text-text-secondary" />
                      <p className="text-[11px] text-text-muted">Leave clear space for the attendee name (center). Used when sending tickets / ending the event.</p>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => goToStep(1)}
                  disabled={!canProceedFromStep1}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ===== STEP 2: FORM QUESTIONS ===== */}
          {step === 1 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-6"
            >
              <Card>
                <FormBuilder questions={questions} onChange={setQuestions} />
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => goToStep(0)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => goToStep(2)}
                  disabled={!canProceedFromStep2}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ===== STEP 3: REVIEW & PUBLISH ===== */}
          {step === 2 && (
            <motion.div
              key="step3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="space-y-6"
            >
              <Card>
                <div className="flex items-center gap-2 mb-5">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Event Summary</h2>
                </div>

                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Title</p>
                      <p className="text-sm text-text-primary font-medium">{title || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Organization</p>
                      <p className="text-sm text-text-primary font-medium">
                        {organizations.find(o => o.id === selectedOrgId)?.name || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Date</p>
                      <p className="text-sm text-text-primary">{date || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Time</p>
                      <p className="text-sm text-text-primary">{time || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Venue</p>
                      <p className="text-sm text-text-primary">{venue || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Form Type</p>
                      <p className="text-sm text-text-primary capitalize">{formType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Payment</p>
                      <p className="text-sm text-text-primary capitalize">
                        {paymentType === 'free' ? 'Free' : `₹${price}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Slug</p>
                      <p className="text-sm text-text-muted font-mono">{generateSlug(title) || '—'}</p>
                    </div>
                  </div>

                  {description && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Description</p>
                      <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
                    </div>
                  )}

                  {posterPreview && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Poster</p>
                      <div className="w-24 aspect-[9/16] rounded-lg overflow-hidden border border-border">
                        <img src={posterPreview} alt="Poster" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}

                  {brochureFile && (
                    <div>
                      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Brochure</p>
                      <p className="text-sm text-text-primary">{brochureFile.name}</p>
                    </div>
                  )}
                </div>
              </Card>

              {questions.length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 mb-5">
                    <FileText className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">Form Questions ({questions.length})</h2>
                  </div>

                  <div className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-surface-elevated">
                        <span className="text-xs font-bold text-primary w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{q.title || 'Untitled question'}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-text-muted capitalize">{q.question_type.replace(/_/g, ' ')}</span>
                            {q.required && <span className="text-xs text-error">*Required</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card variant="bordered" className="border-primary/30 bg-primary/5">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-text-primary mb-1">Ready to publish?</p>
                    <p className="text-xs text-text-secondary">Your event will be visible immediately after publishing.</p>
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => goToStep(1)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handlePublish}
                  loading={saving || posterUploading}
                >
                  {posterUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading Poster...
                    </>
                  ) : saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Publish Event
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
