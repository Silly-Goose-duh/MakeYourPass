/**
 * Server-side authorization helpers for Vercel serverless functions.
 *
 * WHY THIS EXISTS: the audit found that ticket generation, ticket resend and
 * the check-in RPCs had NO authorization check. Any caller who knew a
 * registration_id could regenerate or re-send any attendee's ticket, and any
 * anonymous caller could admit any ticket on the platform.
 *
 * Every handler that touches attendee data must resolve the caller through
 * `resolveCaller()` and then check org scoping with `requireEventAccess()` or
 * `requireResponseAccess()`.
 *
 * Dependency-free + dynamic-imported inside handlers (see generate-ticket.ts
 * header comment about the Vercel bundler choking on top-level imports).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Caller {
  id: string
  email: string
  isSuperadmin: boolean
}

export type AccessResult =
  | { ok: true; caller: Caller; organizationId: string; role: 'admin' | 'host' | 'superadmin' }
  | { ok: false; status: 401 | 403 | 404; error: string }

/** Roles permitted to run the door (scan/admit) and live dashboard. */
export const HOST_ROLES = ['admin', 'host'] as const

/**
 * Resolve the caller from a Supabase access token.
 * Returns null when the header is missing or the token is invalid/expired.
 */
export async function resolveCaller(req: any): Promise<Caller | null> {
  const raw = req.headers.authorization || req.headers.Authorization || ''
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  try {
    const supabaseMod: any = await import('@supabase/supabase-js')
    const sb = supabaseMod.createClient(url, serviceKey, { auth: { persistSession: false } })

    // Verify the JWT for real (signature + expiry + audience).
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY
    const verifier = anonKey
      ? supabaseMod.createClient(url, anonKey, { auth: { persistSession: false } })
      : sb
    const { data, error } = await verifier.auth.getUser(token)
    if (error || !data?.user) return null

    const user = data.user
    const { data: prof } = await sb
      .from('profiles')
      .select('is_superadmin, email')
      .eq('id', user.id)
      .maybeSingle()

    return {
      id: user.id,
      email: prof?.email || user.email || '',
      isSuperadmin: !!prof?.is_superadmin,
    }
  } catch (err) {
    console.error('[authz] resolveCaller failed:', err)
    return null
  }
}

/**
 * Assert the caller may operate on `eventId`.
 * Accepts org admins, hosts, and superadmins.
 */
export async function requireEventAccess(sb: any, caller: Caller, eventId: string): Promise<AccessResult> {
  if (caller.isSuperadmin) {
    const { data: ev } = await sb
      .from('events')
      .select('organization_id')
      .eq('id', eventId)
      .maybeSingle()
    if (!ev) return { ok: false, status: 404, error: 'Event not found' }
    return { ok: true, caller, organizationId: ev.organization_id, role: 'superadmin' }
  }

  const { data: ev } = await sb
    .from('events')
    .select('organization_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return { ok: false, status: 404, error: 'Event not found' }

  const { data: mem } = await sb
    .from('organization_members')
    .select('role')
    .eq('organization_id', ev.organization_id)
    .eq('user_id', caller.id)
    .in('role', [...HOST_ROLES])
    .limit(1)

  const role = mem?.[0]?.role
  if (!role) return { ok: false, status: 403, error: 'Not authorized for this event' }
  return { ok: true, caller, organizationId: ev.organization_id, role: role as 'admin' | 'host' }
}

/**
 * Assert the caller may operate on a specific registration.
 * Resolves registration -> event -> organization, then delegates to the
 * same membership check so a host of Org A cannot touch Org B's attendees.
 */
export async function requireResponseAccess(
  sb: any,
  caller: Caller,
  registrationId: string
): Promise<AccessResult & { registration?: any }> {
  const { data: reg } = await sb
    .from('event_responses')
    .select('id, event_id, status')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { ok: false, status: 404, error: 'Registration not found' }

  const access = await requireEventAccess(sb, caller, reg.event_id)
  if (!access.ok) return access
  return { ...access, registration: reg }
}

/** Convenience: create a service-role client. Dynamic import inside. */
export async function serviceClient(): Promise<any | null> {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabaseMod: any = await import('@supabase/supabase-js')
  return supabaseMod.createClient(url, key, { auth: { persistSession: false } })
}
