// ============================================================
// TicketSuccess — step 3 terminal state of the paid-event flow
// ============================================================
// Animated reveal of the generated ticket:
//   • ticket preview image (short-lived signed URL from /api/payments status)
//   • the club's post_register_message (default copy when missing)
//   • prominent WhatsApp group button when events.whatsapp_group_url exists
//   • check-your-email copy
//   • PNG + PDF downloads (PDF built by src/lib/pdfTicket.ts, no deps)
// ============================================================

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle, Download, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { downloadTicketPdf, downloadTicketPng } from '@/lib/pdfTicket'

const FALLBACK_MESSAGE = "Thank you for registering! We'll email you the details."

export interface TicketSuccessProps {
  uniqueCode: string
  /** Short-lived signed URL of the generated ticket image; '' shows a placeholder. */
  ticketImageUrl: string | null
  eventName: string
  attendeeName: string
  email: string
  /** clubs.post_register_message from the server; falls back to default copy. */
  message: string
  /** events.whatsapp_group_url — omitted when the club hasn't set one. */
  whatsappUrl: string | null
}

export function TicketSuccess({
  uniqueCode,
  ticketImageUrl,
  eventName,
  attendeeName,
  email,
  message,
  whatsappUrl,
}: TicketSuccessProps) {
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null)
  const [downloadError, setDownloadError] = useState('')

  async function runDownload(kind: 'png' | 'pdf') {
    const url = ticketImageUrl?.trim()
    if (!url || busy) return
    setBusy(kind)
    setDownloadError('')
    try {
      if (kind === 'png') await downloadTicketPng(url, uniqueCode)
      else await downloadTicketPdf(url, uniqueCode)
    } catch {
      setDownloadError(
        kind === 'pdf'
          ? 'Could not build the PDF — try again, or use the PNG download instead.'
          : 'Could not download the PNG — check your connection and try again.',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', duration: 0.6 }}
      className="glass-strong rounded-2xl p-8 sm:p-10 max-w-lg w-full text-center relative"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.15, duration: 0.5 }}
        className="h-20 w-20 rounded-2xl bg-success/20 flex items-center justify-center mx-auto mb-6"
      >
        <CheckCircle className="h-10 w-10 text-success" />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-bold text-[#14110E] mb-2"
      >
        Ticket secured! 🎉
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-text-secondary mb-6"
      >
        You're confirmed for <strong className="text-[#14110E]">{eventName}</strong>
        {attendeeName ? <> — see you there, {attendeeName.split(' ')[0]}!</> : '!'}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        {ticketImageUrl ? (
          <div className="rounded-xl border-2 border-[#14110E] bg-white p-2 shadow-[4px_4px_0_#14110E] inline-block max-w-full">
            <img
              src={ticketImageUrl}
              alt={`Ticket for ${eventName}`}
              className="w-full rounded-lg"
            />
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-border bg-surface p-6">
            <p className="text-sm text-text-muted">Ticket preview will appear in your email.</p>
            <p className="mt-1 text-lg font-extrabold text-[#14110E] tracking-widest select-all">
              {uniqueCode || 'YOUR-CODE'}
            </p>
          </div>
        )}
        <p className="mt-2 text-xs text-text-muted">
          Keep your code handy{uniqueCode ? <> — <span className="font-bold text-text-secondary">{uniqueCode}</span></> : null} — it identifies you at the venue.
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-6 text-text-secondary text-sm leading-relaxed"
      >
        {message.trim() || FALLBACK_MESSAGE}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }}
        className="mt-3 text-text-muted text-xs"
      >
        Check your inbox{email ? <> at <strong className="text-text-secondary">{email}</strong></> : null} — the same
        ticket is waiting there. If it isn't in your inbox, look in the spam folder.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-7 space-y-3"
      >
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noreferrer noopener" className="block sm:inline-block">
            <Button type="button" variant="success" size="lg" fullWidth>
              <MessageCircle className="h-5 w-5" />
              Join the event's WhatsApp group
            </Button>
          </a>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            loading={busy === 'png'}
            disabled={!ticketImageUrl || busy === 'pdf'}
            onClick={() => {
              void runDownload('png')
            }}
          >
            <Download className="h-4 w-4" />
            Download PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={busy === 'pdf'}
            disabled={!ticketImageUrl || busy === 'png'}
            onClick={() => {
              void runDownload('pdf')
            }}
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        {downloadError && (
          <p className="flex items-center justify-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {downloadError}
          </p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="mt-8"
      >
        <Link to="/">
          <Button type="button" variant="primary" size="lg">
            Back to Home
          </Button>
        </Link>
      </motion.div>
    </motion.div>
  )
}
