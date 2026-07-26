import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { KeyRound, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { updatePassword } from '@/lib/supabase'

/** Shown after user opens the recovery link (session already established). */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await updatePassword(password)
      if (err) {
        setError(err.message)
        return
      }
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch {
      setError('Could not update password. Try the reset link again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 sm:p-10"
        style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}
      >
        <div className="text-center mb-8">
          <div className="inline-flex h-11 w-11 items-center justify-center mb-4" style={{ background: '#FFD23F', border: '2.5px solid #14110E' }}>
            <KeyRound className="h-5 w-5" strokeWidth={2.5} style={{ color: '#14110E' }} />
          </div>
          <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            Set new password
          </h1>
          <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>
            Choose a strong password you haven’t used here before.
          </p>
        </div>

        {done ? (
          <p className="text-center text-sm font-bold" style={{ color: '#14B87A' }}>
            Password updated — redirecting to sign in…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                label="New password"
                type={show ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                className="absolute right-4 top-[42px]"
                onClick={() => setShow(!show)}
                style={{ color: '#4A4640' }}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              label="Confirm password"
              type={show ? 'text' : 'password'}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {error && (
              <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                {error}
              </div>
            )}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
              Update password
            </Button>
            <p className="text-center text-xs font-semibold" style={{ color: '#4A4640' }}>
              Link expired? <Link to="/forgot-password" style={{ color: '#FF4D2E' }} className="font-extrabold">Request a new one</Link>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  )
}

export default ResetPasswordPage
