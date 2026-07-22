import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Plus, Settings, Calendar, MapPin, IndianRupee,
  Trash2, Upload, Users, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn, formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  getOrganizationBySlug,
  getPublishedEventsByOrg,
  getExecomMembers,
  getUserOrganizations,
  getProfile,
  updateOrganization,
  addExecomMember,
  deleteExecomMember,
  uploadOrgAsset,
  getOrgAssetPublicUrl,
  getEventsByOrganization,
} from '@/lib/supabase'
import type { Organization, CampusEvent, OrgExecomMember } from '@/types'

const RESERVED = new Set([
  'events', 'event', 'login', 'signup', 'dashboard', 'mc', 'host', 'api', 'assets', 'org', 'admin',
])

/** Discord-style members list grouped by role */
function ExecomSidebar({
  members,
  canManage,
  onAdd,
  onDelete,
}: {
  members: OrgExecomMember[]
  canManage: boolean
  onAdd: (m: { full_name: string; role_title: string; photo_url: string }, file?: File | null) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Member')
  const [photo, setPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  // photo file is passed via onAdd wrapper from parent through closure on Save

  const byRole = useMemo(() => {
    const map = new Map<string, OrgExecomMember[]>()
    for (const m of members) {
      const key = m.role_title || 'Member'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [members])

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onAdd(
        { full_name: name.trim(), role_title: role.trim() || 'Member', photo_url: '' },
        photo
      )
      setName('')
      setRole('Member')
      setPhoto(null)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside className="w-full lg:w-72 shrink-0 border-l border-border bg-[#1e1f22] text-[#dbdee1] flex flex-col min-h-[50vh] lg:min-h-screen lg:sticky lg:top-0">
      <div className="px-3 py-3 border-b border-white/5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#949ba4]">
          Execom — {members.length}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {byRole.length === 0 && (
          <p className="text-xs text-[#949ba4] px-2 py-4">No members listed yet.</p>
        )}
        {byRole.map(([roleTitle, list]) => (
          <div key={roleTitle}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4] px-2 mb-1">
              {roleTitle} — {list.length}
            </p>
            <ul className="space-y-0.5">
              {list.map((m) => (
                <li
                  key={m.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5"
                >
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-[#313338] shrink-0 flex items-center justify-center text-xs font-bold text-white">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (m.full_name[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#f2f3f5] truncate">{m.full_name}</p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void onDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-red-400 p-1"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {canManage && (
        <div className="p-3 border-t border-white/5">
          {!open ? (
            <Button variant="secondary" size="sm" fullWidth onClick={() => setOpen(true)}>
              <Users className="h-3.5 w-3.5" /> Add member
            </Button>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Role (e.g. Chairperson)" value={role} onChange={(e) => setRole(e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-[#949ba4] cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>{photo ? photo.name : 'Photo (optional)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                />
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => void handleAdd()} disabled={saving || !name.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

/** BookMyShow-style horizontal event rail */
function EventRail({
  title,
  events,
  past,
  canManage,
}: {
  title: string
  events: CampusEvent[]
  past?: boolean
  canManage?: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  if (events.length === 0) return null
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-lg sm:text-xl font-bold text-text-primary">{title}</h2>
        <span className="text-xs text-text-muted">{events.length}</span>
      </div>
      <div
        ref={scroller}
        className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-thin"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {events.map((ev) => (
          <article
            key={ev.id}
            className={cn(
              'snap-start shrink-0 w-[160px] sm:w-[200px] rounded-xl overflow-hidden border border-border bg-surface shadow-sm',
              past && 'opacity-75 grayscale-[0.4]'
            )}
          >
            <Link to={`/event/${ev.slug}`} className="block">
              <div className="aspect-[2/3] bg-surface-elevated relative">
                {ev.poster_url ? (
                  <img src={ev.poster_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent-rose/10 p-3 text-center">
                    <span className="text-xs font-semibold text-text-primary line-clamp-4">{ev.title}</span>
                  </div>
                )}
                {ev.payment_type === 'paid' && (
                  <span className="absolute top-2 left-2 text-[10px] font-bold bg-black/70 text-white px-1.5 py-0.5 rounded">
                    ₹{ev.price}
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <h3 className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">{ev.title}</h3>
                <p className="text-[11px] text-text-muted mt-1 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {ev.date ? formatDate(ev.date) : 'TBA'}
                </p>
                {ev.venue && (
                  <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {ev.venue}
                  </p>
                )}
              </div>
            </Link>
            {canManage && (
              <div className="flex border-t border-border">
                <Link to={`/host/${ev.id}/dashboard`} className="flex-1 text-center py-1.5 text-[10px] font-semibold text-primary hover:bg-primary/5">
                  Live
                </Link>
                <Link to={`/host/${ev.id}/scan`} className="flex-1 text-center py-1.5 text-[10px] font-semibold text-text-secondary hover:bg-surface-elevated border-l border-border">
                  Scan
                </Link>
                <Link to={`/dashboard/events/${ev.id}/edit`} className="flex-1 text-center py-1.5 text-[10px] font-semibold text-text-secondary hover:bg-surface-elevated border-l border-border">
                  Edit
                </Link>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export function OrgHome() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [org, setOrg] = useState<Organization | null>(null)
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [execom, setExecom] = useState<OrgExecomMember[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const slugInvalid = !orgSlug || RESERVED.has((orgSlug || '').toLowerCase())
  const [loading, setLoading] = useState(!slugInvalid)
  const [notFound, setNotFound] = useState(slugInvalid)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [upiId, setUpiId] = useState('')
  const [upiPhone, setUpiPhone] = useState('')
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    if (slugInvalid) return
    let alive = true
    ;(async () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      const { data: o } = await getOrganizationBySlug(orgSlug!)
      if (!alive) return
      if (!o || !o.is_approved) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setOrg(o)
      setUpiId(o.upi_id || '')
      setUpiPhone(o.upi_phone || '')

      const [{ data: pub }, { data: ex }] = await Promise.all([
        getPublishedEventsByOrg(o.id),
        getExecomMembers(o.id),
      ])
      if (!alive) return
      setEvents(pub || [])
      setExecom(ex || [])

      if (user) {
        const [{ data: prof }, { data: memberships }] = await Promise.all([
          getProfile(user.id),
          getUserOrganizations(),
        ])
        if (!alive) return
        const member = (memberships || []).some((m) => m.organization_id === o.id)
        setIsAdmin(!!prof?.is_superadmin || member)
        if (member || prof?.is_superadmin) {
          const { data: all } = await getEventsByOrganization(o.id, 'all')
          if (alive && all) setEvents(all)
        }
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [orgSlug, user, slugInvalid])

  const { upcoming, past, drafts } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const up: CampusEvent[] = []
    const pa: CampusEvent[] = []
    const dr: CampusEvent[] = []
    for (const e of events) {
      if (e.status === 'draft') { dr.push(e); continue }
      if (e.status !== 'published' && e.status !== 'cancelled') continue
      const d = e.date ? new Date(e.date + 'T00:00:00') : null
      if (d && d < today) pa.push(e)
      else up.push(e)
    }
    pa.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return { upcoming: up, past: pa, drafts: dr }
  }, [events])

  const handleAddExecomWithPhoto = async (m: { full_name: string; role_title: string; photo_url: string }, file?: File | null) => {
    if (!org) return
    let photo_url = m.photo_url || ''
    if (file) {
      const path = `org/${org.id}/execom/${Date.now()}-${file.name}`
      const { error: upErr } = await uploadOrgAsset(file, path)
      if (!upErr) photo_url = getOrgAssetPublicUrl(path)
    }
    const { data, error } = await addExecomMember({
      organization_id: org.id,
      full_name: m.full_name,
      role_title: m.role_title,
      photo_url,
      sort_order: execom.length,
    })
    if (!error && data) setExecom((prev) => [...prev, data])
  }

  const handleDeleteExecom = async (id: string) => {
    await deleteExecomMember(id)
    setExecom((prev) => prev.filter((x) => x.id !== id))
  }

  const saveUpiSettings = async () => {
    if (!org) return
    setSavingSettings(true)
    try {
      let upi_qr_url = org.upi_qr_url || ''
      if (upiQrFile) {
        const path = `org/${org.id}/upi-qr-${Date.now()}.png`
        const { error } = await uploadOrgAsset(upiQrFile, path)
        if (error) throw error
        upi_qr_url = getOrgAssetPublicUrl(path)
      }
      const { data, error } = await updateOrganization(org.id, {
        upi_id: upiId.trim(),
        upi_phone: upiPhone.trim(),
        upi_qr_url,
      })
      if (error) throw error
      if (data) setOrg(data)
      setSettingsOpen(false)
      setUpiQrFile(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Organization not found</h1>
          <p className="text-text-secondary mb-6">
            This portal is not live yet — it may be pending superadmin approval, or the link is wrong.
          </p>
          <Link to="/"><Button variant="primary">Back home</Button></Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Main column */}
      <div className="flex-1 min-w-0">
        {/* Cover / header */}
        <div className="relative">
          <div
            className="h-36 sm:h-48 bg-gradient-to-br from-primary/30 via-surface to-accent-rose/20"
            style={org.cover_url ? { backgroundImage: `url(${org.cover_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          />
          <div className="px-4 sm:px-8 -mt-10 sm:-mt-12 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-4 border-background bg-surface shadow-lg overflow-hidden flex items-center justify-center text-2xl font-bold text-primary">
                {org.logo_url ? (
                  <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  org.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{org.name}</h1>
                <p className="text-sm text-text-secondary mt-1 line-clamp-2">{org.description || 'Campus organization on MakeYourPass'}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
                  {org.instagram && (
                    <a href={org.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                      Instagram
                    </a>
                  )}
                  {org.website && (
                    <a href={org.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                      <Globe className="h-3.5 w-3.5" /> Website
                    </a>
                  )}
                  <span className="text-text-muted">makeyourpass.vercel.app/{org.slug}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2 pb-1">
                  <Button variant="primary" size="sm" onClick={() => navigate('/dashboard/events/new')}>
                    <Plus className="h-4 w-4" /> Create event
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setSettingsOpen((v) => !v)}>
                    <Settings className="h-4 w-4" /> UPI & settings
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isAdmin && settingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 sm:mx-8 mb-6 p-4 rounded-2xl border border-border bg-surface space-y-3"
          >
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <IndianRupee className="h-4 w-4" /> UPI for paid events
            </h3>
            <p className="text-xs text-text-muted">
              Registrants scan this QR / pay to this UPI ID, then upload a payment screenshot. You review and hit Send ticket.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="UPI ID (VPA)" placeholder="club@oksbi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
              <Input label="Phone (optional)" placeholder="9xxxxxxxxx" value={upiPhone} onChange={(e) => setUpiPhone(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <Upload className="h-4 w-4" />
              {upiQrFile ? upiQrFile.name : org.upi_qr_url ? 'Replace UPI QR image' : 'Upload UPI QR image'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setUpiQrFile(e.target.files?.[0] || null)} />
            </label>
            {org.upi_qr_url && !upiQrFile && (
              <img src={org.upi_qr_url} alt="UPI QR" className="h-32 w-32 object-contain rounded-lg border border-border" />
            )}
            <Button variant="primary" size="sm" onClick={() => void saveUpiSettings()} disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save UPI settings'}
            </Button>
          </motion.div>
        )}

        <div className="px-4 sm:px-8 pb-16">
          <EventRail title="Upcoming events" events={upcoming} canManage={isAdmin} />
          <EventRail title="Past events" events={past} past canManage={isAdmin} />
          {isAdmin && drafts.length > 0 && (
            <EventRail title="Drafts" events={drafts} canManage={isAdmin} />
          )}
          {upcoming.length === 0 && past.length === 0 && (
            <div className="text-center py-16 text-text-muted">
              <p className="mb-4">No published events yet.</p>
              {isAdmin && (
                <Button variant="primary" onClick={() => navigate('/dashboard/events/new')}>
                  <Plus className="h-4 w-4" /> Create your first event
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Discord-style execom sidebar */}
      <ExecomSidebar
        members={execom}
        canManage={isAdmin}
        onAdd={handleAddExecomWithPhoto}
        onDelete={handleDeleteExecom}
      />
    </div>
  )
}

export default OrgHome
