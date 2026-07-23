import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowLeft, Building2, CheckCircle2, Pencil, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import {
  signUp,
  createOrganizationRequest,
  resendSignupEmail,
  isEmailConfirmed,
  getSession,
  getUserRequests,
} from '@/lib/supabase'
import { generateSlug } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

type Step = 'account' | 'verify' | 'organization' | 'success'

export function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('account')

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

  // Deep-link after email confirm: /signup?step=organization
  useEffect(() => {
    const wantOrg = searchParams.get('step') === 'organization'
    if (!wantOrg) return
    let alive = true
    ;(async () => {
      const session = await getSession()
      if (!session?.user) {
        if (alive) {
          setError('Please verify your email and sign in first.')
          setStep('account')
        }
        return
      }
      const confirmed = await isEmailConfirmed()
      if (!confirmed) {
        if (alive) {
          setEmail(session.user.email || '')
          setStep('verify')
        }
        return
      }
      // Already has pending request?
      const { data: reqs } = await getUserRequests()
      if ((reqs || []).some((r) => r.status === 'pending')) {
        if (alive) navigate('/dashboard', { replace: true })
        return
      }
      if (alive) {
        setEmail(session.user.email || '')
        setStep('organization')
      }
    })()
    return () => { alive = false }
  }, [searchParams, navigate])

  // If logged-in user with confirmed email visits signup, skip to org request
  useEffect(() => {
    if (searchParams.get('step')) return
    if (!user) return
    let alive = true
    ;(async () => {
      const confirmed = await isEmailConfirmed()
      if (!alive) return
      if (confirmed) setStep('organization')
    })()
    return () => { alive = false }
  }, [user, searchParams])

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResendMsg('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { data, error: signErr } = await signUp(email, password, fullName)
      if (signErr) {
        setError(signErr.message)
        return
      }
      // With mailer_autoconfirm=false, session is usually null until email is confirmed
      if (data.session) {
        // Edge case: autoconfirm still on somewhere
        setStep('organization')
      } else {
        setStep('verify')
      }
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
      const { error: rErr } = await resendSignupEmail(email)
      if (rErr) setError(rErr.message)
      else setResendMsg('Verification email sent again. Check your inbox (and spam).')
    } catch {
      setError('Could not resend email.')
    } finally {
      setLoading(false)
    }
  }

  const handleOrgNameChange = (name: string) => {
    setOrgName(name)
    if (!slugEdited) setOrgSlug(generateSlug(name))
  }

  const handleOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!orgName.trim()) { setError('Organization name is required'); return }
    if (!orgSlug.trim()) { setError('Organization slug is required'); return }

    // Must be logged in + confirmed
    const session = await getSession()
    if (!session?.user) {
      setError('Verify your email and sign in before submitting an organization request.')
      setStep('verify')
      return
    }
    const confirmed = await isEmailConfirmed()
    if (!confirmed) {
      setError('Email not verified yet. Open the link we sent you first.')
      setStep('verify')
      return
    }

    setLoading(true)
    try {
      const { error: orgErr } = await createOrganizationRequest(orgName.trim(), orgSlug.trim(), orgDescription.trim())
      if (orgErr) { setError(orgErr.message); return }
      setStep('success')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const stepIndex = step === 'account' ? 0 : step === 'verify' ? 1 : step === 'organization' ? 2 : 3

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 mb-6 text-sm font-bold transition-colors hover:opacity-70"
          style={{ color: '#14110E' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back to home
        </Link>

        {/* Progress */}
        <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
          {(['Account', 'Verify email', 'Organization'] as const).map((label, i) => {
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

        <AnimatePresence mode="wait">
          {step === 'account' && (
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
                  Email verification is required before you can request an organization.
                </p>
              </div>

              <form onSubmit={handleAccountSubmit} className="space-y-5">
                <Input label="Full Name" type="text" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
                <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <Input label="Password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" hint="Must be at least 6 characters" />

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  Create Account
                </Button>
              </form>

              <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
                Already have an account?{' '}
                <Link to="/login" className="font-extrabold" style={{ color: '#FF4D2E' }}>Sign in</Link>
              </p>
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
              <p className="text-sm font-semibold mb-4" style={{ color: '#4A4640' }}>
                We sent a confirmation link to <strong style={{ color: '#14110E' }}>{email}</strong>.
                Open it to activate your account — you can&apos;t request an org until this is done.
              </p>
              <div className="p-3 mb-6 text-left text-sm font-semibold" style={{ background: '#FFF6D6', border: '2px solid #14110E', color: '#14110E' }}>
                After clicking the link you&apos;ll land back here to register your organization. Check spam if you don&apos;t see the mail.
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
                  Superadmin must approve before your portal opens at /your-slug
                </p>
              </div>

              <form onSubmit={handleOrgSubmit} className="space-y-5">
                <Input label="Organization Name" type="text" placeholder="e.g. FOSS Club" value={orgName} onChange={(e) => handleOrgNameChange(e.target.value)} required />

                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>Organization URL</label>
                  <div className="flex items-center gap-2 p-3" style={{ background: '#F4EFE1', border: '2px solid #14110E' }}>
                    <div className="flex-1 min-w-0">
                      {slugEditOpen ? (
                        <input
                          type="text"
                          value={orgSlug}
                          onChange={(e) => { setOrgSlug(e.target.value); setSlugEdited(true) }}
                          className="w-full bg-transparent text-sm font-mono outline-none"
                          style={{ color: '#14110E' }}
                          autoFocus
                        />
                      ) : (
                        <p className="text-sm font-mono truncate" style={{ color: '#4A4640' }}>
                          makeyourpass.vercel.app/<span style={{ color: '#14110E', fontWeight: 700 }}>{orgSlug || 'your-org'}</span>
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => setSlugEditOpen(!slugEditOpen)} className="p-1.5 shrink-0" style={{ color: '#14110E' }}>
                      {slugEditOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>Description</label>
                  <Textarea value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} placeholder="Tell us about your organization..." rows={4} />
                </div>

                {error && (
                  <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  <Building2 className="h-4 w-4" />
                  Submit for approval
                </Button>
              </form>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-10 text-center"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <div className="h-16 w-16 flex items-center justify-center mx-auto mb-6" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
                <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} style={{ color: '#14110E' }} />
              </div>
              <h2 className="text-3xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                Request pending
              </h2>
              <p className="text-sm font-semibold mb-2" style={{ color: '#4A4640' }}>
                Your organization request for <strong style={{ color: '#14110E' }}>{orgName}</strong> is waiting for superadmin approval.
              </p>
              <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
                Once approved, your dashboard opens at{' '}
                <strong style={{ color: '#14110E' }}>makeyourpass.vercel.app/{orgSlug}</strong>
              </p>
              <Link to="/dashboard">
                <Button variant="primary" size="lg">
                  Check request status
                </Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
