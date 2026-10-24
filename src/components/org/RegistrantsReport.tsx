import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Image as ImageIcon, Search, Users } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getEventResponses, subscribeToResponses, supabase } from '@/lib/supabase'
import { exportCsv } from '@/lib/exportCsv'
import type { CampusEvent, EventResponse } from '@/types'

const INK = '#14110E'
const MUTED = '#4A4640'
const FAINT = '#7A756B'
const OK = '#0E8C5C'
const ERR = '#C2331F'
const PAYMENT_PROOFS_BUCKET = 'payment-proofs'

type ProofStatus = 'uploaded' | 'duplicate' | 'verified' | 'rejected'

/** public.payment_proofs row (payments migration) — staff-readable via RLS. */
interface PaymentProofRow {
  id: string
  registration_id: string
  event_id: string
  path: string
  sha256?: string | null
  status: ProofStatus
  created_at: string
}

/** All proofs we know for one registration (latest first). */
interface ProofEntry {
  latest: PaymentProofRow
  count: number
  duplicate: boolean
}

interface RowMsg {
  ok: boolean
  text: string
}

/**
 * Map an RPC / PostgREST failure to an honest, actionable sentence.
 * PGRST202 — the function isn't in the schema cache (migration not applied).
 * 42501 / RLS message — the caller isn't org staff.
 */
function rpcOops(err: unknown): string {
  const rec = err as { code?: string; message?: string } | null
  if (rec?.code === 'PGRST202') return 'verify_payment_proof RPC not found — payments migration not applied yet'
  if (rec?.code === '42501' || (rec?.message || '').includes('row-level security')) {
    return 'Not allowed — verification is restricted to org staff'
  }
  return rec?.message || 'Request failed'
}

/** Canonical payment_state label used in the table badge and the CSV export. */
function paymentStateOf(r: EventResponse, paidEvent: boolean): string {
  if (!paidEvent) return 'na'
  if (r.payment_status === 'pending') return 'paid_unverified'
  if (r.payment_status === 'verified') return 'paid_verified'
  if (r.payment_status === 'rejected') return 'rejected'
  return 'na'
}

/** Lazy proof thumbnail: signed URL (120 s) on first hover/focus, enlarged
 *  in-place on hover (in-flow, so table scroll containers can't clip it), and
 *  full-size in a new tab on click. */
function ProofThumb({ entry }: { entry: ProofEntry | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState(false)

  if (!entry) {
    return <span className="text-xs font-semibold" style={{ color: FAINT }}>—</span>
  }

  const ensure = () => {
    if (url || loading || failed) return
    setLoading(true)
    ;(async () => {
      const { data, error } = await supabase.storage
        .from(PAYMENT_PROOFS_BUCKET)
        .createSignedUrl(entry.latest.path, 120)
      if (error || !data?.signedUrl) setFailed(true)
      else setUrl(data.signedUrl)
      setLoading(false)
    })()
  }

  const open = () => {
    ensure()
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const enlarged = hovered && !!url
  return (
    <div
      className="relative inline-block text-left"
      title={failed ? 'Proof unavailable' : entry.duplicate ? 'Duplicate proof' : 'Payment proof'}
    >
      <button
        type="button"
        className={`flex items-center justify-center border-2 border-[#14110E] bg-white overflow-hidden transition-all duration-150 ${enlarged ? 'h-24 w-24' : 'h-10 w-10'}`}
        onMouseEnter={() => { setHovered(true); ensure() }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => { setHovered(true); ensure() }}
        onBlur={() => setHovered(false)}
        onClick={open}
        aria-label={url ? 'Open payment proof in a new tab' : 'Load payment proof thumbnail'}
      >
        {loading ? (
          <div className="h-4 w-4 border-2 border-[#14110E] border-t-transparent rounded-full animate-spin" />
        ) : url ? (
          <img src={url} alt="Payment proof" className="h-full w-full object-contain" />
        ) : failed ? (
          <span className="text-[9px] font-extrabold" style={{ color: ERR }}>N/A</span>
        ) : (
          <ImageIcon className="h-4 w-4" style={{ color: MUTED }} />
        )}
      </button>
      {entry.duplicate && (
        <span className="absolute -top-2 -right-2 z-10">
          <Badge variant="error" size="sm" className="rotate-[6deg]">duplicate</Badge>
        </span>
      )}
      {enlarged && (
        <p className="mt-0.5 text-[9px] font-bold" style={{ color: MUTED }}>
          click to open
        </p>
      )}
    </div>
  )
}

/**
 * "Registrants" section for one event: searchable table with payment proofs,
 * staff verify/reject via the verify_payment_proof RPC (optimistic update +
 * inline feedback), duplicate-proof flags and a Sheets-compatible CSV export.
 */
export function RegistrantsReport({ event }: { event: CampusEvent }) {
  const paidEvent = event.payment_type === 'paid'
  const [responses, setResponses] = useState<EventResponse[]>([])
  const [proofs, setProofs] = useState<Record<string, ProofEntry>>({})
  const [proofsNote, setProofsNote] = useState<string | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowMsgs, setRowMsgs] = useState<Record<string, RowMsg>>({})
  const msgTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const loadProofs = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_proofs')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    if (error) {
      const code = (error as { code?: string }).code
      // 42P01 / PGRST205 — the table isn't there yet (migration pending)
      if (code === '42P01' || code === 'PGRST205') {
        setProofsNote('payment_proofs table not available yet — payments migration pending; verify with the existing flow')
        return
      }
      setProofsNote(error.message)
      return
    }
    const map: Record<string, ProofEntry> = {}
    for (const row of (data || []) as PaymentProofRow[]) {
      const existing = map[row.registration_id]
      if (!existing) {
        map[row.registration_id] = { latest: row, count: 1, duplicate: row.status === 'duplicate' }
      } else {
        existing.count += 1
        existing.duplicate = existing.duplicate || row.status === 'duplicate'
      }
    }
    for (const key of Object.keys(map)) {
      if (map[key].count > 1) map[key].duplicate = true
    }
    setProofs(map)
    setProofsNote(null)
  }, [event.id])

  const load = useCallback(async () => {
    const { data, error } = await getEventResponses(event.id)
    if (error) {
      setResponses([])
      setLoadErr(error.message)
    } else {
      setResponses(data || [])
      setLoadErr(null)
    }
    setLoading(false)
    await loadProofs()
  }, [event.id, loadProofs])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const unsub = subscribeToResponses(event.id, () => { void load() })
    return () => { unsub() }
  }, [event.id, load])

  useEffect(() => () => {
    for (const timer of Object.values(msgTimers.current)) clearTimeout(timer)
  }, [])

  const setRowMsg = (id: string, m: RowMsg) => {
    setRowMsgs((prev) => ({ ...prev, [id]: m }))
    const existing = msgTimers.current[id]
    if (existing) clearTimeout(existing)
    msgTimers.current[id] = setTimeout(() => {
      setRowMsgs((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 4000)
  }

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
    const unverified = responses.filter((r) => paymentStateOf(r, paidEvent) === 'paid_unverified').length
    const verified = responses.filter((r) => paymentStateOf(r, paidEvent) === 'paid_verified').length
    const waitlisted = responses.filter((r) => r.status === 'waitlisted').length
    return { total: responses.length, unverified, verified, waitlisted }
  }, [responses, paidEvent])

  /** Decide / undo a payment from the table row. Optimistic first, revert on RPC error. */
  const decidePayment = async (r: EventResponse, reject: boolean) => {
    if (busyId) return
    setBusyId(r.id)
    const previous = r.payment_status
    setResponses((list) =>
      list.map((x) => (x.id === r.id ? { ...x, payment_status: reject ? 'rejected' : 'verified' } : x))
    )
    try {
      const { data, error } = await supabase.rpc('verify_payment_proof', {
        p_registration: r.id,
        p_reject: reject,
      })
      if (error) throw error
      // The RPC may answer with a JSONB { error } payload instead of a PostgREST error
      const payload = (data ?? null) as { ok?: boolean; error?: string } | null
      if (payload?.error) throw new Error(payload.error)
      setRowMsg(r.id, { ok: true, text: reject ? 'Payment rejected' : 'Payment verified ✓' })
      void loadProofs()
    } catch (e) {
      setResponses((list) => list.map((x) => (x.id === r.id ? { ...x, payment_status: previous } : x)))
      setRowMsg(r.id, { ok: false, text: rpcOops(e) })
    } finally {
      setBusyId(null)
    }
  }

  const onExport = () => {
    if (filtered.length === 0) return
    const code = (event.id_prefix || event.slug || 'event').replace(/[^A-Za-z0-9._-]+/g, '')
    exportCsv(
      `makeyourpass-registrants-${code}.csv`,
      ['name', 'email', 'age', 'semester', 'department', 'code', 'status', 'payment_state', 'created_at', 'event title'],
      filtered.map((r) => [
        r.respondent_name,
        r.respondent_email,
        r.age ?? '',
        r.semester ?? '',
        r.department ?? '',
        r.unique_code || '',
        r.status,
        paymentStateOf(r, paidEvent),
        r.submitted_at,
        event.title,
      ])
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-5"
      style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '5px 5px 0 #14110E' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-extrabold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
            <Users className="h-5 w-5" strokeWidth={2.5} /> Registrants
          </h3>
          <p className="text-xs font-semibold mt-1" style={{ color: MUTED }}>
            {event.title}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onExport} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="zine-sticker" style={{ background: '#FFD23F' }}>{stats.total} registered</span>
        {paidEvent && (
          <>
            <span className="zine-sticker" style={{ background: '#FFB3A6' }}>{stats.unverified} to verify</span>
            <span className="zine-sticker" style={{ background: '#7CE3B3' }}>{stats.verified} verified</span>
          </>
        )}
        {stats.waitlisted > 0 && (
          <span className="zine-sticker" style={{ background: '#FFF6D6' }}>{stats.waitlisted} waitlisted</span>
        )}
        {event.id_prefix && (
          <span className="zine-sticker" style={{ background: '#fff' }}>codes {event.id_prefix}-####</span>
        )}
      </div>

      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: FAINT }} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email or code"
          className="pl-9"
        />
      </div>

      {proofsNote && (
        <p className="mb-3 text-[11px] font-bold" style={{ color: MUTED }} role="status">
          {proofsNote}
        </p>
      )}
      {loadErr && (
        <p className="mb-3 text-[11px] font-bold" style={{ color: ERR }} role="alert">
          {loadErr}
        </p>
      )}

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <div className="h-6 w-6 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : responses.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold" style={{ color: MUTED }}>
          No registrations yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold" style={{ color: MUTED }}>
          No matches for “{query.trim()}”
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: 860 }}>
            <thead>
              <tr style={{ background: '#F4EFE1', borderBottom: `2px solid ${INK}` }}>
                {['Registrant', 'Code', 'Ticket', 'Payment', 'Waitlist', 'Proof', 'Registered', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap"
                    style={{ fontFamily: 'Syne, sans-serif', color: MUTED }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {filtered.map((r) => {
                const proof = proofs[r.id] || null
                const msg = rowMsgs[r.id]
                const state = paymentStateOf(r, paidEvent)
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2 min-w-[180px]">
                      <p className="text-sm font-bold" style={{ color: INK }}>{r.respondent_name}</p>
                      <p className="text-[11px] font-semibold" style={{ color: MUTED }}>{r.respondent_email}</p>
                      {(r.age || r.semester || r.department) && (
                        <p className="text-[11px] font-semibold" style={{ color: MUTED }}>
                          {[r.age ? `${r.age} yrs` : '', r.semester || '', r.department || ''].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm font-extrabold whitespace-nowrap" style={{ color: INK }}>
                      {r.unique_code || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.email_sent_at ? (
                        <Badge variant="success">sent</Badge>
                      ) : r.ticket_url ? (
                        <Badge variant="primary">ready</Badge>
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: FAINT }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {state === 'paid_verified' && <Badge variant="success">paid_verified ✓</Badge>}
                      {state === 'paid_unverified' && <Badge variant="error">paid_unverified ✗</Badge>}
                      {state === 'rejected' && <Badge variant="error">rejected</Badge>}
                      {state === 'na' && <span className="text-xs font-semibold" style={{ color: FAINT }}>{paidEvent ? '—' : 'free'}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status === 'waitlisted' && <Badge variant="warning">waitlisted</Badge>}
                      {r.status === 'confirmed' && <Badge variant="outline">confirmed</Badge>}
                      {r.status === 'cancelled' && <Badge variant="error">cancelled</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <ProofThumb entry={proof} />
                    </td>
                    <td className="px-3 py-2 text-[11px] font-semibold whitespace-nowrap" style={{ color: MUTED }}>
                      {new Date(r.submitted_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 min-w-[150px]">
                      {paidEvent ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-1">
                            <Button
                              variant="success"
                              size="sm"
                              loading={busyId === r.id}
                              disabled={busyId !== null || r.payment_status === 'verified'}
                              onClick={() => void decidePayment(r, false)}
                            >
                              Verify
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId !== null || r.payment_status === 'rejected'}
                              onClick={() => void decidePayment(r, true)}
                            >
                              Reject
                            </Button>
                          </div>
                          {msg && (
                            <p className="text-[11px] font-bold" style={{ color: msg.ok ? OK : ERR }} role="status">
                              {msg.text}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold" style={{ color: FAINT }}>free</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[10px] font-semibold" style={{ color: MUTED }}>
        Live — the table refreshes as registrations arrive. CSV opens in Excel / Google Sheets.
      </p>
    </motion.div>
  )
}
