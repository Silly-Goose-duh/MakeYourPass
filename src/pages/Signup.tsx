import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowLeft, Building2, CheckCircle2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { signUp, createOrganizationRequest } from '@/lib/supabase'
import { generateSlug } from '@/lib/utils'

export function SignupPage() {
  const [step, setStep] = useState<'account' | 'organization' | 'success'>('account')

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

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { error } = await signUp(email, password, fullName)
      if (error) { setError(error.message); return }
      setStep('organization')
    } catch {
      setError('Something went wrong. Please try again.')
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

    setLoading(true)
    try {
      const { error } = await createOrganizationRequest(orgName.trim(), orgSlug.trim(), orgDescription.trim())
      if (error) { setError(error.message); return }
      setStep('success')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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

        {/* Step Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['account', 'organization'] as const).map((s, i) => {
            const active = step === s || (s === 'organization' && step === 'success')
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold uppercase"
                  style={{
                    border: '2px solid #14110E',
                    background: active ? '#FF4D2E' : '#fff',
                    color: active ? '#fff' : '#4A4640',
                  }}
                >
                  <div
                    className="w-5 h-5 flex items-center justify-center text-[10px] font-extrabold"
                    style={{ background: active ? '#14110E' : '#E8E2D4', color: active ? '#fff' : '#4A4640' }}
                  >
                    {i + 1}
                  </div>
                  {s === 'account' ? 'Account' : 'Organization'}
                </div>
                {i === 0 && <div style={{ width: 24, height: 2, background: '#14110E' }} />}
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
              transition={{ duration: 0.35 }}
              className="p-8 sm:p-10"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <div className="text-center mb-8">
                <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
                  <div className="h-10 w-10 flex items-center justify-center" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
                    <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                    Campus<span style={{ color: '#FF4D2E' }}>Pass</span>
                  </span>
                </Link>
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>Create your account</h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>Start creating amazing events</p>
              </div>

              <form onSubmit={handleAccountSubmit} className="space-y-5">
                <Input label="Full Name" type="text" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
                <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <Input label="Password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" hint="Must be at least 6 characters" />

                {error && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                  </motion.div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  Create Account
                </Button>
              </form>

              <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
                Already have an account?{' '}
                <Link to="/login" className="font-extrabold transition-colors hover:opacity-70" style={{ color: '#FF4D2E' }}>
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
              transition={{ duration: 0.35 }}
              className="p-8 sm:p-10"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <div className="text-center mb-8">
                <div className="h-10 w-10 flex items-center justify-center mx-auto mb-4" style={{ background: '#2D5BFF', border: '2.5px solid #14110E' }}>
                  <Building2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>Register your Org</h1>
                <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
                  Your account has been created. Verify your email to continue.
                </p>
              </div>

              <div className="mb-6 p-3 flex items-start gap-2" style={{ background: '#FFF6D6', border: '2px solid #14110E' }}>
                <Sparkles className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2.5} style={{ color: '#14110E' }} />
                <span className="text-sm font-semibold" style={{ color: '#14110E' }}>
                  A verification email has been sent to <strong>{email}</strong>. Check your inbox to activate your account.
                </span>
              </div>

              <form onSubmit={handleOrgSubmit} className="space-y-5">
                <Input label="Organization Name" type="text" placeholder="e.g. University of Innovation" value={orgName} onChange={(e) => handleOrgNameChange(e.target.value)} required />

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
                          campuspass.com/<span style={{ color: '#14110E', fontWeight: 700 }}>{orgSlug || 'your-org'}</span>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSlugEditOpen(!slugEditOpen)}
                      className="p-1.5 shrink-0 transition-colors hover:opacity-70"
                      style={{ color: '#14110E' }}
                    >
                      {slugEditOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-xs mt-1.5 px-1" style={{ color: '#4A4640' }}>
                    Auto-generated from organization name. Click the pencil to customize.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: '#14110E' }}>Description</label>
                  <Textarea value={orgDescription} onChange={(e) => setOrgDescription(e.target.value)} placeholder="Tell us about your organization..." rows={4} />
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                    {error}
                  </motion.div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  <Building2 className="h-4 w-4" />
                  Submit Registration
                </Button>
              </form>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="p-10 text-center"
              style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
            >
              <div className="h-16 w-16 flex items-center justify-center mx-auto mb-6" style={{ background: '#14B87A', border: '2.5px solid #14110E' }}>
                <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-3xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                Request Submitted!
              </h2>
              <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
                Your organization registration request has been submitted. The superadmin will review it shortly — you'll get access once approved.
              </p>
              <Link to="/">
                <Button variant="primary" size="lg">
                  Browse Events
                </Button>
              </Link>
              <p className="text-xs mt-3" style={{ color: '#4A4640' }}>
                While you wait, check out the events happening on campus.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
