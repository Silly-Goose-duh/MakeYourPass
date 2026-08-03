import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Building2, CheckCircle2, Pencil, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { generateSlug } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { getAccessToken, getCurrentProfile } from '@/lib/supabase'

type Step = 'account' | 'organization' | 'verify' | 'pending'

/**
 * Signup:
 * - New users: account → organization → verify email → wait approval
 * - Existing / already signed-in: organization only → pending wait (/dashboard)
 */
export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const forceOrg = params.get('step') === 'organization'

  const [step, setStep] = useState<Step>(forceOrg || user ? 'organization' : 'account')
  const [loggedInMode, setLoggedInMode] = useState(!!user)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugEditOpen, setSlugEditOpen] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendMsg, setResendMsg] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!user) return
    let alive = true
    ;(async () => {
      if (!alive) return
      setLoggedInMode(true)
      setStep((s) => (s === 'account' || forceOrg ? 'organization' : s))
      const { data } = await getCurrentProfile()
      if (!alive) return
      if (data?.full_name) setFullName(data.full_name)
      if (data?.email) setEmail(data.email)
      else if (user.email) setEmail(user.email)
    })()
    return () => { alive = false }
  }, [user, authLoading, forceOrg])

  const handleOrgNameChange = (name: string) => {
    setOrgName(name)
    if (!slugEdited) setOrgSlug(generateSlug(name))
  }

  const handleAccountNext = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) {
      setError('Full name is required')
      return
    }
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setStep('organization')
  }

  const handleOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResendMsg('')
    if (!orgName.trim()) {
      setError('Organization name is required')
      return
    }
    if (!orgSlug.trim()) {
      setError('Organization slug is required')
      return
    }

    setLoading(true)
    try {
      const token = loggedInMode ? await getAccessToken() : null
      const res = await fetch('/api/complete-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          organization_name: orgName.trim(),
          organization_slug: orgSlug.trim(),
          organization_description: orgDescription.trim(),
          existing_only: loggedInMode,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (j.code === 'ACCOUNT_EXISTS' || j.code === 'ACCOUNT_EXISTS_WRONG_PASSWORD') {
          setError(j.error || 'Account exists. Sign in first.')
          return
        }
        if (j.code === 'SLUG_TAKEN' || j.code === 'SLUG_PENDING') {
          setError(j.error || 'That organization URL is unavailable.')
          // Nudge slug editor open with a free-looking alternative
          setSlugEditOpen(true)
          if (!slugEdited || orgSlug === j.slug) {
            setOrgSlug(`${orgSlug}-club`)
            setSlugEdited(true)
          }
          return
        }
        setError(j.error || 'Signup failed')
        return
      }

      // Can sign in now (auto-confirmed or already verified) → pending wait
      if (j.can_sign_in || j.already_pending || loggedInMode || j.existing || !j.needs_verify) {
        if (j.needs_verify && j.email_sent) {
          setStep('verify')
          return
        }
        // A signed-in user who just registered an org request should land on
        // their dashboard (pending wait), NOT be bounced to /login.
        if (loggedInMode) {
          setStep('pending')
          setTimeout(() => navigate('/dashboard', { replace: true }), 1600)
          return
        }
        setStep('pending')
        setTimeout(() => navigate('/login', { replace: true }), 1600)
        return
      }

      setStep('verify')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendMsg('')
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(j.error || 'Could not resend email')
        return
      }
      setResendMsg(j.message || 'Verification email sent again. Check inbox and spam.')
    } catch {
      setError('Could not resend email.')
    } finally {
      setLoading(false)
    }
  }

  const stepIndex = step === 'account' ? 0 : step === 'organization' ? 1 : 2

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="relative w-full max-w-md">
        <Link
          to={loggedInMode ? '/dashboard' : '/'}
          className="inline-flex items-center gap-2 mb-6 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: '#14110E' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          {loggedInMode ? 'Back to dashboard' : 'Back to home'}
        </Link>

        {!loggedInMode && (
          <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
            {(['Account', 'Organization', 'Verify email'] as const).map((label, i) => {
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
          {step === 'account' && !loggedInMode && (
            <motion.div
              key="account"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  Create your account
                </h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  Step 1 of 3 — then register your organization and verify email.
                </p>
              </div>

              <form onSubmit={handleAccountNext} className="space-y-5">
                <Input label="Full Name" type="text" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
                <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <Input label="Password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" hint="Must be at least 6 characters" />

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth>
                  Continue to organization
                </Button>
              </form>

              <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
                Already have an account?{' '}
                <Link to="/login" className="font-extrabold" style={{ color: '#FF4D2E' }}>
                  Sign in
                </Link>
              </p>
            </motion.div>
          )}

          {step === 'organization' && (
            <motion.div
              key="organization"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-8 sm:p-10"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <div className="text-center mb-8">
                <div className="h-10 w-10 flex items-center justify-center mx-auto mb-4" style={{ background: '#2D5BFF', border: '2.5px solid #14110E' }}>
                  <Building2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                  Register your Org
                </h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  {loggedInMode
                    ? 'Submit a request — superadmin approves, then your portal opens.'
                    : 'Step 2 of 3 — after this we email a verification link.'}
                </p>
                {loggedInMode && email && (
                  <p className="text-xs font-bold mt-2" style={{ color: '#14110E' }}>
                    Signed in as {email}
                  </p>
                )}
              </div>

              <form onSubmit={handleOrgSubmit} className="space-y-5">
                <Input label="Organization Name" type="text" placeholder="e.g. FOSS Club" value={orgName} onChange={(e) => handleOrgNameChange(e.target.value)} required />

                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>
                    Organization URL
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
                          }}
                          className="w-full bg-transparent text-sm font-mono outline-none"
                          style={{ color: '#14110E' }}
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm font-mono truncate" style={{ color: '#4A4640' }}>
                          makeyourpass.vercel.app/
                          <span style={{ color: '#14110E', fontWeight: 700 }}>{orgSlug || 'your-org'}</span>
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => setSlugEditOpen(!slugEditOpen)} className="p-1.5 shrink-0" style={{ color: '#14110E' }}>
                      {slugEditOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>
                    Description
                  </label>
                  <Textarea value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} placeholder="Tell us about your organization..." rows={4} />
                </div>

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                    {/already exists|Sign in/i.test(error) && (
                      <div className="mt-2">
                        <Link to="/login" className="underline font-extrabold">
                          Go to sign in →
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                    <Building2 className="h-4 w-4" />
                    {loggedInMode ? 'Submit organization request' : 'Submit & send verification email'}
                  </Button>
                  {!loggedInMode && (
                    <Button type="button" variant="ghost" size="md" fullWidth onClick={() => { setError(''); setStep('account') }}>
                      Back to account
                    </Button>
                  )}
                </div>
              </form>
            </motion.div>
          )}

          {step === 'pending' && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 sm:p-10 text-center"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: '#14B87A' }} />
              <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
                Request submitted
              </h1>
              <p className="text-sm font-semibold mb-4" style={{ color: '#4A4640' }}>
                <strong>{orgName}</strong> is waiting for superadmin approval.
                After approval your portal opens at <strong>/{orgSlug}</strong>.
              </p>
              <p className="text-xs font-semibold mb-6" style={{ color: '#4A4640' }}>
                Your account is ready — sign in with the email and password you just used.
              </p>
              <Link to="/login">
                <Button variant="primary">Sign in now</Button>
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
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
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
                <p className="mb-2">
                  Your organization request for <strong>{orgName}</strong> is saved and waiting for superadmin approval.
                </p>
                <p>
                  After you verify, sign in and check <strong>/dashboard</strong>. Once approved, your portal opens at{' '}
                  <strong>/{orgSlug}</strong>.
                </p>
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
                <Link to="/login">
                  <Button type="button" variant="secondary" size="lg" fullWidth>
                    I verified — sign in
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
