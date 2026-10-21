// ============================================================
// PaymentPanel — step 2 of the paid-event flow
// ============================================================
// Shows the server-truth amount, a generated UPI QR (with a
// "open UPI app" intent button), copy-to-clipboard for the VPA,
// and uploads the payment screenshot straight into the
// `payment-proofs` storage bucket via the anon client.
//
// "Register" posts { action: 'confirm', registration_id, code }
// to /api/payments and then polls action=status every 2s (max
// ~3 min) until ticket_state === 'generated'.
//
// Server contract (api/payments, migration 002):
//   POST /api/payments        { action:'confirm', registration_id, code }
//     200 → start polling     409 waitlisted → onWaitlisted()
//     409 duplicate-proof → duplicate error   5xx/network → retryable error
//   GET /api/payments?action=status&registration_id=…&code=…
//     → { ticket_state, unique_code?, ticket_image_url?, message? }
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { AlertCircle, CheckCircle, Clock, Copy, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_PROOF_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

const CONFIRM_TIMEOUT_MS = 20_000
const STATUS_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 2_000
const POLL_DEADLINE_MS = 3 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 4
const CODE_BOOT_ATTEMPTS = 15 // ~30s to learn the unique_code if the RPC reply didn't include one

const DUPLICATE_PROOF_MESSAGE =
  'This screenshot was already used for another registration. Please upload a different screenshot.'
const GENERIC_PAYMENTS_ERROR =
  'Something went wrong while confirming your payment. Please try again.'
const POLL_TIMEOUT_MESSAGE =
  'The club\u2019s server did not finish verifying in time. Your registration and screenshot are saved \u2014 press Register again to check once more.'
const REJECTED_PROOF_MESSAGE =
  'The club could not verify this screenshot. Upload a clearer one or contact the club.'

export interface PaymentStatusPayload {
  ticket_state?: string
  state?: string
  unique_code?: string
  code?: string
  ticket_image_url?: string
  image_url?: string
  signed_url?: string
  ticket_url?: string
  message?: string
  error?: string
}

export interface PaymentPanelProps {
  eventId: string
  registrationId: string
  /** unique_code from the first submit; '' while still unknown (panel polls the status endpoint for it). */
  initialCode: string
  /** Server truth (events.price) — never taken from any client input. */
  amount: number
  orgName: string
  /** The club's UPI VPA (organizations.upi_id); '' when the club has no UPI setup yet. */
  upiVpa: string
  upiPhone?: string
  /** Optional club-uploaded QR image, shown when the VPA is missing. */
  orgQrUrl: string | null
  /** When the seat hold lapses (ms epoch); 0 disables the countdown. */
  holdExpiresAt: number
  onExpired: () => void
  onWaitlisted: () => void
  onConfirmed: (info: { ticketImageUrl: string; uniqueCode: string }) => void
}

type UploadPhase = 'idle' | 'uploading' | 'done' | 'error'
type ConfirmPhase = 'idle' | 'confirming' | 'polling'
type FailureVerdict = 'generated' | 'waitlisted' | 'duplicate' | 'generic'

/** Parse an opaque payments-API JSON body into a typed, tolerant shape. */
function readPaymentStatus(raw: Record<string, unknown>): PaymentStatusPayload {
  const pick = (key: string): string | undefined => {
    const value = raw[key]
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }
  return {
    ticket_state: pick('ticket_state'),
    state: pick('state'),
    unique_code: pick('unique_code'),
    code: pick('code'),
    ticket_image_url: pick('ticket_image_url'),
    image_url: pick('image_url'),
    signed_url: pick('signed_url'),
    ticket_url: pick('ticket_url'),
    message: pick('message'),
    error: pick('error'),
  }
}

function pickCode(p: PaymentStatusPayload): string {
  return (p.unique_code || p.code || '').trim()
}

function pickImageUrl(p: PaymentStatusPayload): string {
  return p.ticket_image_url || p.image_url || p.signed_url || p.ticket_url || ''
}

function payloadState(p: PaymentStatusPayload): string {
  return (p.ticket_state || p.state || '').toLowerCase()
}

/** Maps a non-OK confirm/status response onto the flow's error states. */
function classifyFailure(status: number, payload: PaymentStatusPayload): FailureVerdict {
  const raw = `${payload.ticket_state ?? ''} ${payload.state ?? ''} ${payload.error ?? ''} ${payload.message ?? ''}`.toLowerCase()
  // A re-confirmed registration is not a duplicate — treat these phrases as a success-ish verdict.
  if (
    payloadState(payload) === 'generated' ||
    raw.includes('already confirmed') ||
    raw.includes('already verified') ||
    raw.includes('already submitted') ||
    raw.includes('already generated')
  ) {
    return 'generated'
  }
  const saysWaitlisted =
    raw.includes('waitlist') || raw.includes('waiting list') || (raw.includes('seats') && raw.includes('full'))
  const saysDuplicate =
    raw.includes('duplicate') ||
    raw.includes('already used') ||
    raw.includes('already been used') ||
    raw.includes('already claimed')
  if (saysWaitlisted) return 'waitlisted'
  // 409 with no recognisable wording means the screenshot was claimed before.
  if (status === 409 || saysDuplicate) return 'duplicate'
  return 'generic'
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await res.json()
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function statusUrl(registrationId: string, code: string): string {
  const query = new URLSearchParams({ action: 'status', registration_id: registrationId })
  if (code) query.set('code', code)
  return `${API_BASE}/api/payments?${query.toString()}`
}

function formatInr(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  const hasPaise = Math.round(n * 100) % 100 !== 0
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

function formatHoldLeft(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PaymentPanel({
  eventId,
  registrationId,
  initialCode,
  amount,
  orgName,
  upiVpa,
  upiPhone,
  orgQrUrl,
  holdExpiresAt,
  onExpired,
  onWaitlisted,
  onConfirmed,
}: PaymentPanelProps) {
  // Registration code — boot-polled from the payments status endpoint when the first
  // submit reply does not carry unique_code.
  const [polledCode, setPolledCode] = useState('')
  const code = initialCode || polledCode
  const [codeFailed, setCodeFailed] = useState(false)
  const [bootNonce, setBootNonce] = useState(0)

  const [copied, setCopied] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [proofPath, setProofPath] = useState('')
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [uploadError, setUploadError] = useState('')

  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('idle')
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [pollSeq, setPollSeq] = useState(0)
  const [nowMs, setNowMs] = useState(0)

  // Alive flag + latest-callbacks ref so async loops never setState/touch callbacks
  // after this panel unmounts (router flip or parent-driven hold expiry).
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const callbacksRef = useRef({ onConfirmed, onWaitlisted, onExpired })
  useEffect(() => {
    callbacksRef.current = { onConfirmed, onWaitlisted, onExpired }
  })

  // `code` is derived: parent-prop `initialCode` wins, else boot-polled value.

  // 1-second tick feeds the seat-hold countdown. (nowMs starts at 0 — Date.now()
  // in a useState initializer would be an impure call during render.)
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])
  const msLeft = holdExpiresAt > 0 && nowMs > 0 ? Math.max(0, holdExpiresAt - nowMs) : null
  const holdFiredRef = useRef(false)
  useEffect(() => {
    if (msLeft !== null && msLeft <= 0 && !holdFiredRef.current) {
      holdFiredRef.current = true
      callbacksRef.current.onExpired()
    }
  }, [msLeft])

  // Boot: learn the registration's unique_code by polling the payments status
  // endpoint (used when the first submit reply does not include it).
  useEffect(() => {
    if (code || codeFailed || !registrationId) return
    let cancelled = false
    void (async () => {
      for (let attempt = 0; attempt < CODE_BOOT_ATTEMPTS; attempt++) {
        if (cancelled) return
        try {
          const res = await fetchWithTimeout(statusUrl(registrationId, ''), {}, STATUS_TIMEOUT_MS)
          const payload = readPaymentStatus(await readJson(res))
          if (res.ok) {
            // The row can already be terminal when the panel mounts (the
            // capacity-gated hold landed waitlisted, or the hold was voided/
            // expired) — route it instead of dead-ending on a payment UI
            // whose proof upload could never succeed.
            const bootState = payloadState(payload)
            if (bootState === 'waitlisted') {
              if (cancelled) return
              callbacksRef.current.onWaitlisted()
              return
            }
            if (bootState === 'cancelled' || bootState === 'rejected') {
              if (cancelled) return
              callbacksRef.current.onExpired()
              return
            }
            const found = pickCode(payload)
            if (found) {
              setPolledCode(found)
              return
            }
          }
        } catch {
          // Transient network issue — keep polling until attempts run out.
        }
        await delay(POLL_INTERVAL_MS)
      }
      if (!cancelled) setCodeFailed(true)
    })()
    return () => {
      cancelled = true
    }
  }, [code, codeFailed, registrationId, bootNonce])

  // Post-confirm polling: GET status every 2s until the ticket_state turns
  // terminal ('generated') or the ~3-minute budget runs out.
  useEffect(() => {
    if (pollSeq === 0) return
    let cancelled = false
    let finished = false
    let consecutiveFailures = 0
    const deadline = Date.now() + POLL_DEADLINE_MS

    const stop = () => {
      if (finished) return
      finished = true
      setConfirmPhase('idle')
      setPollSeq(0)
    }
    const finishGenerated = (payload: PaymentStatusPayload) => {
      if (finished) return
      finished = true
      callbacksRef.current.onConfirmed({
        ticketImageUrl: pickImageUrl(payload),
        uniqueCode: pickCode(payload) || code,
      })
    }

    void (async () => {
      while (!cancelled) {
        if (Date.now() > deadline) {
          if (!cancelled) {
            stop()
            setConfirmError(POLL_TIMEOUT_MESSAGE)
          }
          return
        }
        try {
          const res = await fetchWithTimeout(statusUrl(registrationId, code), {}, STATUS_TIMEOUT_MS)
          const payload = readPaymentStatus(await readJson(res))
          if (cancelled) return
          if (!res.ok) {
            consecutiveFailures++
            if (res.status >= 400 && res.status < 500 && res.status !== 429) {
              const kind = classifyFailure(res.status, payload)
              if (kind === 'generated') {
                finishGenerated(payload)
                return
              }
              if (kind === 'waitlisted') {
                callbacksRef.current.onWaitlisted()
                return
              }
              stop()
              setConfirmError(kind === 'duplicate' ? payload.message || DUPLICATE_PROOF_MESSAGE : payload.error || GENERIC_PAYMENTS_ERROR)
              return
            }
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              stop()
              setConfirmError(GENERIC_PAYMENTS_ERROR)
              return
            }
          } else {
            consecutiveFailures = 0
            const state = payloadState(payload)
            const raw = `${payload.ticket_state ?? ''} ${payload.state ?? ''} ${payload.error ?? ''} ${payload.message ?? ''}`.toLowerCase()
            if (
              state === 'generated' ||
              raw.includes('already confirmed') ||
              raw.includes('already verified') ||
              raw.includes('already submitted') ||
              raw.includes('already generated')
            ) {
              finishGenerated(payload)
              return
            }
            if (state === 'waitlisted') {
              callbacksRef.current.onWaitlisted()
              return
            }
            if (state === 'cancelled' || state === 'expired') {
              callbacksRef.current.onExpired()
              return
            }
            if (state === 'duplicate_proof' || state === 'duplicate') {
              stop()
              setConfirmError(payload.message || DUPLICATE_PROOF_MESSAGE)
              return
            }
            if (state === 'rejected') {
              stop()
              setConfirmError(payload.message || REJECTED_PROOF_MESSAGE)
              return
            }
            // pending / verifying / collectable — keep waiting
          }
        } catch {
          consecutiveFailures++
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            if (!cancelled) {
              stop()
              setConfirmError(GENERIC_PAYMENTS_ERROR)
            }
            return
          }
        }
        await delay(POLL_INTERVAL_MS)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pollSeq, code, registrationId])

  const hasVpa = upiVpa.trim() !== ''
  const amountForIntent = (Number.isFinite(amount) ? Math.max(0, amount) : 0).toFixed(2)
  const upiLink =
    hasVpa && code
      ? `upi://pay?pa=${encodeURIComponent(upiVpa.trim())}&pn=${encodeURIComponent(orgName || 'MakeYourPass')}&am=${encodeURIComponent(amountForIntent)}&tr=${encodeURIComponent(`MYP-${code}`)}&cu=INR`
      : ''

  async function copyVpa() {
    const vpa = upiVpa.trim()
    if (!vpa) return
    try {
      await navigator.clipboard.writeText(vpa)
      setCopied(true)
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  async function handleFileSelected(file: File | null) {
    if (!file) return
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofPreview(null)
    setProofPath('')
    setUploadError('')

    if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
      setProofFile(null)
      setUploadPhase('error')
      setUploadError('Only PNG, JPG or WEBP screenshots are accepted.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setProofFile(null)
      setUploadPhase('error')
      setUploadError('That file is over the 8 MB limit — try a smaller screenshot.')
      return
    }

    setProofFile(file)
    setProofPreview(URL.createObjectURL(file))
    setUploadPhase('uploading')

    const ext = EXT_BY_TYPE[file.type] ?? 'png'
    const path = `${eventId}/${registrationId}/proof-${Date.now()}.${ext}`
    try {
      const upload = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { cacheControl: '3600', contentType: file.type || 'application/octet-stream' })
      if (!aliveRef.current) return
      if (upload.error || !upload.data) {
        setUploadPhase('error')
        const raw = (upload.error instanceof Error ? upload.error.message : String(upload.error || '')).toLowerCase()
        let message = 'Upload failed \u2014 check your connection and try again.'
        if (raw.includes('size') || raw.includes('maximum')) {
          message = 'The club\u2019s storage refused this file (it may be too large). Try a smaller screenshot or a JPG.'
        } else if (raw.includes('row-level security') || raw.includes('violates')) {
          // Storage policy denial = no live hold behind this registration.
          message = 'This registration isn\u2019t on an active payment hold, so the proof was rejected. Go back and start the payment step again.'
        }
        setUploadError(message)
        return
      }
      const data = upload.data as { path?: unknown }
      const fullPath = typeof data.path === 'string' && data.path ? data.path : path
      setProofPath(fullPath)
      setUploadPhase('done')
    } catch {
      if (!aliveRef.current) return
      setUploadPhase('error')
      setUploadError('Upload failed \u2014 check your connection and try again.')
    }
  }

  async function confirmRegistration() {
    if (!code || !proofPath || confirmPhase !== 'idle') return
    setConfirmError(null)
    setConfirmPhase('confirming')
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/payments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm', registration_id: registrationId, code }),
        },
        CONFIRM_TIMEOUT_MS,
      )
      const payload = readPaymentStatus(await readJson(res))
      if (!aliveRef.current) return
      if (res.ok) {
        setConfirmPhase('polling')
        setPollSeq((seq) => seq + 1)
        return
      }
      const kind = classifyFailure(res.status, payload)
      if (kind === 'generated') {
        setConfirmPhase('polling')
        setPollSeq((seq) => seq + 1)
        return
      }
      if (kind === 'waitlisted') {
        callbacksRef.current.onWaitlisted()
        return
      }
      if (kind === 'duplicate') {
        setConfirmPhase('idle')
        setConfirmError(payload.message || DUPLICATE_PROOF_MESSAGE)
        return
      }
      setConfirmPhase('idle')
      setConfirmError(payload.error || payload.message || GENERIC_PAYMENTS_ERROR)
    } catch {
      if (!aliveRef.current) return
      setConfirmPhase('idle')
      setConfirmError(GENERIC_PAYMENTS_ERROR)
    }
  }

  const holdRow = msLeft !== null && msLeft > 0
  const holdUrgent = (msLeft ?? Number.POSITIVE_INFINITY) < 60_000

  // ── Boot state: the registration code hasn't surfaced yet ──
  if (!code) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-strong rounded-2xl p-8 text-center"
      >
        {codeFailed ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-[#14110E]">
              We couldn’t confirm your registration code yet.
            </p>
            <p className="text-sm text-text-secondary">
              Your seat hold is still running (see the timer below if it appears). Give it another try.
            </p>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setCodeFailed(false)
                setBootNonce((n) => n + 1)
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary">Reserving your seat…</p>
          </div>
        )}
        {holdRow && (
          <p className={cn('mt-2 flex items-center justify-center gap-2 text-sm font-semibold', holdUrgent ? 'text-red-500' : 'text-text-secondary')}>
            <Clock className="h-4 w-4" />
            Hold expires in {formatHoldLeft(msLeft)}
          </p>
        )}
      </motion.section>
    )
  }

  // ── Main payment UI ──
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 }}
      className="glass-strong rounded-2xl p-8 sm:p-10 space-y-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-[#14110E]">Pay {formatInr(amount)} via UPI</h2>
        <p className="text-sm text-text-secondary mt-1">
          Ticket is issued only after the club verifies your screenshot. Registration code:{' '}
          <strong className="text-text-primary select-all">{code}</strong>
        </p>
        {holdRow && (
          <p className={cn('mt-2 flex items-center gap-2 text-sm font-semibold', holdUrgent ? 'text-red-500' : 'text-text-secondary')}>
            <Clock className="h-4 w-4" />
            Hold expires in {formatHoldLeft(msLeft)}
          </p>
        )}
      </div>

      {!hasVpa ? (
        <div className="rounded-xl border border-border bg-surface/80 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#14110E]">This club hasn't finished UPI setup</p>
            {orgQrUrl ? (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  No UPI ID is on file, but the club uploaded its own QR. Pay using it (make sure the amount is{' '}
                  {formatInr(amount)}), then upload your proof below.
                </p>
                <img
                  src={orgQrUrl}
                  alt="Club UPI QR"
                  className="mt-3 h-40 w-40 rounded-lg border border-border bg-white object-contain"
                />
              </>
            ) : (
              <p className="mt-1 text-sm text-text-secondary">
                No UPI ID is on file yet. If the club shared other payment details (bank transfer, manual UPI), pay
                them directly and upload your proof below — otherwise check back once the club finishes setup.
              </p>
            )}
          </div>
        </div>
      ) : (
        upiLink && (
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <figure className="shrink-0">
              <div className="rounded-xl border-2 border-[#14110E] bg-white p-3 shadow-[4px_4px_0_#14110E]">
                <QRCodeSVG value={upiLink} size={208} bgColor="#FFFFFF" fgColor="#14110E" level="M" />
              </div>
              <figcaption className="mt-2 text-xs text-text-muted text-center">Scan with any UPI app</figcaption>
            </figure>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Amount (set by the club)</p>
                <p className="text-3xl font-extrabold text-[#14110E]">{formatInr(amount)}</p>
              </div>
              <p className="text-sm flex flex-wrap items-center gap-2">
                <span className="text-text-muted">UPI ID:</span>
                <strong className="text-text-primary select-all break-all">{upiVpa}</strong>
                <button
                  type="button"
                  onClick={copyVpa}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-surface text-xs font-semibold text-text-secondary hover:bg-primary/5 transition"
                >
                  {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </p>
              {upiPhone && (
                <p className="text-sm">
                  <span className="text-text-muted">UPI phone: </span>
                  <strong className="text-text-primary">{upiPhone}</strong>
                </p>
              )}
              <p className="text-xs text-text-muted break-all">Payment reference: MYP-{code}</p>
              <div>
                <a href={upiLink}>
                  <Button type="button" variant="primary" size="lg">
                    Open UPI app
                  </Button>
                </a>
              </div>
            </div>
          </div>
        )
      )}

      {/* Proof upload */}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-2">
          Payment screenshot <span className="text-red-500">*</span>
        </label>
        <label
          className={cn(
            'flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition',
            uploadPhase === 'error' ? 'border-red-500 bg-red-500/5' : 'border-border hover:border-primary/40 bg-surface',
          )}
        >
          <Upload className="h-6 w-6 text-text-muted" />
          <span className="text-sm text-text-secondary text-center">
            {uploadPhase === 'uploading'
              ? 'Uploading screenshot\u2026'
              : uploadPhase === 'done' && proofFile
                ? `${proofFile.name} \u2014 uploaded`
                : 'Tap to upload (PNG, JPG or WEBP \u00B7 up to 8 MB)'}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void handleFileSelected(e.target.files?.[0] ?? null)
            }}
          />
        </label>
        {uploadPhase === 'uploading' && (
          <p className="mt-2 flex items-center gap-2 text-xs text-text-muted">
            <span className="h-3.5 w-3.5 border-2 border-text-muted border-t-transparent rounded-full animate-spin inline-block" />
            Sending your screenshot to storage…
          </p>
        )}
        {proofPreview && uploadPhase !== 'error' && (
          <img src={proofPreview} alt="Payment screenshot preview" className="mt-3 max-h-48 rounded-lg border border-border" />
        )}
        {uploadPhase === 'done' && <p className="mt-1.5 text-sm text-success">Screenshot received.</p>}
        {uploadError && <p className="mt-1.5 text-sm text-red-400">{uploadError}</p>}
      </div>

      {confirmError && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {confirmError}
        </div>
      )}

      {confirmPhase === 'polling' && (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
          Verifying with the club — this can take up to three minutes. Keep this page open.
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        size="lg"
        fullWidth
        loading={confirmPhase !== 'idle'}
        disabled={!proofPath}
        style={{ background: 'var(--event-accent, #FF4D2E)', borderColor: '#14110E' }}
        onClick={() => {
          void confirmRegistration()
        }}
      >
        Register
      </Button>
      <p className="-mt-3 text-xs text-text-muted text-center">Registering finishes your entry; ticket follows once verified.</p>
    </motion.section>
  )
}
