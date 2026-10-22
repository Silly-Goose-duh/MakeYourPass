// ============================================================
// FreeTicketSuccess — terminal state of the FREE-event flow
// ============================================================
// A free registration's ticket PNG is generated server-side by the
// on-registration kick fired right after submit. This screen polls the
// public payments-status endpoint until the generated image is ready
// (that endpoint also self-heals a confirmed-but-ticketless row by
// re-kicking generation), then reuses TicketSuccess so free buyers get
// the identical on-screen ticket, PNG/PDF downloads, club message and
// WhatsApp button as paid buyers. Until the image lands — or if it never
// does — TicketSuccess renders the code-only placeholder card.
// ============================================================

import { useEffect, useState } from 'react'
import { TicketSuccess } from '@/components/event/TicketSuccess'

const POLL_MS = 1500
const POLL_TRIES = 10

interface FreeTicketSuccessProps {
  registrationId: string
  /** unique_code from the submit RPC, shown until the status poll lands. */
  fallbackCode: string
  eventName: string
  attendeeName: string
  email: string
  message: string
  whatsappUrl: string | null
  /** Fired when the status poll reveals the row is waitlisted, not confirmed. */
  onWaitlisted: () => void
}

interface TicketSnapshot {
  uniqueCode: string
  imageUrl: string
}

export function FreeTicketSuccess({
  registrationId,
  fallbackCode,
  eventName,
  attendeeName,
  email,
  message,
  whatsappUrl,
  onWaitlisted,
}: FreeTicketSuccessProps) {
  const [snapshot, setSnapshot] = useState<TicketSnapshot | null>(null)

  useEffect(() => {
    if (!registrationId) return
    let cancelled = false
    void (async () => {
      for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
        if (cancelled) return
        try {
          const apiBase = import.meta.env.VITE_API_BASE || ''
          const res = await fetch(
            `${apiBase}/api/payments?action=status&registration_id=${encodeURIComponent(registrationId)}`,
          )
          if (res.ok) {
            const payload = (await res.json()) as {
              unique_code?: unknown
              ticket_image_url?: unknown
              ticket_state?: unknown
              registration_status?: unknown
            }
            // Seats can vanish between submit and now — a full event leaves
            // the free row waitlisted with no ticket coming. Route them the
            // same way the paid flow does.
            if (
              String(payload.registration_status || '').toLowerCase() === 'waitlisted' ||
              String(payload.ticket_state || '').toLowerCase() === 'waitlisted'
            ) {
              if (cancelled) return
              onWaitlisted()
              return
            }
            const imageUrl =
              typeof payload.ticket_image_url === 'string' ? payload.ticket_image_url.trim() : ''
            if (imageUrl && String(payload.ticket_state || '').toLowerCase() === 'generated') {
              if (cancelled) return
              const code =
                typeof payload.unique_code === 'string' && payload.unique_code.trim()
                  ? payload.unique_code.trim()
                  : fallbackCode
              setSnapshot({ uniqueCode: code, imageUrl })
              return
            }
          }
        } catch {
          // Transient network error — keep polling until the budget runs out.
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [registrationId, fallbackCode, onWaitlisted])

  return (
    <TicketSuccess
      uniqueCode={snapshot?.uniqueCode || fallbackCode}
      ticketImageUrl={snapshot?.imageUrl ?? null}
      eventName={eventName}
      attendeeName={attendeeName}
      email={email}
      message={message}
      whatsappUrl={whatsappUrl}
    />
  )
}
