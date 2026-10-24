import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  GraduationCap,
  ImagePlus,
  Loader2,
  Mail,
  Pencil,
  Ticket,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { generateSlug } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  getAccessToken,
  getCurrentProfile,
  resendVerificationEmail,
  signUp,
  updateProfile,
} from '@/lib/supabase'
import {
  DEPARTMENTS,
  SEMESTERS,
  isDepartment,
  isSemester,
  isValidAge,
  isValidEmail,
  isValidPhone,
} from '@/lib/studentProfile'

type Role = 'student' | 'club'
type Step =
  | 'role'
  | 'student'
  | 'clubAccount'
  | 'clubDetails'
  | 'creating'
  | 'verify'
  | 'pending'
  | 'done'
  | 'signInRequired'

const CARD_STYLE: React.CSSProperties = {
  background: '#fff',
  border: '2.5px solid #14110E',
  boxShadow: '7px 7px 0 #14110E',
}

const CLUB_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/**
 * Unified signup:
 * - First asks whether the person is joining as a student or a club.
 * - Students get the academic profile used for event registrations.
 * - Clubs get the public club profile + UPI setup, then a provisioning screen.
 */
export function SignupPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const forceOrg = params.get('step') === 'organization'
  const next = params.get('next') && params.get('next')!.startsWith('/') && !params.get('next')!.startsWith('//')
    ? params.get('next')!
    : ''

  const [role, setRole] = useState<Role | null>(forceOrg ? 'club' : null)
  const [step, setStep] = useState<Step>(forceOrg && user ? 'clubDetails' : 'role')
  const [loggedInMode, setLoggedInMode] = useState(!!user)

  // Shared account fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  // Student fields
  const [age, setAge] = useState('')
  const [semester, setSemester] = useState('')
  const [department, setDepartment] = useState('')

  // Club fields
  const [orgName, setOrgName] = useState('')
  const [orgShortName, setOrgShortName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [orgEmail, setOrgEmail] = useState('')
  const [orgVision, setOrgVision] = useState('')
  const [repName, setRepName] = useState('')
  const [repContact, setRepContact] = useState('')
  const [orgUpi, setOrgUpi] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoDataUrl, setLogoDataUrl] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugEditOpen, setSlugEditOpen] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [resendMsg, setResendMsg] = useState('')

  const orgNext = '/signup?step=organization'
  const loginPath = next
    ? `/login?next=${encodeURIComponent(next)}`
    : forceOrg
      ? `/login?next=${encodeURIComponent(orgNext)}`
      : '/login'
  const resendPath = (address = email) => {
    const query = new URLSearchParams()
    if (address.trim()) query.set('email', address.trim())
    if (next) query.set('next', next)
    return `/resend-verification${query.toString() ? `?${query.toString()}` : ''}`
  }

  useEffect(() => {
    if (authLoading) return
    let alive = true
    ;(async () => {
      setLoggedInMode(!!user)
      if (forceOrg) {
        if (!user) {
          if (alive) setStep('signInRequired')
          return
        }
        setRole('club')
        setStep((current) => (current === 'role' || current === 'signInRequired' ? 'clubDetails' : current))
        const { data } = await getCurrentProfile()
        if (!alive) return
        if (data?.full_name) {
          setFullName(data.full_name)
          setRepName((current) => current || data.full_name || '')
        }
        if (data?.email) setEmail(data.email)
        else if (user.email) setEmail(user.email)
        if (data?.phone) setRepContact((current) => current || data.phone || '')
        return
      }
      if (!user) return
      const { data } = await getCurrentProfile()
      if (!alive) return
      if (data?.full_name) {
        setFullName((current) => current || data.full_name || '')
        setRepName((current) => current || data.full_name || '')
      }
      if (data?.email) setEmail((current) => current || data.email || '')
      else if (user.email) setEmail((current) => current || user.email || '')
      if (data?.phone) setRepContact((current) => current || data.phone || '')
    })()
    return () => { alive = false }
  }, [user, authLoading, forceOrg])

  function clearError(key: string) {
    setErrors((current) => {
      if (!current[key]) return current
      const nextErrors = { ...current }
      delete nextErrors[key]
      return nextErrors
    })
  }

  function handleChooseRole(chosen: Role) {
    setError('')
    setErrors({})
    setRole(chosen)
    if (chosen === 'student') {
      if (user) {
        navigate(next || '/account/tickets')
        return
      }
      setStep('student')
      return
    }
    if (user) {
      setLoggedInMode(true)
      setRepName((current) => current || fullName)
      setStep('clubDetails')
      return
    }
    setStep('clubAccount')
  }

  function handleOrgNameChange(name: string) {
    setOrgName(name)
    clearError('orgName')
    if (!slugEdited) setOrgSlug(generateSlug(name))
  }

  function handleLogoChange(file: File | null) {
    clearError('logo')
    if (!file) {
      setLogoFile(null)
      setLogoPreview('')
      setLogoDataUrl('')
      return
    }
    if (!CLUB_LOGO_TYPES.includes(file.type)) {
      setErrors((current) => ({ ...current, logo: 'Use a PNG, JPG, WebP, or GIF image' }))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, logo: 'Logo must be under 2 MB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      setLogoDataUrl(result)
      setLogoPreview(result)
      setLogoFile(file)
    }
    reader.onerror = () => {
      setErrors((current) => ({ ...current, logo: 'Could not read that image. Try another file.' }))
    }
    reader.readAsDataURL(file)
  }

  function validateStudent(): boolean {
    const nextErrors: Record<string, string> = {}
    if (fullName.trim().length < 2) nextErrors.name = 'Enter your full name'
    if (!isValidEmail(email)) nextErrors.email = 'Enter a valid email address'
    if (!isValidPhone(phone)) nextErrors.phone = 'Enter a valid phone number'
    if (password.length < 6) nextErrors.password = 'Use at least 6 characters'
    if (!isValidAge(age)) nextErrors.age = 'Enter an age between 10 and 100'
    if (!isSemester(semester)) nextErrors.semester = 'Select your semester'
    if (!isDepartment(department)) nextErrors.department = 'Select your department'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function validateClubAccount(): boolean {
    const nextErrors: Record<string, string> = {}
    if (fullName.trim().length < 2) nextErrors.name = 'Enter your full name'
    if (!isValidEmail(email)) nextErrors.email = 'Enter a valid email address'
    if (password.length < 6) nextErrors.password = 'Use at least 6 characters'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function validateClub(): boolean {
    const nextErrors: Record<string, string> = {}
    if (!orgName.trim()) nextErrors.orgName = 'Club full name is required'
    if (!orgShortName.trim()) nextErrors.orgShortName = 'Short name is required'
    else if (orgShortName.trim().length > 24) nextErrors.orgShortName = 'Keep it to 24 characters or fewer'
    if (!orgSlug.trim() || orgSlug.trim().length < 2) nextErrors.slug = 'Choose a club URL'
    if (!isValidEmail(orgEmail)) nextErrors.orgEmail = 'Enter a valid club email'
    if (!repName.trim()) nextErrors.repName = 'Representative name is required'
    if (!isValidPhone(repContact)) nextErrors.repContact = 'Enter a valid representative phone number'
    if (orgVision.trim().length < 10) nextErrors.vision = 'Tell us what your club does (at least 10 characters)'
    if (!logoDataUrl) nextErrors.logo = 'Upload your club logo'
    if (orgUpi.trim() && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(orgUpi.trim())) {
      nextErrors.upi = 'Enter a valid UPI ID, for example club@oksbi'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleStudentSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setResendMsg('')
    if (!validateStudent()) return
    setLoading(true)
    try {
      const { data, error: signupError } = await signUp(
        email.trim().toLowerCase(),
        password,
        fullName.trim(),
        phone.trim(),
        next,
        {
          age: Number(age),
          semester,
          department,
          account_type: 'student',
        },
      )
      if (signupError) {
        setError(
          /already|registered|exists/i.test(signupError.message)
            ? 'An account with this email already exists. Sign in to continue.'
            : signupError.message,
        )
        return
      }
      if (!data.user) throw new Error('Could not create account')
      if ((data.user.identities?.length ?? 0) === 0) {
        setError('An account with this email already exists. Sign in to continue.')
        return
      }
      if (!data.session) {
        setStep('verify')
        return
      }
      // The auth trigger already copied these from user metadata. This second
      // write is a belt-and-braces fallback for projects that override the
      // trigger; a failure here must not block a successful signup.
      const { error: profileError } = await updateProfile(data.user.id, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        age: Number(age),
        semester,
        department,
      })
      if (profileError) console.warn('student profile fallback write failed', profileError.message)
      setStep('done')
      setTimeout(() => navigate(next || '/events', { replace: true }), 750)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleClubAccountNext(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateClubAccount()) return
    setRepName((current) => current || fullName.trim())
    setOrgEmail((current) => current || email.trim())
    setStep('clubDetails')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleClubSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setResendMsg('')
    if (!validateClub()) return

    setLoading(true)
    setStep('creating')
    const startedAt = Date.now()
    try {
      const token = loggedInMode ? await getAccessToken() : null
      const res = await fetch('/api/complete-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          full_name: fullName.trim() || repName.trim(),
          email: email.trim().toLowerCase(),
          password,
          organization_name: orgName.trim(),
          organization_slug: orgSlug.trim(),
          organization_short_name: orgShortName.trim(),
          organization_email: orgEmail.trim().toLowerCase(),
          representative_name: repName.trim(),
          representative_contact: repContact.trim(),
          organization_description: orgVision.trim(),
          organization_logo_data_url: logoDataUrl,
          organization_upi_id: orgUpi.trim(),
          existing_only: loggedInMode,
        }),
      })
      const payload = await res.json().catch(() => ({})) as {
        error?: string
        code?: string
        slug?: string
        needs_verify?: boolean
        email_sent?: boolean
        already_pending?: boolean
      }

      if (!res.ok) {
        setStep('clubDetails')
        if (payload.code === 'ACCOUNT_EXISTS' || payload.code === 'ACCOUNT_EXISTS_WRONG_PASSWORD') {
          setError(payload.error || 'Account exists. Sign in first.')
          return
        }
        if (payload.code === 'SLUG_TAKEN' || payload.code === 'SLUG_PENDING') {
          setError(payload.error || 'That club URL is unavailable.')
          setSlugEditOpen(true)
          if (!slugEdited || orgSlug === payload.slug) {
            setOrgSlug(`${orgSlug}-club`)
            setSlugEdited(true)
          }
          return
        }
        setError(payload.error || 'Could not create your club. Please try again.')
        return
      }

      // Keep the provisioning screen on-screen long enough to read. The API
      // call usually finishes much faster than this.
      const remaining = Math.max(0, 2400 - (Date.now() - startedAt))
      if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining))

      if (payload.needs_verify && payload.email_sent) {
        setStep('verify')
        return
      }
      setStep('pending')
    } catch {
      setStep('clubDetails')
      setError('Something went wrong while creating your club. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResendMsg('')
    setError('')
    setLoading(true)
    try {
      const { data, error: resendError } = await resendVerificationEmail(email, next)
      if (resendError) {
        setError(resendError.message)
        return
      }
      setResendMsg(data?.message || 'Verification email sent again. Check inbox and spam.')
    } catch {
      setError('Could not resend email.')
    } finally {
      setLoading(false)
    }
  }

  const stepIndex = step === 'role' ? 0 : step === 'student' || step === 'clubAccount' || step === 'clubDetails' ? 1 : 2
  const showProgress = !['role', 'creating', 'done', 'signInRequired'].includes(step)
  const wide = step === 'clubDetails' || step === 'creating' || step === 'pending'

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#14110E' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10" style={{ background: '#F4EFE1' }}>
      <div className={wide ? 'relative w-full max-w-2xl' : 'relative w-full max-w-xl'}>
        <Link
          to={loggedInMode ? '/dashboard' : '/'}
          className="inline-flex items-center gap-2 mb-6 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: '#14110E' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          {loggedInMode ? 'Back to dashboard' : 'Back to home'}
        </Link>

        {showProgress && (
          <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
            {(['Account type', 'Details', 'Finish'] as const).map((label, i) => {
              const active = stepIndex >= i
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div
                    className="px-2.5 py-1 text-[10px] font-extrabold uppercase"
                    style={{
                      border: '2px solid #14110E',
                      background: active ? '#FF4D2E' : '#fff',
                      color: active ? '#fff' : '#4A4640',
                      fontFamily: 'Syne, sans-serif',
                    }}
                  >
                    {i + 1}. {label}
                  </div>
                  {i < 2 && <div style={{ width: 12, height: 2, background: '#14110E' }} />}
                </div>
              )
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'role' && (
            <motion.div
              key="role"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-8">
                <div
                  className="inline-block px-3 py-1 mb-4 text-[10px] font-extrabold uppercase tracking-wider"
                  style={{ background: '#FFD23F', border: '2px solid #14110E', fontFamily: 'Syne, sans-serif', color: '#14110E' }}
                >
                  Join MakeYourPass
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  How are you joining?
                </h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  Pick one — we&apos;ll only ask for what you need.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <motion.button
                  type="button"
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleChooseRole('student')}
                  className="text-left p-6"
                  style={{ ...CARD_STYLE, cursor: 'pointer' }}
                >
                  <div className="h-12 w-12 flex items-center justify-center mb-5" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
                    <Ticket className="h-6 w-6 text-white" strokeWidth={2.5} />
                  </div>
                  <h2 className="text-xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    I&apos;m a student
                  </h2>
                  <p className="text-sm font-semibold mb-5" style={{ color: '#4A4640' }}>
                    Discover campus events, register in one click, and keep every ticket in one place.
                  </p>
                  <span className="inline-flex items-center gap-2 text-sm font-extrabold" style={{ color: '#FF4D2E' }}>
                    <GraduationCap className="h-4 w-4" /> Continue as student
                  </span>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleChooseRole('club')}
                  className="text-left p-6"
                  style={{ ...CARD_STYLE, cursor: 'pointer' }}
                >
                  <div className="h-12 w-12 flex items-center justify-center mb-5" style={{ background: '#2D5BFF', border: '2.5px solid #14110E' }}>
                    <Building2 className="h-6 w-6 text-white" strokeWidth={2.5} />
                  </div>
                  <h2 className="text-xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    I run a club
                  </h2>
                  <p className="text-sm font-semibold mb-5" style={{ color: '#4A4640' }}>
                    Set up your club page, publish events, sell tickets, and manage your dashboard.
                  </p>
                  <span className="inline-flex items-center gap-2 text-sm font-extrabold" style={{ color: '#2D5BFF' }}>
                    <Building2 className="h-4 w-4" /> Register your club
                  </span>
                </motion.button>
              </div>

              <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
                Already have an account?{' '}
                <Link to={loginPath} className="font-extrabold" style={{ color: '#FF4D2E' }}>
                  Sign in
                </Link>
              </p>
            </motion.div>
          )}

          {step === 'student' && (
            <motion.div
              key="student"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10"
              style={CARD_STYLE}
            >
              <div className="text-center mb-8">
                <div className="h-11 w-11 flex items-center justify-center mx-auto mb-4" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
                  <GraduationCap className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  Create your student account
                </h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  These details follow you to every event — no repeated forms.
                </p>
              </div>

              <form onSubmit={handleStudentSubmit} className="space-y-5">
                <Input
                  label="Full name"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); clearError('name') }}
                  placeholder="Your full name"
                  autoComplete="name"
                  error={errors.name}
                  required
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Age"
                    type="number"
                    min={10}
                    max={100}
                    value={age}
                    onChange={(e) => { setAge(e.target.value); clearError('age') }}
                    placeholder="19"
                    error={errors.age}
                    required
                  />
                  <Input
                    label="Phone number"
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); clearError('phone') }}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    error={errors.phone}
                    required
                  />
                </div>
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError('email') }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={errors.email}
                  required
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <Select
                    label="Semester"
                    value={semester}
                    onChange={(e) => { setSemester(e.target.value); clearError('semester') }}
                    error={errors.semester}
                    required
                  >
                    <option value="">Select semester</option>
                    {SEMESTERS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                  <Select
                    label="Department"
                    value={department}
                    onChange={(e) => { setDepartment(e.target.value); clearError('department') }}
                    error={errors.department}
                    required
                  >
                    <option value="">Select department</option>
                    {DEPARTMENTS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                </div>
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError('password') }}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  hint="Must be at least 6 characters"
                  error={errors.password}
                  required
                />

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                    {/already|exists|sign in/i.test(error) && (
                      <div className="mt-2">
                        <Link to={loginPath} className="underline font-extrabold" style={{ color: '#14110E' }}>
                          Sign in to continue →
                        </Link>
                        <span className="mx-2">·</span>
                        <Link to={resendPath()} className="underline font-extrabold" style={{ color: '#14110E' }}>
                          Resend verification
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    Create student account
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    fullWidth
                    onClick={() => { setStep('role'); setRole(null); setError(''); setErrors({}) }}
                  >
                    Back to account type
                  </Button>
                </div>
              </form>

              <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
                Already have an account?{' '}
                <Link to={loginPath} className="font-extrabold" style={{ color: '#FF4D2E' }}>
                  Sign in
                </Link>
              </p>
              <p className="text-center mt-3 text-xs font-semibold" style={{ color: '#7A756B' }}>
                Running a club instead?{' '}
                <button
                  type="button"
                  className="underline font-extrabold"
                  style={{ color: '#4A4640' }}
                  onClick={() => handleChooseRole('club')}
                >
                  Register your club
                </button>
              </p>
            </motion.div>
          )}

          {step === 'clubAccount' && (
            <motion.div
              key="clubAccount"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10"
              style={CARD_STYLE}
            >
              <div className="text-center mb-8">
                <div className="h-11 w-11 flex items-center justify-center mx-auto mb-4" style={{ background: '#2D5BFF', border: '2.5px solid #14110E' }}>
                  <Building2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  Create your club account
                </h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  The person who will manage the dashboard.
                </p>
              </div>

              <form onSubmit={handleClubAccountNext} className="space-y-5">
                <Input
                  label="Your full name"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); clearError('name') }}
                  placeholder="Representative name"
                  autoComplete="name"
                  error={errors.name}
                  required
                />
                <Input
                  label="Login email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError('email') }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  error={errors.email}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError('password') }}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  hint="You'll use this to sign in to your club dashboard."
                  error={errors.password}
                  required
                />

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button type="submit" variant="primary" size="lg" fullWidth>
                    Continue to club details
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    fullWidth
                    onClick={() => { setStep('role'); setRole(null); setError(''); setErrors({}) }}
                  >
                    Back to account type
                  </Button>
                </div>
              </form>

              <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
                Already have an account?{' '}
                <Link to={loginPath} className="font-extrabold" style={{ color: '#FF4D2E' }}>
                  Sign in
                </Link>
              </p>
            </motion.div>
          )}

          {step === 'clubDetails' && (
            <motion.div
              key="clubDetails"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10"
              style={CARD_STYLE}
            >
              <div className="text-center mb-8">
                <div className="h-11 w-11 flex items-center justify-center mx-auto mb-4" style={{ background: '#2D5BFF', border: '2.5px solid #14110E' }}>
                  <Building2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  {loggedInMode ? 'Register your club' : 'Set up your club'}
                </h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  {loggedInMode
                    ? 'Submit a request — superadmin approves, then your portal opens.'
                    : 'This becomes your public club page and dashboard.'}
                </p>
                {loggedInMode && email && (
                  <p className="text-xs font-bold mt-2" style={{ color: '#14110E' }}>
                    Signed in as {email}
                  </p>
                )}
              </div>

              <form onSubmit={handleClubSubmit} className="space-y-7">
                <section className="space-y-4">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    Club identity
                  </h2>
                  <Input
                    label="Full organization name"
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="e.g. Forum for Open Source Studies"
                    error={errors.orgName}
                    required
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Short form"
                      value={orgShortName}
                      onChange={(e) => { setOrgShortName(e.target.value); clearError('orgShortName') }}
                      placeholder="e.g. FOSS"
                      maxLength={24}
                      hint="Shown on tickets and event cards."
                      error={errors.orgShortName}
                      required
                    />
                    <Input
                      label="Club email"
                      type="email"
                      value={orgEmail}
                      onChange={(e) => { setOrgEmail(e.target.value); clearError('orgEmail') }}
                      placeholder="club@college.edu"
                      error={errors.orgEmail}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>
                      Club URL
                    </label>
                    <div className="flex items-center gap-2 p-3" style={{ background: '#F4EFE1', border: '2px solid #14110E' }}>
                      <div className="flex-1 min-w-0">
                        {slugEditOpen ? (
                          <input
                            type="text"
                            value={orgSlug}
                            onChange={(e) => {
                              setOrgSlug(e.target.value)
                              setSlugEdited(true)
                              clearError('slug')
                            }}
                            className="w-full bg-transparent text-sm font-mono outline-none"
                            style={{ color: '#14110E' }}
                            autoFocus
                          />
                        ) : (
                          <p className="text-sm font-mono truncate" style={{ color: '#4A4640' }}>
                            makeyourpass.vercel.app/
                            <span style={{ color: '#14110E', fontWeight: 700 }}>{orgSlug || 'your-club'}</span>
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={() => setSlugEditOpen(!slugEditOpen)} className="p-1.5 shrink-0" style={{ color: '#14110E' }}>
                        {slugEditOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {errors.slug && <p className="mt-1 text-xs font-bold" style={{ color: '#FF4D2E' }}>{errors.slug}</p>}
                  </div>

                  <Textarea
                    label="What does your club do? (vision)"
                    value={orgVision}
                    onChange={(e) => { setOrgVision(e.target.value); clearError('vision') }}
                    placeholder="We run workshops, hackathons, and open-source sprints for students across campus."
                    rows={4}
                    error={errors.vision}
                    required
                  />
                </section>

                <section className="space-y-4">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    Representative
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Representative name"
                      value={repName}
                      onChange={(e) => { setRepName(e.target.value); clearError('repName') }}
                      placeholder="Who should we contact?"
                      error={errors.repName}
                      required
                    />
                    <Input
                      label="Representative contact"
                      type="tel"
                      value={repContact}
                      onChange={(e) => { setRepContact(e.target.value); clearError('repContact') }}
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                      error={errors.repContact}
                      required
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    Payments
                  </h2>
                  <Input
                    label="UPI ID for paid events (optional)"
                    value={orgUpi}
                    onChange={(e) => { setOrgUpi(e.target.value); clearError('upi') }}
                    placeholder="club@oksbi"
                    hint="You can add or change this later in dashboard settings."
                    error={errors.upi}
                  />
                </section>

                <section className="space-y-3">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    Club logo
                  </h2>
                  <label
                    className="flex items-center gap-4 p-4 cursor-pointer transition-colors hover:bg-[#FFFDF7]"
                    style={{ border: errors.logo ? '2px solid #FF4D2E' : '2px dashed #14110E', background: '#fff' }}
                  >
                    <div
                      className="h-16 w-16 shrink-0 flex items-center justify-center overflow-hidden"
                      style={{ background: '#FFD23F', border: '2px solid #14110E' }}
                    >
                      {logoPreview ? (
                        <img src={logoPreview} alt="Club logo preview" className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-6 w-6" style={{ color: '#14110E' }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold" style={{ color: '#14110E' }}>
                        {logoFile ? logoFile.name : 'Upload logo.png'}
                      </p>
                      <p className="text-xs font-semibold" style={{ color: '#4A4640' }}>
                        PNG, JPG, WebP, or GIF · max 2 MB
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => handleLogoChange(e.target.files?.[0] || null)}
                    />
                  </label>
                  {errors.logo && <p className="text-xs font-bold" style={{ color: '#FF4D2E' }}>{errors.logo}</p>}
                </section>

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                    {/already exists|Sign in/i.test(error) && (
                      <div className="mt-2">
                        <Link to={loginPath} className="underline font-extrabold">
                          Go to sign in →
                        </Link>
                        <span className="mx-2">·</span>
                        <Link to={resendPath()} className="underline font-extrabold">
                          Resend verification
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    <Building2 className="h-4 w-4" />
                    {loggedInMode ? 'Submit club request' : 'Create my club dashboard'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    fullWidth
                    onClick={() => {
                      setError('')
                      setErrors({})
                      if (loggedInMode) {
                        setStep('role')
                        setRole(null)
                        return
                      }
                      setStep('clubAccount')
                    }}
                  >
                    {loggedInMode ? 'Back to account type' : 'Back to account'}
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 'creating' && (
            <CreatingDashboard
              key="creating"
              orgName={orgName}
              orgSlug={orgSlug}
              logoPreview={logoPreview}
            />
          )}

          {step === 'signInRequired' && (
            <motion.div
              key="signInRequired"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10 text-center"
              style={CARD_STYLE}
            >
              <div className="h-12 w-12 flex items-center justify-center mx-auto mb-4" style={{ background: '#2D5BFF', border: '2.5px solid #14110E' }}>
                <Building2 className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                Sign in to register your club
              </h1>
              <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
                Your club dashboard is tied to your MakeYourPass account.
              </p>
              <div className="flex flex-col gap-3">
                <Link to={loginPath}>
                  <Button variant="primary" size="lg" fullWidth>Sign in</Button>
                </Link>
                <Button variant="outline" size="lg" fullWidth onClick={() => navigate('/signup')}>
                  Create a new account
                </Button>
              </div>
            </motion.div>
          )}

          {step === 'pending' && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 sm:p-10 text-center"
              style={CARD_STYLE}
            >
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: '#14B87A' }} />
              <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                Your club request is in
              </h1>
              <p className="text-sm font-semibold mb-3" style={{ color: '#4A4640' }}>
                <strong>{orgName}</strong> is waiting for superadmin approval.
                Your dashboard is provisioned and will open at <strong>/{orgSlug}</strong> once approved.
              </p>
              <p className="text-xs font-semibold mb-6" style={{ color: '#4A4640' }}>
                {loggedInMode
                  ? 'You can monitor the approval status from your dashboard.'
                  : `We'll email ${email} when it's live.`}
              </p>
              <Link to={loggedInMode ? '/dashboard' : loginPath}>
                <Button variant="primary" size="lg">
                  {loggedInMode ? 'Open dashboard' : 'Sign in now'}
                </Button>
              </Link>
            </motion.div>
          )}

          {step === 'verify' && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10 text-center"
              style={CARD_STYLE}
            >
              <div className="h-14 w-14 flex items-center justify-center mx-auto mb-5" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
                <Mail className="h-7 w-7" strokeWidth={2.5} style={{ color: '#14110E' }} />
              </div>
              <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                Verify your email
              </h1>
              <p className="text-sm font-semibold mb-3" style={{ color: '#4A4640' }}>
                We sent a confirmation link to <strong style={{ color: '#14110E' }}>{email}</strong>.
              </p>
              <div className="p-3 mb-6 text-left text-sm font-semibold" style={{ background: '#FFF6D6', border: '2px solid #14110E', color: '#14110E' }}>
                {role === 'club' ? (
                  <>
                    <p className="mb-2">
                      Your club request for <strong>{orgName}</strong> is saved and waiting for superadmin approval.
                    </p>
                    <p>
                      After you verify, sign in and check <strong>/dashboard</strong>. Once approved, your portal opens at{' '}
                      <strong>/{orgSlug}</strong>.
                    </p>
                  </>
                ) : (
                  <p>
                    Confirm your email, then sign in to finish registering. We&apos;ll take you straight back to where you left off.
                  </p>
                )}
              </div>

              {error && (
                <div className="p-3 mb-3 text-sm font-bold text-left" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                  {error}
                </div>
              )}
              {resendMsg && (
                <div className="p-3 mb-3 text-sm font-bold text-left" style={{ background: '#E8F8F0', border: '2px solid #14B87A', color: '#0A7A4F' }}>
                  {resendMsg}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button type="button" variant="primary" size="lg" fullWidth loading={loading} onClick={() => void handleResend()}>
                  Resend verification email
                </Button>
                <Link to={loginPath}>
                  <Button type="button" variant="secondary" size="lg" fullWidth>
                    I verified — sign in
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 sm:p-10 text-center"
              style={CARD_STYLE}
            >
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: '#14B87A' }} />
              <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                Account ready
              </h1>
              <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                Taking you to your events…
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const PROVISION_STEPS = [
  'Saving your club profile',
  'Reserving your portal URL',
  'Preparing your dashboard',
  'Almost there',
]

function CreatingDashboard({
  orgName,
  orgSlug,
  logoPreview,
}: {
  orgName: string
  orgSlug: string
  logoPreview: string
}) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((current) => Math.min(current + 1, PROVISION_STEPS.length - 1))
    }, 600)
    return () => clearInterval(timer)
  }, [])

  return (
    <motion.div
      key="creating"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 sm:p-10 text-center"
      style={CARD_STYLE}
    >
      <div className="relative h-24 w-24 mx-auto mb-6">
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-dashed"
          style={{ borderColor: '#FF4D2E' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
        <div
          className="absolute inset-3 flex items-center justify-center overflow-hidden"
          style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}
        >
          {logoPreview ? (
            <img src={logoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-7 w-7" style={{ color: '#14110E' }} />
          )}
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
        Creating your organization dashboard
      </h1>
      <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
        <strong style={{ color: '#14110E' }}>{orgName || 'Your club'}</strong> · makeyourpass.vercel.app/{orgSlug || 'your-club'}
      </p>

      <div className="space-y-2 text-left max-w-sm mx-auto">
        {PROVISION_STEPS.map((label, index) => {
          const done = index < active
          const current = index === active
          return (
            <div key={label} className="flex items-center gap-3 text-sm font-bold" style={{ color: done || current ? '#14110E' : '#7A756B' }}>
              {done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#14B87A' }} />
              ) : current ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: '#FF4D2E' }} />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border-2" style={{ borderColor: '#7A756B' }} />
              )}
              {label}
            </div>
          )
        })}
      </div>

      <div className="mt-6 h-3 w-full overflow-hidden" style={{ background: '#F4EFE1', border: '2px solid #14110E' }}>
        <motion.div
          initial={{ width: '8%' }}
          animate={{ width: '94%' }}
          transition={{ duration: 2.4, ease: 'easeInOut' }}
          style={{ height: '100%', background: '#FF4D2E' }}
        />
      </div>
      <p className="mt-4 text-xs font-semibold" style={{ color: '#7A756B' }}>
        This takes a few seconds. Don&apos;t close this tab.
      </p>
    </motion.div>
  )
}
