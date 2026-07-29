import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Settings, Calendar, MapPin, IndianRupee,
  Trash2, Upload, Users, Globe, ArrowLeft, Ticket, UserPlus, Pencil,
} from 'lucide-react'
import { Input, Textarea } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
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
import { zineColorFor, getDaysAway } from '@/components/event/eventUtils'
import { CollaboratorsPanel } from '@/components/org/CollaboratorsPanel'
import type { Organization, CampusEvent, OrgExecomMember } from '@/types'

const RESERVED = new Set([
  'events', 'event', 'login', 'signup', 'dashboard', 'mc', 'host', 'api', 'assets', 'org', 'admin',
  'forgot-password', 'reset-password', 'invite', 'auth',
])

const INK = '#14110E'
const PAPER = '#F4EFE1'
const YELLOW = '#FFD23F'
const RED = '#FF4D2E'

/** Right rail: Discord-style grouping by role, Zine visual language */
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
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const byRole = useMemo(() => {
    const map = new Map<string, OrgExecomMember[]>()
    for (const m of members) {
      const key = m.role_title || 'Member'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [members])

  const clearForm = () => {
    setName('')
    setRole('Member')
    setPhoto(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    setFormError('')
    setOpen(false)
  }

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    setFormError('')
    try {
      await onAdd(
        { full_name: name.trim(), role_title: role.trim() || 'Member', photo_url: '' },
        photo
      )
      clearForm()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save member')
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside
      className="w-full lg:w-[280px] shrink-0 flex flex-col min-h-[40vh] lg:min-h-screen lg:sticky lg:top-0"
      style={{ background: '#FBF8F0', borderLeft: `2.5px solid ${INK}` }}
    >
      <div
        className="px-3 py-3 flex items-center justify-between"
        style={{ borderBottom: `2.5px solid ${INK}`, background: YELLOW }}
      >
        <p
          className="text-[11px] font-extrabold uppercase tracking-wider"
          style={{ fontFamily: 'Syne, sans-serif', color: INK }}
        >
          Execom · {members.length}
        </p>
        <Users className="h-4 w-4" style={{ color: INK }} strokeWidth={2.5} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {byRole.length === 0 && (
          <p className="text-xs font-semibold px-2 py-6 text-center" style={{ color: '#4A4640' }}>
            No members yet.
            {canManage && ' Add your team below.'}
          </p>
        )}
        {byRole.map(([roleTitle, list]) => (
          <div key={roleTitle}>
            <p
              className="text-[10px] font-extrabold uppercase tracking-widest px-2 mb-1.5"
              style={{ fontFamily: 'Syne, sans-serif', color: '#4A4640' }}
            >
              {roleTitle} — {list.length}
            </p>
            <ul className="space-y-1">
              {list.map((m) => (
                <li
                  key={m.id}
                  className="group flex items-center gap-2 px-2 py-1.5"
                  style={{ border: `2px solid transparent` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fff'
                    e.currentTarget.style.borderColor = INK
                    e.currentTarget.style.boxShadow = '2px 2px 0 #14110E'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div
                    className="h-9 w-9 shrink-0 flex items-center justify-center text-xs font-extrabold text-white overflow-hidden rounded-full"
                    style={{
                      background: zineColorFor(m.full_name),
                      border: `2px solid ${INK}`,
                    }}
                  >
                    {m.photo_url ? (
                      <img
                        src={m.photo_url}
                        alt={m.full_name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          const el = e.currentTarget
                          el.style.display = 'none'
                          if (el.parentElement) {
                            el.parentElement.textContent = (m.full_name[0] || '?').toUpperCase()
                          }
                        }}
                      />
                    ) : (
                      (m.full_name[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-extrabold truncate"
                      style={{ fontFamily: 'Syne, sans-serif', color: INK }}
                    >
                      {m.full_name}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void onDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1"
                      title="Remove"
                      style={{ color: RED }}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="p-3" style={{ borderTop: `2.5px solid ${INK}`, background: PAPER }}>
          {!open ? (
            <button
              type="button"
              className="zine-btn w-full text-sm"
              onClick={() => setOpen(true)}
            >
              <Plus className="h-4 w-4" strokeWidth={3} /> Add member
            </button>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                placeholder="Role (Chairperson, Tech Lead…)"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <div
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-full flex items-center justify-center text-xs font-extrabold"
                  style={{ border: `2px solid ${INK}`, background: photoPreview ? '#fff' : YELLOW }}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (name[0] || '?').toUpperCase()
                  )}
                </div>
                <label className="flex-1 flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: '#4A4640' }}>
                  <Upload className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{photo ? photo.name : 'Photo (shows as icon)'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null
                      if (photoPreview) URL.revokeObjectURL(photoPreview)
                      setPhoto(f)
                      setPhotoPreview(f ? URL.createObjectURL(f) : null)
                    }}
                  />
                </label>
              </div>
              {formError && (
                <p className="text-[11px] font-bold" style={{ color: RED }}>{formError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="zine-btn zine-btn-accent text-xs flex-1"
                  onClick={() => void handleAdd()}
                  disabled={saving || !name.trim()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="zine-btn text-xs"
                  style={{ background: '#fff' }}
                  onClick={clearForm}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

/** BookMyShow-style horizontal rail, zine cards */
function EventRail({
  title,
  events,
  past,
  canHost,
  canAdmin,
  accent,
}: {
  title: string
  events: CampusEvent[]
  past?: boolean
  canHost?: boolean
  canAdmin?: boolean
  accent?: string
}) {
  if (events.length === 0) return null
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-xl sm:text-2xl font-extrabold"
          style={{ fontFamily: 'Syne, sans-serif', color: INK }}
        >
          {title}
        </h2>
        <span className="zine-sticker" style={{ background: accent || YELLOW }}>
          {events.length}
        </span>
      </div>
      <div
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {events.map((ev) => {
          const c = zineColorFor(ev.title)
          const days = ev.date ? getDaysAway(ev.date) : 'TBA'
          const actions = [
            ...(canHost
              ? [
                  { to: `/host/${ev.id}/dashboard`, label: 'Live' },
                  { to: `/host/${ev.id}/scan`, label: 'Scan' },
                ]
              : []),
            ...(canAdmin ? [{ to: `/dashboard/events/${ev.id}/edit`, label: 'Edit' }] : []),
          ]
          return (
            <article
              key={ev.id}
              className="zine-card snap-start shrink-0 w-[168px] sm:w-[200px] overflow-hidden"
              style={past ? { opacity: 0.78, filter: 'grayscale(0.75)' } : undefined}
            >
              <Link to={`/event/${ev.slug}`} className="block">
                <div
                  className="relative h-[140px] sm:h-[160px] flex items-center justify-center overflow-hidden"
                  style={{ background: c, borderBottom: `2.5px solid ${INK}` }}
                >
                  {ev.poster_url ? (
                    <img src={ev.poster_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span
                      className="font-extrabold opacity-30 px-2 text-center line-clamp-3"
                      style={{
                        fontFamily: 'Syne, sans-serif',
                        fontSize: '1.1rem',
                        color: INK,
                        WebkitTextStroke: '1px #14110E',
                      }}
                    >
                      {ev.title}
                    </span>
                  )}
                  <span
                    className="absolute top-0 right-0 px-2 py-1 text-[10px] font-extrabold uppercase text-white"
                    style={{ background: INK, fontFamily: 'Syne, sans-serif' }}
                  >
                    {days}
                  </span>
                  {ev.payment_type === 'paid' && (
                    <span className="zine-sticker absolute bottom-2 left-2" style={{ background: RED, color: '#fff' }}>
                      ₹{ev.price}
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-1.5" style={{ background: '#fff' }}>
                  <h3
                    className="text-sm font-extrabold leading-tight line-clamp-2"
                    style={{ fontFamily: 'Syne, sans-serif', color: INK }}
                  >
                    {ev.title}
                  </h3>
                  <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#4A4640' }}>
                    <Calendar className="h-3 w-3" strokeWidth={2.5} />
                    {ev.date ? formatDate(ev.date) : 'TBA'}
                  </p>
                  {ev.venue && (
                    <p className="text-[11px] font-semibold flex items-center gap-1 truncate" style={{ color: '#4A4640' }}>
                      <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                      {ev.venue}
                    </p>
                  )}
                </div>
              </Link>
              {actions.length > 0 && (
                <div className="flex" style={{ borderTop: `2.5px solid ${INK}` }}>
                  {actions.map((a, i) => (
                    <Link
                      key={a.label}
                      to={a.to}
                      className="flex-1 text-center py-2 text-[10px] font-extrabold uppercase tracking-wide hover:bg-[#FFD23F]/40"
                      style={{
                        fontFamily: 'Syne, sans-serif',
                        color: INK,
                        borderLeft: i > 0 ? `2px solid ${INK}` : undefined,
                      }}
                    >
                      {a.label}
                    </Link>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function OrgHome() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const slugInvalid = !orgSlug || RESERVED.has((orgSlug || '').toLowerCase())
  const [org, setOrg] = useState<Organization | null>(null)
  const [events, setEvents] = useState<CampusEvent[]>([])
  const [execom, setExecom] = useState<OrgExecomMember[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [canHost, setCanHost] = useState(false)
  const [loading, setLoading] = useState(!slugInvalid)
  const [notFound, setNotFound] = useState(slugInvalid)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collabOpen, setCollabOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editTagline, setEditTagline] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [profileMsg, setProfileMsg] = useState('')
  const [upiId, setUpiId] = useState('')
  const [upiPhone, setUpiPhone] = useState('')
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (slugInvalid) return
    let alive = true
    ;(async () => {
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
      setEditName(o.name || '')
      setEditTagline(o.description || '')
      setLogoFile(null)
      setLogoPreview(null)
      setProfileMsg('')

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
        const mine = (memberships || []).find((m) => m.organization_id === o.id)
        const admin = !!prof?.is_superadmin || mine?.role === 'admin'
        const host = admin || mine?.role === 'host'
        setIsAdmin(admin)
        setCanHost(host)
        if (mine || prof?.is_superadmin) {
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

  const handleAddExecomWithPhoto = async (
    m: { full_name: string; role_title: string; photo_url: string },
    file?: File | null
  ) => {
    if (!org) return
    let photo_url = m.photo_url || ''
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const path = `org/${org.id}/execom/${Date.now()}.${ext}`
      const { data: upData, error: upErr } = await uploadOrgAsset(file, path)
      if (upErr) {
        throw new Error(upErr.message || 'Photo upload failed — try a smaller JPG/PNG')
      }
      // Prefer returned path if present
      const storedPath = upData?.path || path
      photo_url = getOrgAssetPublicUrl(storedPath)
    }
    const { data, error } = await addExecomMember({
      organization_id: org.id,
      full_name: m.full_name,
      role_title: m.role_title,
      photo_url,
      sort_order: execom.length,
    })
    if (error) throw new Error(error.message || 'Could not save member')
    if (data) setExecom((prev) => [...prev, data])
  }

  const handleDeleteExecom = async (id: string) => {
    await deleteExecomMember(id)
    setExecom((prev) => prev.filter((x) => x.id !== id))
  }

  const openProfileEditor = () => {
    if (!org) return
    setEditName(org.name || '')
    setEditTagline(org.description || '')
    setLogoFile(null)
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoPreview(null)
    setProfileMsg('')
    setProfileOpen(true)
    setSettingsOpen(false)
    setCollabOpen(false)
  }

  const saveOrgProfile = async () => {
    if (!org) return
    const name = editName.trim()
    if (!name) {
      setProfileMsg('Name is required')
      return
    }
    setSavingProfile(true)
    setProfileMsg('')
    try {
      let logo_url = org.logo_url || ''
      if (logoFile) {
        const ext = (logoFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const path = `org/${org.id}/logo-${Date.now()}.${ext}`
        const { data: up, error: upErr } = await uploadOrgAsset(logoFile, path)
        if (upErr) throw new Error(upErr.message || 'Logo upload failed')
        logo_url = getOrgAssetPublicUrl(up?.path || path)
      }
      const { data, error } = await updateOrganization(org.id, {
        name,
        description: editTagline.trim(),
        logo_url,
      })
      if (error) throw error
      if (data) setOrg(data)
      setProfileMsg('Saved — your portal looks updated.')
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      setLogoFile(null)
      setLogoPreview(null)
      // keep panel open briefly so they see success, or close
      setTimeout(() => setProfileOpen(false), 700)
    } catch (e) {
      setProfileMsg(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
        <div className="h-8 w-8 border-[3px] border-[#14110E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: PAPER }}>
        <div
          className="text-center max-w-md p-8"
          style={{ background: '#fff', border: `2.5px solid ${INK}`, boxShadow: '6px 6px 0 #14110E' }}
        >
          <span className="zine-sticker" style={{ background: RED, color: '#fff' }}>404</span>
          <h1
            className="text-2xl font-extrabold mt-4 mb-2"
            style={{ fontFamily: 'Syne, sans-serif', color: INK }}
          >
            Portal not live
          </h1>
          <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
            This org isn&apos;t approved yet, or the link is wrong. Request an org via signup — superadmin unlocks the portal.
          </p>
          <Link to="/">
            <button type="button" className="zine-btn zine-btn-accent">
              <ArrowLeft className="h-4 w-4" strokeWidth={3} /> Back home
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const brandColor = zineColorFor(org.name)

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: PAPER }}>
      {/* Main column */}
      <div className="flex-1 min-w-0">
        {/* Mini nav strip (matches site chrome) */}
        <div
          className="flex items-center justify-between px-4 sm:px-6 h-14"
          style={{ background: PAPER, borderBottom: `2.5px solid ${INK}` }}
        >
          <Link to="/" className="flex items-center gap-2 group">
            <div
              className="h-9 w-9 flex items-center justify-center"
              style={{ background: RED, border: `2.5px solid ${INK}`, boxShadow: '2px 2px 0 #14110E' }}
            >
              <Ticket className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-sm" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
              MakeYourPass
            </span>
          </Link>
          <Link to="/events" className="text-xs font-extrabold uppercase tracking-wide" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
            All events →
          </Link>
        </div>

        {/* Yellow hero band — same energy as home */}
        <section style={{ borderBottom: `2.5px solid ${INK}`, background: YELLOW }}>
          <div className="px-4 sm:px-6 py-6 sm:py-8 relative">
            <span className="zine-sticker" style={{ background: RED, color: '#fff', transform: 'rotate(-2deg)' }}>
              ★ Club portal
            </span>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-4">
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => isAdmin && openProfileEditor()}
                className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 flex items-center justify-center text-2xl font-extrabold text-white overflow-hidden group"
                style={{
                  background: brandColor,
                  border: `2.5px solid ${INK}`,
                  boxShadow: '4px 4px 0 #14110E',
                  fontFamily: 'Syne, sans-serif',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                title={isAdmin ? 'Edit club icon' : undefined}
              >
                {org.logo_url ? (
                  <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  org.name.slice(0, 2).toUpperCase()
                )}
                {isAdmin && (
                  <span
                    className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden
                  >
                    <Pencil className="h-5 w-5 text-white" strokeWidth={2.5} />
                  </span>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <h1
                    className="font-extrabold tracking-tighter"
                    style={{
                      fontFamily: 'Syne, sans-serif',
                      fontSize: 'clamp(1.75rem, 5vw, 3rem)',
                      lineHeight: 0.95,
                      color: INK,
                    }}
                  >
                    {org.name.toUpperCase()}
                  </h1>
                  {isAdmin && (
                    <button
                      type="button"
                      className="mt-1 p-1.5 hover:opacity-80"
                      style={{ background: '#fff', border: `2px solid ${INK}` }}
                      onClick={openProfileEditor}
                      title="Edit name, tagline & icon"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <p className="mt-2 max-w-xl text-sm font-semibold" style={{ color: INK }}>
                  {org.description || 'Campus club on MakeYourPass — events, tickets, check-in.'}
                </p>
                <p className="mt-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: '#4A4640' }}>
                  makeyourpass.vercel.app/{org.slug}
                </p>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="zine-btn zine-btn-accent text-sm"
                    onClick={() => navigate('/dashboard/events/new')}
                  >
                    <Plus className="h-4 w-4" strokeWidth={3} /> Create event
                  </button>
                  <button
                    type="button"
                    className="zine-btn text-sm"
                    style={{ background: '#fff' }}
                    onClick={openProfileEditor}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2.5} /> Edit profile
                  </button>
                  <button
                    type="button"
                    className="zine-btn text-sm"
                    style={{ background: '#fff' }}
                    onClick={() => { setCollabOpen((v) => !v); setSettingsOpen(false); setProfileOpen(false) }}
                  >
                    <UserPlus className="h-4 w-4" strokeWidth={2.5} /> Team
                  </button>
                  <button
                    type="button"
                    className="zine-btn text-sm"
                    style={{ background: '#fff' }}
                    onClick={() => { setSettingsOpen((v) => !v); setCollabOpen(false); setProfileOpen(false) }}
                  >
                    <Settings className="h-4 w-4" strokeWidth={2.5} /> UPI
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Marquee strip like home */}
          <div className="overflow-hidden" style={{ borderTop: `2.5px solid ${INK}`, background: INK }}>
            <div className="zine-marquee py-1.5">
              {Array.from({ length: 2 }).map((_, r) => (
                <span key={r} className="flex shrink-0" aria-hidden={r === 1}>
                  {['EVENTS', 'EXECOM', 'TICKETS', 'CHECK-IN', org.name.toUpperCase()].map((w, i) => (
                    <span
                      key={w + r + i}
                      className="mx-5 text-xs font-extrabold uppercase tracking-widest"
                      style={{ fontFamily: 'Syne, sans-serif', color: YELLOW }}
                    >
                      {w} <span style={{ color: RED }}>✦</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        {isAdmin && profileOpen && org && (
          <div
            className="mx-4 sm:mx-6 mt-6 p-4 sm:p-5 space-y-4"
            style={{ background: '#fff', border: `2.5px solid ${INK}`, boxShadow: '4px 4px 0 #14110E' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-extrabold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
                  <Pencil className="h-4 w-4" strokeWidth={2.5} /> Edit club profile
                </h3>
                <p className="text-xs font-semibold mt-1" style={{ color: '#4A4640' }}>
                  Update name, tagline, and icon anytime. URL stays <strong>/{org.slug}</strong>.
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-extrabold px-2 py-1"
                style={{ border: `2px solid ${INK}` }}
                onClick={() => setProfileOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="h-24 w-24 overflow-hidden flex items-center justify-center text-xl font-extrabold text-white"
                  style={{
                    background: brandColor,
                    border: `2.5px solid ${INK}`,
                    boxShadow: '3px 3px 0 #14110E',
                    fontFamily: 'Syne, sans-serif',
                  }}
                >
                  {logoPreview || org.logo_url ? (
                    <img
                      src={logoPreview || org.logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (editName || org.name).slice(0, 2).toUpperCase()
                  )}
                </div>
                <label className="zine-btn text-xs cursor-pointer" style={{ background: '#fff' }}>
                  <Upload className="h-3.5 w-3.5" /> Change icon
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null
                      if (logoPreview) URL.revokeObjectURL(logoPreview)
                      setLogoFile(f)
                      setLogoPreview(f ? URL.createObjectURL(f) : null)
                    }}
                  />
                </label>
                {logoFile && (
                  <button
                    type="button"
                    className="text-[10px] font-bold underline"
                    style={{ color: '#4A4640' }}
                    onClick={() => {
                      if (logoPreview) URL.revokeObjectURL(logoPreview)
                      setLogoFile(null)
                      setLogoPreview(null)
                    }}
                  >
                    Remove new photo
                  </button>
                )}
              </div>

              <div className="flex-1 w-full space-y-3">
                <Input
                  label="Organization name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Under25"
                  required
                />
                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: INK }}>
                    Tagline / description
                  </label>
                  <Textarea
                    value={editTagline}
                    onChange={(e) => setEditTagline(e.target.value)}
                    placeholder="Short line about your club…"
                    rows={3}
                  />
                </div>
                <p className="text-[11px] font-semibold" style={{ color: '#4A4640' }}>
                  Portal URL (fixed): makeyourpass.vercel.app/<strong>{org.slug}</strong>
                </p>
                {profileMsg && (
                  <p
                    className="text-xs font-bold"
                    style={{ color: profileMsg.startsWith('Saved') ? '#0A7A4F' : RED }}
                  >
                    {profileMsg}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="zine-btn zine-btn-accent text-sm"
                    onClick={() => void saveOrgProfile()}
                    disabled={savingProfile}
                  >
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                  <button
                    type="button"
                    className="zine-btn text-sm"
                    style={{ background: '#fff' }}
                    onClick={() => setProfileOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isAdmin && collabOpen && org && (
          <div className="mx-4 sm:mx-6 mt-6" style={{ boxShadow: '4px 4px 0 #14110E' }}>
            <CollaboratorsPanel orgId={org.id} canManage={isAdmin} onClose={() => setCollabOpen(false)} />
          </div>
        )}

        {isAdmin && settingsOpen && (
          <div
            className="mx-4 sm:mx-6 mt-6 p-4 space-y-3"
            style={{ background: '#fff', border: `2.5px solid ${INK}`, boxShadow: '4px 4px 0 #14110E' }}
          >
            <h3 className="font-extrabold flex items-center gap-2" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
              <IndianRupee className="h-4 w-4" strokeWidth={2.5} /> UPI for paid events
            </h3>
            <p className="text-xs font-semibold" style={{ color: '#4A4640' }}>
              Registrants scan this QR / pay this UPI ID, upload a screenshot. You review and hit Send ticket on Live.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="UPI ID (VPA)" placeholder="club@oksbi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
              <Input label="Phone (optional)" placeholder="9xxxxxxxxx" value={upiPhone} onChange={(e) => setUpiPhone(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: '#4A4640' }}>
              <Upload className="h-4 w-4" />
              {upiQrFile ? upiQrFile.name : org.upi_qr_url ? 'Replace UPI QR' : 'Upload UPI QR'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setUpiQrFile(e.target.files?.[0] || null)} />
            </label>
            {org.upi_qr_url && !upiQrFile && (
              <img
                src={org.upi_qr_url}
                alt="UPI QR"
                className="h-32 w-32 object-contain"
                style={{ border: `2.5px solid ${INK}`, background: '#fff' }}
              />
            )}
            <button
              type="button"
              className="zine-btn zine-btn-accent text-sm"
              onClick={() => void saveUpiSettings()}
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save UPI settings'}
            </button>
          </div>
        )}

        <div className="px-4 sm:px-6 py-8 pb-20">
          {(org.website || org.instagram) && (
            <div className="flex flex-wrap gap-3 mb-8 text-xs font-extrabold uppercase">
              {org.website && (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noreferrer"
                  className="zine-sticker inline-flex items-center gap-1"
                  style={{ background: '#2D5BFF', color: '#fff' }}
                >
                  <Globe className="h-3 w-3" /> Web
                </a>
              )}
              {org.instagram && (
                <a
                  href={org.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="zine-sticker"
                  style={{ background: '#E84AC4', color: '#fff' }}
                >
                  Instagram
                </a>
              )}
            </div>
          )}

          <EventRail title="Upcoming" events={upcoming} canHost={canHost} canAdmin={isAdmin} accent={YELLOW} />
          <EventRail title="Past" events={past} past canHost={canHost} canAdmin={isAdmin} accent="#fff" />
          {isAdmin && (
            <EventRail title="Drafts" events={drafts} canHost={canHost} canAdmin={isAdmin} accent="#2D5BFF" />
          )}

          {upcoming.length === 0 && past.length === 0 && (
            <div
              className="text-center py-14 px-6"
              style={{ background: '#fff', border: `2.5px solid ${INK}`, boxShadow: '4px 4px 0 #14110E' }}
            >
              <p className="font-extrabold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: INK }}>
                No events yet
              </p>
              <p className="text-sm font-semibold mb-6" style={{ color: '#4A4640' }}>
                {isAdmin ? 'Drop your first workshop, talk, or fest.' : 'Check back soon.'}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  className="zine-btn zine-btn-accent"
                  onClick={() => navigate('/dashboard/events/new')}
                >
                  <Plus className="h-4 w-4" strokeWidth={3} /> Create event
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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
