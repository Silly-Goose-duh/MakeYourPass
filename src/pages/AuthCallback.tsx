import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, getUserOrganizations } from '@/lib/supabase'

/**
 * Handles email-confirmation / magic-link redirects from Supabase.
 * URL may contain hash tokens (#access_token=...) or ?code= for PKCE.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [message, setMessage] = useState('Confirming your email…')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // Exchange code if present (PKCE)
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exErr) throw exErr
        } else {
          // Hash tokens are auto-parsed by supabase-js on getSession
          const { data, error: sessErr } = await supabase.auth.getSession()
          if (sessErr) throw sessErr
          if (!data.session) {
            // Give client a beat to pick up hash fragments
            await new Promise((r) => setTimeout(r, 400))
            const again = await supabase.auth.getSession()
            if (!again.data.session) {
              throw new Error('No session after confirmation. Try signing in.')
            }
          }
        }

        if (!alive) return
        setMessage('Email verified! Redirecting…')

        // After verify: approved org → portal; else pending hub at /dashboard
        const { data: memberships } = await getUserOrganizations()
        if (memberships && memberships.length > 0 && memberships[0].organizations?.slug) {
          navigate(`/${memberships[0].organizations.slug}`, { replace: true })
          return
        }
        navigate('/dashboard', { replace: true })
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Confirmation failed')
        setMessage('')
      }
    })()
    return () => { alive = false }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F4EFE1' }}>
      <div
        className="max-w-md w-full p-8 text-center"
        style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '6px 6px 0 #14110E' }}
      >
        {error ? (
          <>
            <h1 className="text-xl font-extrabold mb-3" style={{ fontFamily: 'Syne, sans-serif', color: '#FF4D2E' }}>
              Could not verify
            </h1>
            <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>{error}</p>
            <Link to="/login" className="zine-btn zine-btn-accent">Sign in</Link>
          </>
        ) : (
          <>
            <div className="h-8 w-8 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>{message}</p>
          </>
        )}
      </div>
    </div>
  )
}

export default AuthCallbackPage
