import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Users, CheckCircle2, Clock, ListChecks, Download, Search, Camera,
  Loader2, Mail, Flag, Send, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { HostRoute } from '@/components/auth/RouteGuards'
import {
  getEventById,
  getEventResponses,
  getSeatStatus,
  subscribeToResponses,
  admitByQrToken,
  verifyPayment,
  markEventEnded,
  getAccessToken,
  type SeatStatus,
} from '@/lib/supabase'
import type { CampusEvent, EventResponse } from '@/types'

function DashboardInner({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<CampusEvent | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [responses, setResponses] = useState<EventResponse[]>([])
  const [seat, setSeat] = useState<SeatStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reachoutOpen, setReachoutOpen] = useState(false)
  const [reachSubject, setReachSubject] = useState('')
  const [reachBody, setReachBody] = useState('')
  const [reachBusy, setReachBusy] = useState(false)
  const [endBusy, setEndBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: ev }, { data: res }, { data: st }] = await Promise.all([
      getEventById(eventId),
      getEventResponses(eventId),
      getSeatStatus(eventId),
    ])
    if (ev) {
      setEvent(ev as CampusEvent)
      setEventTitle(ev.title)
    }
    if (res) setResponses(res)
    if (st) setSeat(st)
    setLoading(false)
  }, [eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const unsub = subscribeToResponses(eventId, () => { void load() })
    return unsub
  }, [eventId, load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return responses
    return responses.filter(
      (r) =>
        (r.respondent_name || '').toLowerCase().includes(q) ||
        (r.respondent_email || '').toLowerCase().includes(q) ||
        (r.unique_code || '').toLowerCase().includes(q)
    )
  }, [responses, query])

  const stats = useMemo(() => {
    const admitted = responses.filter((r) => r.admitted_at).length
    const confirmed = responses.filter((r) => r.status === 'confirmed').length
    const waitlisted = responses.filter((r) => r.status === 'waitlisted').length
    const pendingPay = responses.filter((r) => r.payment_status === 'pending').length
    return { total: responses.length, admitted, confirmed, waitlisted, pendingPay }
  }, [responses])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3200)
  }

  const manualAdmit = async (r: EventResponse) => {
    if (r.admitted_at) return
    setBusyId(r.id)
    const { data } = await admitByQrToken(r.qr_token, eventId)
    setBusyId(null)
    if (data && (data.status === 'admitted' || data.status === 'already_admitted')) {
      setResponses((rs) => rs.map((x) => (x.id === r.id ? { ...x, admitted_at: new Date().toISOString() } : x)))
      getSeatStatus(eventId).then(({ data: st }) => { if (st) setSeat(st) }).catch(() => {})
    } else if (data && data.status === 'wrong_event') {
      flash('Ticket belongs to a different event')
    }
  }

  /** Host reviews screenshot then sends ticket + email + UID */
  const sendTicket = async (r: EventResponse) => {
    setBusyId(r.id)
    try {
      if (r.payment_status === 'pending') {
        const { error } = await verifyPayment(r.id)
        if (error) throw error
      }
      const res = await fetch('/api/on-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: r.id, force: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to send ticket')
      setResponses((rs) =>
        rs.map((x) =>
          x.id === r.id
            ? {
                ...x,
                payment_status: x.payment_status === 'pending' ? 'verified' : x.payment_status,
                email_sent_at: new Date().toISOString(),
                ticket_url: j.ticket_url || x.ticket_url,
              }
            : x
        )
      )
      flash(`Ticket sent to ${r.respondent_email}`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusyId(null)
    }
  }

  const doReachout = async () => {
    if (!reachSubject.trim() || !reachBody.trim()) return
    setReachBusy(true)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/reachout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          event_id: eventId,
          subject: reachSubject.trim(),
          body: reachBody.trim(),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Reachout failed')
      flash(`Reachout sent to ${j.sent ?? 0} people`)
      setReachoutOpen(false)
      setReachSubject('')
      setReachBody('')
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Reachout failed')
    } finally {
      setReachBusy(false)
    }
  }

  const doEndEvent = async () => {
    if (!confirm('End this event? Admits will get a thank-you email with a personalized certificate.')) return
    setEndBusy(true)
    try {
      await markEventEnded(eventId)
      const token = await getAccessToken()
      const res = await fetch('/api/end-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ event_id: eventId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'End event failed')
      setEvent((e) => (e ? { ...e, ended_at: new Date().toISOString() } : e))
      flash(`Certificates sent to ${j.sent ?? 0} admitted attendees`)
      void load()
    } catch (e) {
      flash(e instanceof Error ? e.message : 'End event failed')
    } finally {
      setEndBusy(false)
    }
  }

  const exportCsv = () => {
    if (responses.length === 0) return
    const headers = ['Name', 'Email', 'Phone', 'Unique Code', 'Status', 'Payment', 'Submitted At', 'Admitted At']
    const rows = responses.map((r) => [
      `"${r.respondent_name}"`,
      `"${r.respondent_email}"`,
      `"${r.respondent_phone}"`,
      `"${r.unique_code || ''}"`,
      `"${r.status}"`,
      `"${r.payment_status || 'na'}"`,
      `"${new Date(r.submitted_at).toLocaleString()}"`,
      `"${r.admitted_at ? new Date(r.admitted_at).toLocaleString() : ''}"`,
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${eventTitle.replace(/\s+/g, '-') || 'event'}-registrants.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 sm:px-6 pt-20 pb-16 max-w-3xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-text-muted text-sm mb-4 hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Live statistics</h1>
            <p className="text-text-muted text-sm">{eventTitle}</p>
            {event?.ended_at && (
              <Badge className="mt-2 bg-surface text-text-muted">Ended {new Date(event.ended_at).toLocaleString()}</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/host/${eventId}/scan`}>
              <Button variant="primary" size="sm"><Camera className="h-4 w-4 mr-1" /> Scan</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setReachoutOpen((v) => !v)}>
              <Mail className="h-4 w-4 mr-1" /> Reachout
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void doEndEvent()}
              disabled={endBusy || !!event?.ended_at}
            >
              {endBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4 mr-1" />}
              End event
            </Button>
            <Button variant="ghost" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          </div>
        </div>

        {toast && (
          <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-text-primary">{toast}</div>
        )}

        {reachoutOpen && (
          <Card className="p-4 mb-6 space-y-3">
            <h3 className="font-semibold text-text-primary">Reachout — email all registered</h3>
            <Input label="Subject" value={reachSubject} onChange={(e) => setReachSubject(e.target.value)} placeholder="Update about the event" />
            <Textarea label="Message" value={reachBody} onChange={(e) => setReachBody(e.target.value)} rows={4} placeholder="Hi everyone, …" />
            <Button variant="primary" size="sm" onClick={() => void doReachout()} disabled={reachBusy}>
              {reachBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to all
            </Button>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <Stat icon={<Users className="h-5 w-5" />} label="Total" value={stats.total} />
          <Stat icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} label="Admitted" value={stats.admitted} />
          <Stat icon={<ListChecks className="h-5 w-5 text-primary" />} label="Confirmed" value={stats.confirmed} />
          <Stat icon={<Clock className="h-5 w-5 text-yellow-500" />} label="Waitlisted" value={stats.waitlisted} />
          <Stat icon={<Mail className="h-5 w-5 text-orange-400" />} label="Pay pending" value={stats.pendingPay} />
        </div>

        {seat && (
          <Card className="p-3 mb-4 flex items-center justify-between text-sm">
            <span className="text-text-muted">
              Capacity <span className="text-text-primary font-semibold">{seat.capacity || '∞'}</span> · Seats left{' '}
              <span className="text-text-primary font-semibold">{seat.seats_left ?? '—'}</span>
            </span>
            {seat.seats_left !== null && seat.seats_left <= 0 && <Badge className="bg-red-500/20 text-red-300">SOLD OUT</Badge>}
          </Card>
        )}

        <div className="relative mb-4">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or code"
            className="pl-9"
          />
        </div>

        <Card className="divide-y divide-white/5">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-text-muted text-sm">No registrants yet.</p>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.admitted_at ? 'bg-green-500' : 'bg-white/20'}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary truncate">{r.respondent_name}</p>
                  <p className="text-xs text-text-muted truncate">
                    {r.unique_code || '—'} · {r.status}
                    {r.payment_status && r.payment_status !== 'na' && ` · pay:${r.payment_status}`}
                    {r.email_sent_at && ' · ticket sent'}
                    {r.admitted_at && ` · admitted`}
                  </p>
                  <p className="text-xs text-text-muted truncate">{r.respondent_email}</p>
                </div>
                {r.payment_proof_url && (
                  <a href={r.payment_proof_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={r.payment_proof_url} alt="Proof" className="h-14 w-14 object-cover rounded-lg border border-border" />
                  </a>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {/* Send ticket after reviewing screenshot (or free regs) */}
                {!r.email_sent_at && r.status !== 'cancelled' && (
                  <Button size="sm" variant="primary" onClick={() => void sendTicket(r)} disabled={busyId === r.id}>
                    {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send ticket
                  </Button>
                )}
                {r.ticket_url && (
                  <a href={r.ticket_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /> Ticket</Button>
                  </a>
                )}
                {!r.admitted_at && r.status === 'confirmed' && (
                  <Button size="sm" variant="ghost" onClick={() => void manualAdmit(r)} disabled={busyId === r.id}>
                    Admit
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-3 flex items-center gap-2">
      <div className="text-text-muted">{icon}</div>
      <div>
        <p className="text-lg font-bold text-text-primary leading-none">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const { eventId } = useParams<{ eventId: string }>()
  if (!eventId) return <div className="min-h-screen bg-background" />
  return (
    <HostRoute eventId={eventId}>
      <DashboardInner eventId={eventId} />
    </HostRoute>
  )
}
