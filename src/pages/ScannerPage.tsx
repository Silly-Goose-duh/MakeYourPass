import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, X, ArrowLeft, User, Calendar, MapPin, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { formatDateTime } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Ticket, Event } from '@/types'

export function ScannerPage() {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [scannerStarted, setScannerStarted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  async function startScanner() {
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setScannerStarted(true)
      
      // Simple polling approach: read QR via html5-qrcode library
      // For now, show manual entry option
    } catch {
      setScanning(false)
      setLookupError('Camera access denied. Use manual entry instead.')
    }
  }

  function stopScanner() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setScanning(false)
    setScannerStarted(false)
  }

  async function lookupTicket(qrCode: string) {
    if (!qrCode.trim()) return
    setLookingUp(true)
    setLookupError('')
    setCheckedIn(false)
    setTicket(null)
    setEvent(null)

    const { data: t } = await supabase
      .from('tickets')
      .select('*')
      .eq('qr_code', qrCode.trim())
      .single()

    if (!t) {
      setLookupError('Ticket not found. Invalid QR code.')
      setLookingUp(false)
      return
    }

    setTicket(t as Ticket)

    // Load event info
    const { data: ev } = await supabase
      .from('events')
      .select('title, start_date, start_time, venue_name, city')
      .eq('id', t.event_id)
      .single()

    if (ev) setEvent(ev as Event)

    if (t.status === 'used') {
      setCheckedIn(true)
    }

    setLookingUp(false)
    setManualCode('')
    stopScanner()
  }

  async function handleCheckIn() {
    if (!ticket) return
    setCheckingIn(true)

    const { data: { user } } = await supabase.auth.getUser()

    // Create check-in record
    const { error: ciError } = await supabase
      .from('check_ins')
      .insert({
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        checked_in_by: user?.id || '00000000-0000-0000-0000-000000000000',
        method: 'scan',
      })

    if (ciError) { setLookupError(ciError.message); setCheckingIn(false); return }

    // Update ticket
    await supabase
      .from('tickets')
      .update({
        status: 'used',
        checked_in_at: new Date().toISOString(),
        checked_in_by: user?.id || null,
      })
      .eq('id', ticket.id)

    setCheckedIn(true)
    setCheckingIn(false)
  }

  function reset() {
    setTicket(null)
    setEvent(null)
    setCheckedIn(false)
    setLookupError('')
    setManualCode('')
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-2xl mx-auto px-6">
      <button
        onClick={() => navigate('/dashboard/attendees')}
        className="inline-flex items-center gap-2 text-text-secondary hover:text-primary transition-colors mb-4 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Attendees
      </button>

      <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Scan Tickets</h1>
      <p className="text-text-secondary text-sm mb-6">Scan attendee QR codes for fast check-in</p>

      {/* Camera scanner */}
      {!scannerStarted && !ticket && (
        <Card variant="glass" padding="lg" className="mb-4">
          <CardContent>
            <div className="text-center py-6">
              <div className="h-20 w-20 rounded-3xl bg-primary-muted mx-auto mb-4 flex items-center justify-center">
                <Camera className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Start Scanning</h3>
              <p className="text-text-secondary text-sm mb-6">
                Point your camera at an attendee's QR code
              </p>
              <Button variant="gradient" glow onClick={startScanner} disabled={scanning}>
                <Camera className="h-4 w-4" />
                Open Camera
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Camera view */}
      {scannerStarted && !ticket && (
        <Card variant="glass" padding="none" className="mb-4 overflow-hidden">
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-64 object-cover bg-black"
            />
            <div className="absolute inset-0 border-2 border-primary/50 rounded-2xl pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 border-2 border-primary/80 rounded-xl" />
            </div>
            <button
              onClick={stopScanner}
              className="absolute top-2 right-2 p-2 bg-black/60 rounded-lg text-white hover:bg-black/80 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/60 bg-black/40 px-3 py-1 rounded-full">
              Point at QR code
            </p>
          </div>
        </Card>
      )}

      {/* Manual entry */}
      {!ticket && (
        <Card variant="glass" padding="md">
          <CardContent>
            <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Manual Entry
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter QR code or ticket ID"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupTicket(manualCode)}
              />
              <Button
                variant="primary"
                onClick={() => lookupTicket(manualCode)}
                loading={lookingUp}
                disabled={!manualCode.trim() || lookingUp}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {lookupError && !ticket && (
              <p className="text-red-400 text-xs mt-2">{lookupError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ticket result */}
      {ticket && (
        <Card variant={checkedIn ? 'glass-primary' : 'glass'} glow={checkedIn ? 'primary' : 'none'} padding="lg">
          <CardContent className="text-center">
            {checkedIn ? (
              <>
                <div className="h-16 w-16 rounded-2xl bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">✓ Checked In</h2>
                <p className="text-text-secondary text-sm mb-6">
                  This attendee has been admitted
                </p>
              </>
            ) : (
              <>
                <div className="h-16 w-16 rounded-2xl bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
                  <User className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Valid Ticket</h2>
                <p className="text-text-secondary text-sm mb-6">
                  Ready to check in
                </p>
              </>
            )}

            {event && (
              <div className="text-left bg-white/[0.04] rounded-xl p-4 mb-4 space-y-1.5">
                <p className="text-white font-semibold">{event.title}</p>
                <p className="text-text-muted text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {event.start_date && formatDateTime(event.start_date)}
                </p>
                {event.venue_name && (
                  <p className="text-text-muted text-xs flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.venue_name}
                  </p>
                )}
              </div>
            )}

            <div className="text-left bg-white/[0.04] rounded-xl p-4 mb-6">
              <p className="text-xs text-text-muted mb-1">Attendee</p>
              <p className="text-white font-medium">{ticket.attendee_name || 'N/A'}</p>
              {ticket.attendee_email && (
                <p className="text-text-secondary text-sm">{ticket.attendee_email}</p>
              )}
              {checkedIn && ticket.checked_in_at && (
                <Badge variant="success" size="sm" className="mt-2">
                  Checked in at {new Date(ticket.checked_in_at).toLocaleTimeString()}
                </Badge>
              )}
            </div>

            {!checkedIn ? (
              <Button
                variant="gradient"
                size="lg"
                glow
                fullWidth
                onClick={handleCheckIn}
                loading={checkingIn}
              >
                <Check className="h-5 w-5" />
                Confirm Check-In
              </Button>
            ) : (
              <Button variant="primary" size="lg" fullWidth onClick={reset}>
                Scan Next Ticket
              </Button>
            )}

            {lookupError && (
              <p className="text-red-400 text-xs mt-3">{lookupError}</p>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
