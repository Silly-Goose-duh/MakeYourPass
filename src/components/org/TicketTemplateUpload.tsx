import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Image as ImageIcon, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase, updateEvent } from '@/lib/supabase'
import type { CampusEvent } from '@/types'

const INK = '#14110E'
const MUTED = '#4A4640'
const OK = '#0E8C5C'
const ERR = '#C2331F'
const TICKET_TEMPLATES_BUCKET = 'ticket-templates'
const MAX_PNG_BYTES = 4 * 1024 * 1024

/**
 * `events.ticket_template_path` comes from the payments migration and isn't in
 * the shared CampusEvent type yet — read it through this narrow extension.
 */
export type EventWithTemplatePath = CampusEvent & { ticket_template_path?: string | null }

/** Exact storage layout for the private ticket-templates bucket. */
const ticketTemplateStoragePath = (eventId: string): string => `${eventId}/ticket-template.png`

const STARTER_URL = '/assets/ticket-template-default.png'

/** Signed preview of the stored template (120 s). Keyed by path so switching
 *  templates refetches cleanly without any setState-inside-effect. */
function PreviewImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.storage
        .from(TICKET_TEMPLATES_BUCKET)
        .createSignedUrl(path, 120)
      if (!alive) return
      if (error || !data?.signedUrl) setFailed(true)
      else setUrl(data.signedUrl)
    })()
    return () => { alive = false }
  }, [path])

  if (failed) {
    return (
      <div
        className="h-28 w-full flex flex-col items-center justify-center gap-1 text-center px-2"
        style={{ background: '#F4EFE1', border: '2px dashed #14110E' }}
      >
        <ImageIcon className="h-5 w-5" style={{ color: MUTED }} />
        <p className="text-[10px] font-bold" style={{ color: MUTED }}>
          Stored but preview unavailable (bucket policy / signed URL)
        </p>
      </div>
    )
  }
  if (!url) {
    return (
      <div className="h-28 w-full flex items-center justify-center" style={{ background: '#F4EFE1', border: '2px dashed #14110E' }}>
        <div className="h-5 w-5 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt="Ticket template preview"
      className="h-28 w-full object-cover object-top"
      style={{ border: '2px solid #14110E', background: '#F4EFE1' }}
    />
  )
}

/**
 * "Ticket design" section of the org dashboard, per selected event.
 * Shows the current template (signed 120 s preview or default starter),
 * accepts a PNG ≤ 4 MB, uploads it to the private `ticket-templates` bucket at
 * `{event_id}/ticket-template.png` (upsert = replace), then records the path in
 * `events.ticket_template_path` via the same direct-events-update pattern the
 * dashboard already uses. Every failure stays inline — nothing is fire-and-forget.
 */
export function TicketTemplateUpload({
  event,
  onUpdated,
}: {
  event: CampusEvent
  onUpdated?: (e: CampusEvent) => void
}) {
  const [path, setPath] = useState<string | null>(() => (event as EventWithTemplatePath).ticket_template_path || null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = (f: File): string | null => {
    if (f.type !== 'image/png') return 'PNG only — the file must be an image/png (.png)'
    if (f.size === 0) return 'File is empty'
    if (f.size > MAX_PNG_BYTES) return 'PNG must be 4 MB or smaller'
    return null
  }

  const onPick = (picked: File | null) => {
    setFile(null)
    if (!picked) return
    const problem = validate(picked)
    if (problem) {
      setMsg({ ok: false, text: problem })
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setMsg({ ok: true, text: `Ready to upload: ${picked.name} (${Math.round(picked.size / 1024)} KB)` })
    setFile(picked)
  }

  const onUpload = async () => {
    if (!file || busy) return
    setBusy(true)
    setMsg(null)
    const storagePath = ticketTemplateStoragePath(event.id)
    try {
      // Replace whatever is stored at the canonical path (upsert).
      const { error: uploadError } = await supabase.storage
        .from(TICKET_TEMPLATES_BUCKET)
        .upload(storagePath, file, { upsert: true, contentType: 'image/png', cacheControl: '3600' })
      if (uploadError) throw uploadError

      // Record the path on the event row — same direct `events` update the
      // existing dashboard uses (no dedicated RPC exists for event edits).
      const { error: updateError } = await updateEvent(
        event.id,
        { ticket_template_path: storagePath } as unknown as Partial<CampusEvent>
      )
      if (updateError) {
        setMsg({
          ok: false,
          text:
            `Image saved to storage, but the event row could not be updated (${updateError.message}) — ` +
            'database update needed: apply the payments migration so org staff can UPDATE events.ticket_template_path. ' +
            `The file is safe at ${storagePath}; reviewing this event after the migration picks it up.`,
        })
        return
      }
      setPath(storagePath)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUpdated?.({ ...event, ticket_template_path: storagePath } as EventWithTemplatePath)
      setMsg({ ok: true, text: 'Ticket template updated — new registrations use it immediately.' })
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'Upload failed'
      setMsg({
        ok: false,
        text: `${detail} — check that the ticket-templates bucket exists and its storage policy allows org staff to insert/update.`,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-5"
      style={{ background: '#fff', border: '2.5px solid #14110E', boxShadow: '5px 5px 0 #14110E' }}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
            Ticket design
          </h3>
          <p className="text-xs font-semibold mt-1" style={{ color: MUTED }}>
            Template for {event.title} — name, unique code and QR are stamped into the safe zones.
          </p>
        </div>
        <span className="zine-sticker shrink-0" style={{ background: '#FFD23F' }}>
          PNG ≤ 4 MB
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-56 shrink-0">
          {path ? (
            <PreviewImg key={path} path={path} />
          ) : (
            <div
              className="h-28 w-full flex flex-col items-center justify-center gap-1 text-center px-2"
              style={{ background: '#F4EFE1', border: '2px dashed #14110E' }}
            >
              <ImageIcon className="h-5 w-5" style={{ color: MUTED }} />
              <p className="text-[10px] font-bold" style={{ color: MUTED }}>
                Using default template
              </p>
            </div>
          )}
          <p className="mt-1.5 text-[10px] font-semibold break-all" style={{ color: MUTED }}>
            {path ? path : 'no custom template stored yet'}
          </p>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <label className="block">
            <input
              ref={inputRef}
              type="file"
              accept="image/png"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              className="block w-full text-xs font-bold px-3 py-2 border-2 border-[#14110E] bg-white"
              style={{ color: INK, fontFamily: 'Space Grotesk, sans-serif' }}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => void onUpload()} disabled={!file || busy} loading={busy}>
              <Upload className="h-4 w-4" /> Upload template
            </Button>
            <a
              href={STARTER_URL}
              download="ticket-template-default.png"
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-1.5 text-sm font-extrabold border-2 border-[#14110E] bg-white shadow-[3px_3px_0_#14110E] hover:bg-[#FFF6D6]"
              style={{ color: INK }}
            >
              <Download className="h-4 w-4" /> Download starter
            </a>
          </div>

          {msg && (
            <p className="text-xs font-bold" style={{ color: msg.ok ? OK : ERR }} role="status">
              {msg.text}
            </p>
          )}

          <p className="text-[10px] font-semibold" style={{ color: MUTED }}>
            1000×350+ PNG recommended. Uploading replaces the previous template — tickets are
            regenerated with the new design from the next registration on.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
