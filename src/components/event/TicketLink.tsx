import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getAccessToken } from '@/lib/supabase'

/**
 * The `tickets` bucket is private, so event_responses.ticket_url holds a
 * storage path. Ask /api/ticket-image for a short-lived signed URL at click
 * time (legacy rows that still hold a public http(s) URL are opened directly).
 */
export function TicketLink({
  registrationId,
  ticketUrl,
  label = 'View ticket',
}: {
  registrationId: string
  ticketUrl: string | null
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isDirect = !!ticketUrl && /^https?:\/\//i.test(ticketUrl)

  const openTicket = async () => {
    if (isDirect) {
      window.open(ticketUrl as string, '_blank', 'noopener,noreferrer')
      return
    }
    setBusy(true)
    setErr(null)
    // Opened synchronously so popup blockers don't swallow the tab, then
    // navigated once the signed URL comes back (and closed again on failure).
    const tab = window.open('', '_blank')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Session expired — sign in again')
      const res = await fetch('/api/ticket-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ registration_id: registrationId }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) throw new Error('Session expired — sign in again')
      if (res.status === 403) throw new Error('Not allowed to view this ticket')
      if (res.status === 404) throw new Error('Registration not found')
      if (!res.ok) throw new Error(j.error || 'Could not load ticket')
      if (!j.url) throw new Error('Ticket not generated yet')
      if (tab) {
        tab.opener = null
        tab.location.replace(j.url)
      } else {
        window.open(j.url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      tab?.close()
      setErr(e instanceof Error ? e.message : 'Could not load ticket')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={() => void openTicket()} disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
        {label}
      </Button>
      {err && <span className="text-xs font-bold" style={{ color: '#FF4D2E' }}>{err}</span>}
    </span>
  )
}
