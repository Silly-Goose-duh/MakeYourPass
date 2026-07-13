import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, CheckCircle2, Clock, ListChecks, Download, Search, Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { HostRoute } from '@/components/auth/RouteGuards'
import {
  getEventById,
  getEventResponses,
  getSeatStatus,
  subscribeToResponses,
  admitByQrToken,
  type SeatStatus,
} from '@/lib/supabase'
import type { EventResponse } from '@/types'

function DashboardInner({ eventId }: { eventId: string }) {
  const [eventTitle, setEventTitle] = useState('')
  const [responses, setResponses] = useState<EventResponse[]>([])
  const [seat, setSeat] = useState<SeatStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: ev }, { data: res }, { data: st }] = await Promise.all([
      getEventById(eventId),
      getEventResponses(eventId),
      getSeatStatus(eventId),
    ])
    if (ev) setEventTitle(ev.title)
    if (res) setResponses(res)
    if (st) setSeat(st)
    setLoading(false)
  }, [eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const unsub = subscribeToResponses(eventId, (payload) => {
      const p = (payload as { eventType?: string; new?: EventResponse; old?: EventResponse })?.eventType
      const row = (payload as { new?: EventResponse; old?: EventResponse })?.new
        ?? (payload as { new?: EventResponse; old?: EventResponse })?.old
      if (!row) { void load(); return }
      if (p === 'DELETE') {
        setResponses((rs) => rs.filter((r) => r.id !== row.id))
      } else if (p === 'INSERT' || p === 'UPDATE') {
        setResponses((rs) => {
          const idx = rs.findIndex((r) => r.id === row.id)
          if (idx === -1) return [row, ...rs]
          const next = [...rs]
          next[idx] = row
          return next
        })
      }
      setTimeout(() => {
        getSeatStatus(eventId).then(({ data }) => { if (data) setSeat(data) })
      }, 0)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return responses
    return responses.filter(
      (r) =>
        r.respondent_name.toLowerCase().includes(q) ||
        r.respondent_email.toLowerCase().includes(q) ||
        (r.unique_code || '').toLowerCase().includes(q)
    )
  }, [responses, query])

  const stats = useMemo(() => {
    const admitted = responses.filter((r) => r.admitted_at).length
    const confirmed = responses.filter((r) => r.status === 'confirmed').length
    const waitlisted = responses.filter((r) => r.status === 'waitlisted').length
    return { total: responses.length, admitted, confirmed, waitlisted }
  }, [responses])

  const manualAdmit = async (r: EventResponse) => {
    if (r.admitted_at) return
    setBusyId(r.id)
    const { data } = await admitByQrToken(r.qr_token)
    setBusyId(null)
    if (data && (data.status === 'admitted' || data.status === 'already_admitted')) {
      setResponses((rs) => rs.map((x) => (x.id === r.id ? { ...x, admitted_at: new Date().toISOString(), admitted_by: 'manual' } : x)))
      getSeatStatus(eventId).then(({ data: st }) => st && setSeat(st))
    }
  }

  const exportCsv = () => {
    if (responses.length === 0) return
    const headers = ['Name', 'Email', 'Phone', 'Unique Code', 'Status', 'Submitted At', 'Admitted At']
    const rows = responses.map((r) => [
      `"${r.respondent_name}"`,
      `"${r.respondent_email}"`,
      `"${r.respondent_phone}"`,
      `"${r.unique_code || ''}"`,
      `"${r.status}"`,
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
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-1">Registrants</h1>
            <p className="text-text-muted text-sm">{eventTitle}</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/host/${eventId}/scan`}>
              <Button variant="primary" size="sm"><Camera className="h-4 w-4 mr-1" /> Scan</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={<Users className="h-5 w-5" />} label="Total" value={stats.total} />
          <Stat icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} label="Admitted" value={stats.admitted} />
          <Stat icon={<ListChecks className="h-5 w-5 text-primary" />} label="Confirmed" value={stats.confirmed} />
          <Stat icon={<Clock className="h-5 w-5 text-yellow-500" />} label="Waitlisted" value={stats.waitlisted} />
        </div>

        {seat && (
          <Card className="p-3 mb-4 flex items-center justify-between text-sm">
            <span className="text-text-muted">
              Capacity <span className="text-text-primary font-semibold">{seat.capacity}</span> · Seats left{' '}
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
            <div key={r.id} className="flex items-center gap-3 p-3">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${r.admitted_at ? 'bg-green-500' : 'bg-white/20'}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary truncate">{r.respondent_name}</p>
                <p className="text-xs text-text-muted truncate">
                  {r.unique_code || '—'} · {r.status} {r.admitted_at && `· admitted ${new Date(r.admitted_at).toLocaleTimeString()}`}
                </p>
              </div>
              {!r.admitted_at && r.status === 'confirmed' && (
                <Button size="sm" variant="ghost" onClick={() => manualAdmit(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Admit'}
                </Button>
              )}
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
