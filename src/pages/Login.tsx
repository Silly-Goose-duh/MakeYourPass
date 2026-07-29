import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signIn, isEmailConfirmed, resolvePostLoginPath } from '@/lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signErr } = await signIn(email, password)
      if (signErr) {
        if (/confirm|verified|verification/i.test(signErr.message)) {
          setError('Please verify your email first — check your inbox for the confirmation link.')
        } else {
          setError(signErr.message)
        }
        return
      }
      if (!data?.user) return

      const confirmed = await isEmailConfirmed()
      if (!confirmed) {
        setError('Email not verified yet. Open the confirmation link we sent you.')
        return
      }

      const params = new URLSearchParams(window.location.search)
      const path = await resolvePostLoginPath({ next: params.get('next') })
      navigate(path, { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="relative w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 mb-6 text-sm font-bold transition-colors hover:opacity-70" style={{ color: '#14110E' }}>
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-8 sm:p-10"
          style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
        >
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-5">
              <div className="h-11 w-11 flex items-center justify-center" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
                <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-2xl font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
                MakeYour<span style={{ color: '#FF4D2E' }}>Pass</span>
              </span>
            </Link>
            <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>Welcome back</h1>
            <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>Sign in to manage your events</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-[42px] transition-colors hover:opacity-70"
                style={{ color: '#4A4640' }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex justify-end -mt-2">
              <Link to="/forgot-password" className="text-xs font-extrabold hover:opacity-70" style={{ color: '#FF4D2E' }}>
                Forgot password?
              </Link>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 text-sm font-bold"
                style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}
              >
                {error}
              </motion.div>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              Sign In
            </Button>
          </form>

          <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-extrabold transition-colors hover:opacity-70" style={{ color: '#FF4D2E' }}>
              Sign up free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
