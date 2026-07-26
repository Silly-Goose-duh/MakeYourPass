import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { requestPasswordReset } from '@/lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: err } = await requestPasswordReset(email)
      if (err) {
        setError(err.message)
        return
      }
      setSent(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="relative w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-2 mb-6 text-sm font-bold hover:opacity-70" style={{ color: '#14110E' }}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> Back to sign in
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 sm:p-10"
          style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
        >
          <div className="text-center mb-8">
            <div className="inline-flex h-11 w-11 items-center justify-center mb-4" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
              <Mail className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
              Forgot password?
            </h1>
            <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
              We’ll email you a link to set a new one.
            </p>
          </div>

          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm font-bold" style={{ color: '#14110E' }}>
                Check your inbox for <span style={{ color: '#FF4D2E' }}>{email}</span>
              </p>
              <p className="text-xs font-semibold" style={{ color: '#4A4640' }}>
                Open the link in that email, then choose a new password. Also check spam.
              </p>
              <Link to="/login" className="inline-block font-extrabold text-sm" style={{ color: '#FF4D2E' }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {error && (
                <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                  {error}
                </div>
              )}
              <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                Send reset link
              </Button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
