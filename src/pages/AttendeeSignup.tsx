import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signUp, updateProfile } from '@/lib/supabase'

export function AttendeeSignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')?.startsWith('/') && !params.get('next')?.startsWith('//')
    ? params.get('next')!
    : '/events'
  const loginPath = `/login?next=${encodeURIComponent(next)}`
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  const resendPath = (address = email) => {
    const query = new URLSearchParams({ next })
    if (address.trim()) query.set('email', address.trim())
    return `/resend-verification?${query.toString()}`
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (fullName.trim().length < 2) return setError('Enter your full name')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    try {
      const { data, error: signupError } = await signUp(email.trim().toLowerCase(), password, fullName.trim(), phone.trim(), next)
      if (signupError) {
        setError(/already|registered|exists/i.test(signupError.message)
          ? 'An account with this email already exists. Sign in to continue.'
          : signupError.message)
        return
      }
      if (!data.user) throw new Error('Could not create account')
      if (!data.session) {
        setVerificationSent(true)
        return
      }
      await updateProfile(data.user.id, { full_name: fullName.trim(), phone: phone.trim() })
      setDone(true)
      setTimeout(() => navigate(next, { replace: true }), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setLoading(false)
    }
  }

  if (verificationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
        <div className="w-full max-w-md p-8 text-center" style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}>
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: '#14B87A' }} />
          <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>Check your email</h1>
          <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>Confirm your account, then sign in to continue to your event. Check spam if the email does not arrive.</p>
          <div className="flex flex-col gap-3">
            <Link to={loginPath}><Button variant="primary" size="lg" fullWidth>Go to sign in</Button></Link>
            <Link to={resendPath()} className="text-sm font-extrabold underline" style={{ color: '#FF4D2E' }}>
              Didn&apos;t receive it? Resend verification email
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
        <div className="w-full max-w-md p-8 text-center" style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}>
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4" style={{ color: '#14B87A' }} />
          <h1 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>Account ready</h1>
          <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>Taking you back to your event…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F4EFE1' }}>
      <div className="relative w-full max-w-md">
        <Link to={next} className="inline-flex items-center gap-2 mb-6 text-sm font-bold" style={{ color: '#14110E' }}>
          <ArrowLeft className="h-4 w-4" /> Back to event
        </Link>
        <div className="p-8 sm:p-10" style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '7px 7px 0 #14110E' }}>
          <div className="text-center mb-8">
            <div className="h-11 w-11 flex items-center justify-center mx-auto mb-4" style={{ background: '#FF4D2E', border: '2.5px solid #14110E' }}>
              <Ticket className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>Create your account</h1>
            <p className="text-sm font-semibold" style={{ color: '#4A4640' }}>Register once, then join campus events in one click.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name" required />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" hint="Used to prefill future registrations. You can leave this blank." />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" required />
            {error && (
              <div className="p-3 text-sm font-bold" style={{ background: '#FFE9E3', border: '2px solid #FF4D2E', color: '#FF4D2E' }}>
                {error}
                {/already|registered|exists/i.test(error) && (
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
            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>Create account</Button>
          </form>
          <p className="text-center mt-6 text-sm font-semibold" style={{ color: '#4A4640' }}>
            Already registered? <Link to={loginPath} className="font-extrabold" style={{ color: '#FF4D2E' }}>Sign in</Link>
          </p>
          <p className="text-center mt-4 text-xs font-semibold" style={{ color: '#7A756B' }}>
            Running a club? <Link to="/signup" className="underline">Register your club</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default AttendeeSignupPage
