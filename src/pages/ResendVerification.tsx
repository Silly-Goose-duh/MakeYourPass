import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Mail, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { resendVerificationEmail } from '@/lib/supabase'

function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : ''
}

function withNext(path: string, next: string) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path
}

export function ResendVerificationPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const loginPath = withNext('/login', next)
  const [email, setEmail] = useState(params.get('email') || '')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (cooldown > 0 || loading) return
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const { data, error: resendError } = await resendVerificationEmail(email)
      if (resendError) {
        setError(resendError.message)
        return
      }
      setSent(true)
      setInfo(data?.message || 'Verification email sent again. Check your inbox and spam folder.')
      setCooldown(30)
    } catch {
      setError('Could not resend verification email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const resendPath = (() => {
    const query = new URLSearchParams()
    if (email.trim()) query.set('email', email.trim())
    if (next) query.set('next', next)
    return `/resend-verification${query.toString() ? `?${query.toString()}` : ''}`
  })()

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="relative w-full max-w-md">
        <Link to={loginPath} className="inline-flex items-center gap-2 mb-6 text-sm font-bold transition-colors hover:opacity-70" style={{ color: '#14110E' }}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back to sign in
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 sm:p-10"
          style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
        >
          <div className="text-center mb-8">
            <div className="inline-flex h-11 w-11 items-center justify-center mb-5" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
              <Mail className="h-5 w-5" strokeWidth={2.5} style={{ color: '#14110E' }} />
            </div>
            <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
              Resend verification
            </h1>
            <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
              Enter the email on your MakeYourPass account and we’ll send the confirmation link again.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setSent(false)
                setInfo('')
                setError('')
              }}
              placeholder="you@example.com"
              autoComplete="email"
            />

            {error && (
              <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                {error}
              </div>
            )}
            {info && (
              <div className="p-3 text-sm font-bold" style={{ background: '#E8F8F0', border: '2px solid #14B87A', color: '#0A7A4F' }}>
                {info}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} disabled={loading || cooldown > 0}>
              {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Send verification email'}
            </Button>
          </form>

          {sent && (
            <div className="mt-6 p-4 text-center" style={{ background: '#FFF6D6', border: '2px solid #14110E' }}>
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2" style={{ color: '#0A7A4F' }} />
              <p className="text-sm font-bold" style={{ color: '#14110E' }}>
                Open the newest email, then return here to sign in.
              </p>
              <p className="text-xs font-semibold mt-1" style={{ color: '#4A4640' }}>
                Check spam and make sure you are using the same email as your account.
              </p>
            </div>
          )}

          <div className="flex flex-col items-center gap-3 mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
            <Link to={loginPath} className="font-extrabold hover:opacity-70" style={{ color: '#FF4D2E' }}>
              I verified my email — sign in
            </Link>
            <Link to={resendPath} className="text-xs underline hover:opacity-70">
              Use a different email
            </Link>
          </div>
        </motion.div>

        <Link to="/" className="flex items-center justify-center gap-2 mt-7">
          <div className="h-7 w-7 flex items-center justify-center" style={{ background: '#FF4D2E', border: '2px solid #14110E' }}>
            <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            MakeYour<span style={{ color: '#FF4D2E' }}>Pass</span>
          </span>
        </Link>
      </div>
    </div>
  )
}

export default ResendVerificationPage
