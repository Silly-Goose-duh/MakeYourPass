import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowLeft, Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signUp, createOrganizationRequest } from '@/lib/supabase'
import { generateSlug } from '@/lib/utils'

export function SignupPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState<'account' | 'organization' | 'success'>('account')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      const { data, error } = await signUp(email, password, fullName)
      if (error) { setError(error.message); return }
      if (data?.user) setUserId(data.user.id)
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
      const { data, error } = await createOrganizationRequest(orgName.trim(), orgSlug.trim(), orgDescription.trim())
      if (error) { setError(error.message); return }
      setStep('success')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-primary-hover transition-colors mb-8 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <AnimatePresence mode="wait">
          {step === 'account' && (
            <motion.div
              key="account"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
              className="glass-strong rounded-2xl p-8 sm:p-10"
            >
              <div className="text-center mb-8">
                <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xl font-bold">
                    <span className="text-white">MakeYour</span>
                    <span className="text-primary">Pass</span>
                  </span>
                </Link>
                <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
                <p className="text-text-secondary text-sm">Start creating amazing events</p>
              </div>

              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <Input
                  label="Full Name"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  hint="Must be at least 6 characters"
                />

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
                  >
                    {error}
                  </motion.div>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  Create Account
                </Button>
              </form>

              <p className="text-center mt-6 text-sm text-text-muted">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:text-primary-hover font-medium transition-colors">
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
              className="glass-strong rounded-2xl p-8 sm:p-10"
            >
              <div className="text-center mb-8">
                <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Register your Organization</h1>
                <p className="text-text-secondary text-sm">
                  Your account has been created. Please verify your email before continuing.
                </p>
              </div>

              <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-text-secondary text-sm mb-6 flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>
                  A verification email has been sent to <strong className="text-white">{email}</strong>.
                  Please check your inbox and verify your email to activate your account.
                </span>
              </div>

              <form onSubmit={handleOrgSubmit} className="space-y-4">
                <Input
                  label="Organization Name"
                  type="text"
                  placeholder="e.g. University of Innovation"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  required
                />

                <Input
                  label="Organization Slug"
                  type="text"
                  placeholder="e.g. university-of-innovation"
                  value={orgSlug}
                  onChange={(e) => { setOrgSlug(e.target.value); setSlugEdited(true) }}
                  hint="This will be used in your organization's URL"
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Description</label>
                  <textarea
                    value={orgDescription}
                    onChange={(e) => setOrgDescription(e.target.value)}
                    placeholder="Tell us about your organization..."
                    rows={4}
                    className="w-full px-4 py-3 bg-primary/50 border border-border rounded-xl text-text-primary placeholder:text-text-muted resize-y min-h-[100px] transition-all duration-200 hover:border-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:bg-primary"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
                  >
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
              className="glass-strong rounded-2xl p-10 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.15, duration: 0.5 }}
                className="h-16 w-16 rounded-2xl bg-success/20 flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 className="h-8 w-8 text-success" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-white mb-3"
              >
                Request Submitted!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-text-secondary"
              >
                Your organization registration request has been submitted. The superadmin will review it shortly.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8"
              >
                <Link to="/">
                  <Button variant="primary" size="lg">
                    Back to Home
                  </Button>
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
