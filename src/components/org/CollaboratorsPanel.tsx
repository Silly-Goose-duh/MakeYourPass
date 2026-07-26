import { useEffect, useState } from 'react'
import { UserPlus, Copy, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  inviteOrgCollaborator,
  listOrgCollaborators,
  removeOrgCollaborator,
  revokeOrgInvite,
} from '@/lib/supabase'

type MemberRow = { id: string; user_id: string; role: string; email: string; full_name: string; kind: string }
type InviteRow = { id: string; email: string; role: string; token: string; status: string; kind: string }

export function CollaboratorsPanel({
  orgId,
  canManage,
  onClose,
}: {
  orgId: string
  canManage: boolean
  onClose?: () => void
}) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'host' | 'admin'>('host')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    const { data } = await listOrgCollaborators(orgId)
    if (data && !data.error) {
      setMembers((data.members || []) as MemberRow[])
      setInvites((data.invites || []) as InviteRow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManage || !email.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await inviteOrgCollaborator(orgId, email.trim(), role)
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))
      const status = String(data?.status || '')
      if (status === 'invited' && data?.token) {
        const link = `${window.location.origin}/invite/${data.token}`
        try { await navigator.clipboard.writeText(link) } catch { /* ignore */ }
        setMsg({
          ok: true,
          text: `Invite created for ${email}. Link copied — share it with them. They must sign up / sign in with that email.`,
        })
      } else {
        setMsg({ ok: true, text: String(data?.message || 'Collaborator added.') })
      }
      setEmail('')
      await reload()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Invite failed' })
    } finally {
      setBusy(false)
    }
  }

  const copyInvite = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    try {
      await navigator.clipboard.writeText(link)
      setMsg({ ok: true, text: 'Invite link copied' })
    } catch {
      setMsg({ ok: false, text: link })
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4" style={{ background: '#fff', border: '2.5px solid #14110E' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold" style={{ fontFamily: 'Syne, sans-serif', color: '#14110E' }}>
            Collaborators
          </h3>
          <p className="text-xs font-semibold mt-1" style={{ color: '#4A4640' }}>
            Invite teammates by email. <b>Host</b> can scan &amp; admit. <b>Admin</b> has full org powers.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-1 hover:opacity-70">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {canManage && (
        <form onSubmit={invite} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@college.edu"
              className="flex-1"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'host' | 'admin')}
              className="px-3 py-2 text-sm font-bold border-2 border-[#14110E] bg-white"
            >
              <option value="host">Host (scan / admit)</option>
              <option value="admin">Admin (full access)</option>
            </select>
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              <UserPlus className="h-4 w-4 mr-1" /> Invite
            </Button>
          </div>
        </form>
      )}

      {msg && (
        <p className="text-xs font-bold" style={{ color: msg.ok ? '#14B87A' : '#FF4D2E' }}>
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="text-xs font-semibold" style={{ color: '#4A4640' }}>Loading…</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#4A4640' }}>
              Team ({members.length})
            </p>
            <ul className="divide-y divide-black/10">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate" style={{ color: '#14110E' }}>
                      {m.full_name || m.email || 'User'}
                    </p>
                    <p className="text-[11px] font-semibold truncate" style={{ color: '#4A4640' }}>
                      {m.email} · {m.role}
                    </p>
                  </div>
                  {canManage && m.role !== 'admin' && (
                    <button
                      type="button"
                      className="p-2 hover:bg-red-50"
                      title="Remove"
                      onClick={async () => {
                        await removeOrgCollaborator(orgId, m.user_id)
                        await reload()
                      }}
                    >
                      <Trash2 className="h-4 w-4" style={{ color: '#FF4D2E' }} />
                    </button>
                  )}
                </li>
              ))}
              {members.length === 0 && (
                <li className="text-xs font-semibold py-2" style={{ color: '#4A4640' }}>No members yet</li>
              )}
            </ul>
          </div>

          {invites.length > 0 && (
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider mb-2" style={{ color: '#4A4640' }}>
                Pending invites
              </p>
              <ul className="divide-y divide-black/10">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{i.email}</p>
                      <p className="text-[11px] font-semibold" style={{ color: '#4A4640' }}>
                        {i.role} · waiting to accept
                      </p>
                    </div>
                    <button type="button" className="p-2 hover:bg-yellow-50" title="Copy link" onClick={() => void copyInvite(i.token)}>
                      <Copy className="h-4 w-4" />
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className="p-2 hover:bg-red-50"
                        title="Revoke"
                        onClick={async () => {
                          await revokeOrgInvite(i.id)
                          await reload()
                        }}
                      >
                        <Trash2 className="h-4 w-4" style={{ color: '#FF4D2E' }} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
