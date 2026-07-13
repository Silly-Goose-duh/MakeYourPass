import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { QrCode, CheckCircle2, AlertTriangle, XCircle, Search, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { HostRoute } from '@/components/auth/RouteGuards'
import { getEventById, admitByQrToken, type AdmitResult } from '@/lib/supabase'

type FlashKind = 'idle' | 'success' | 'warn' | 'error'
type Flash = { kind: FlashKind; message: string; name?: string; code?: string } | null

function ScanInner({ eventId }: { eventId: string }) {
  const [eventTitle, setEventTitle] = useState('')
  const [flash, setFlash] = useState<Flash>(null)
  const [manual, setManual] = useState('')
  const [camOn, setCamOn] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const regionRef = useRef<HTMLDivElement | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAdmit = useRef<{ token: string; t: number } | null>(null)

  useEffect(() => {
    let alive = true
    getEventById(eventId).then(({ data }) => { if (alive && data) setEventTitle(data.title) })
    return () => {
      alive = false
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
    }
  }, [eventId])

  const showFlash = useCallback((f: NonNullable<Flash>) => {
    setFlash(f)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2200)
  }, [])

  const applyResult = useCallback((r: AdmitResult) => {
    if (r.status === 'admitted') {
      showFlash({ kind: 'success', message: 'Admitted', name: r.name ?? undefined, code: r.unique_code ?? undefined })
    } else if (r.status === 'already_admitted') {
      showFlash({ kind: 'warn', message: `Already admitted (${r.unique_code ?? ''})`, name: r.name ?? undefined })
    } else if (r.status === 'waitlisted') {
      showFlash({ kind: 'warn', message: 'Waitlisted — not admitted', name: r.name ?? undefined })
    } else {
      showFlash({ kind: 'error', message: 'Not a valid ticket', name: r.name ?? undefined })
    }
  }, [showFlash])

  const handleResult = useCallback(async (token: string) => {
    const now = Date.now()
    if (lastAdmit.current && lastAdmit.current.token === token && now - lastAdmit.current.t < 1200) return
    lastAdmit.current = { token, t: now }
    try {
      const { data, error } = await admitByQrToken(token)
      if (error || !data) showFlash({ kind: 'error', message: 'Could not admit — try again' })
      else applyResult(data)
    } catch {
      showFlash({ kind: 'error', message: 'Network error — try again' })
    }
  }, [applyResult, showFlash])

  const startCamera = useCallback(async () => {
    if (!regionRef.current || scannerRef.current) return
    try {
      const scanner = new Html5Qrcode('scan-region')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded: string) => { void handleResult(decoded) },
        () => { /* ignore per-frame errors */ }
      )
      setCamOn(true)
    } catch {
      showFlash({ kind: 'error', message: 'Camera unavailable — use manual entry' })
    }
  }, [handleResult, showFlash])

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
    setCamOn(false)
  }, [])

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = manual.trim()
    if (!v) return
    void handleResult(v)
    setManual('')
  }

  const flashColor: Record<FlashKind, string> = {
    idle: 'border-primary/30',
    success: 'border-green-500 bg-green-500/10',
    warn: 'border-yellow-500 bg-yellow-500/10',
    error: 'border-red-500 bg-red-500/10',
  }
  const flashIcon = {
    success: <CheckCircle2 className="h-10 w-10 text-green-500" />,
    warn: <AlertTriangle className="h-10 w-10 text-yellow-500" />,
    error: <XCircle className="h-10 w-10 text-red-500" />,
    idle: <QrCode className="h-10 w-10 text-primary" />,
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 sm:px-6 pt-20 pb-16 max-w-lg mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-text-muted text-sm mb-4 hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-text-primary mb-1">Scan to Admit</h1>
        <p className="text-text-muted text-sm mb-6">{eventTitle || 'Loading event…'}</p>

        <Card className={`p-4 mb-4 border-2 transition-colors ${flashColor[flash?.kind || 'idle']}`}>
          <div className="flex items-center gap-4">
            <div className="shrink-0">{flashIcon[flash?.kind || 'idle']}</div>
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">
                {flash?.message || (camOn ? 'Point camera at ticket QR' : 'Camera off / manual entry')}
              </p>
              {flash?.name && <p className="text-sm text-text-muted truncate">{flash.name}</p>}
              {flash?.code && <p className="text-xs font-mono text-text-muted">{flash.code}</p>}
            </div>
          </div>
        </Card>

        <div className="rounded-xl overflow-hidden border border-white/10 bg-black mb-4">
          <div id="scan-region" ref={regionRef} className="w-full aspect-square" />
        </div>

        {!camOn ? (
          <Button variant="primary" className="w-full mb-4" onClick={startCamera}>
            <QrCode className="h-4 w-4 mr-2" /> Start Camera
          </Button>
        ) : (
          <Button variant="ghost" className="w-full mb-4" onClick={stopCamera}>
            Stop Camera
          </Button>
        )}

        <Card className="p-4">
          <p className="text-sm text-text-muted mb-3 flex items-center gap-2">
            <Search className="h-4 w-4" /> Manual lookup (name / code / token)
          </p>
          <form onSubmit={onManualSubmit} className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Paste unique code or scan token"
              className="flex-1"
            />
            <Button type="submit" variant="primary">Admit</Button>
          </form>
        </Card>
      </div>
    </div>
  )
}

export function ScanPage() {
  const { eventId } = useParams<{ eventId: string }>()
  if (!eventId) return <div className="min-h-screen bg-background" />
  return (
    <HostRoute eventId={eventId}>
      <ScanInner eventId={eventId} />
    </HostRoute>
  )
}
