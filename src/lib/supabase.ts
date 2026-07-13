import { createClient } from '@supabase/supabase-js'
import type { Profile, Organization, OrganizationMember, OrgRegistrationRequest, CampusEvent, EventQuestion, EventResponse, ResponseAnswer } from '@/types'

// Helper to detect RLS recursion errors
function isRlsRecursionError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: string }).message
    return msg.includes('infinite recursion') || msg.includes('recursion detected in policy')
  }
  return false
}

// Try an RPC call; if it returns 404 (function doesn't exist), return null without error
async function tryRpc<T>(name: string, params?: Record<string, unknown>): Promise<{ data: T | null; error: Error | null; found: boolean }> {
  try {
    const { data, error } = await supabase.rpc(name, params || {})
    if (error) {
      // PGRST202 = function not found in schema cache
      if ('code' in error && (error as { code: string }).code === 'PGRST202') {
        return { data: null, error: null, found: false }
      }
      return { data: null, error, found: true }
    }
    return { data: data as T, error: null, found: true }
  } catch {
    return { data: null, error: null, found: false }
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const hasCredentials = !!(supabaseUrl && supabaseAnonKey)

if (!hasCredentials) {
  console.warn('⚠️ Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
}

function createSupabaseClient() {
  if (hasCredentials) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  }
  // Mock proxy for development without credentials
  const noop = () => Promise.resolve({ data: null, error: new Error('Supabase not configured') })
  const proxy = new Proxy(noop, {
    get(t, p) { if (p === 'then' || p === 'catch' || p === 'finally') return undefined; return proxy },
    apply() { return Promise.resolve({ data: null, error: new Error('Supabase not configured') }) },
  })
  return new Proxy({} as ReturnType<typeof createClient>, {
    get(_t, p) {
      if (p === 'auth') return new Proxy({} as ReturnType<typeof createClient>['auth'], {
        get() { return () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) },
      })
      return proxy
    },
  })
}

export const supabase = createSupabaseClient()

// ==================== Auth ====================

export async function signUp(email: string, password: string, fullName: string) {
  return supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ==================== Profiles ====================

export async function getProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return { data: data as Profile | null, error }
}

export async function getCurrentProfile() {
  const user = await getCurrentUser()
  if (!user) return { data: null, error: new Error('Not authenticated') }
  return getProfile(user.id)
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single()
  return { data: data as Profile | null, error }
}

// ==================== Organizations ====================

export async function getApprovedOrganizations() {
  const { data, error } = await supabase.from('organizations').select('*').eq('is_approved', true).order('name')
  return { data: data as Organization[] | null, error }
}

export async function getOrganizationsWithCounts() {
  const { data, error } = await supabase.rpc('get_organizations_with_counts')
  return { data: data as Organization[] | null, error }
}

export async function getOrganizationBySlug(slug: string) {
  const { data, error } = await supabase.from('organizations').select('*').eq('slug', slug).single()
  return { data: data as Organization | null, error }
}

// ==================== Org Registration Requests ====================

export async function createOrganizationRequest(name: string, slug: string, description: string) {
  const { data, error } = await supabase.rpc('create_organization_request', { org_name: name, org_slug: slug, org_description: description })
  return { data: data as { id?: string; status?: string; error?: string } | null, error }
}

export async function getUserRequests() {
  const user = await getCurrentUser()
  if (!user) return { data: null, error: new Error('Not authenticated') }
  const { data, error } = await supabase.from('organization_registration_requests').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  return { data: data as OrgRegistrationRequest[] | null, error }
}

export async function getPendingRequests() {
  const { data, error } = await supabase.from('organization_registration_requests').select('*, profiles:user_id(full_name, email)').eq('status', 'pending').order('created_at')
  return { data: data as Record<string, unknown>[] | null, error }
}

export async function approveRequest(requestId: string) {
  const { data, error } = await supabase.rpc('approve_organization_request', { request_id: requestId })
  return { data: data as { organization_id?: string; status?: string; error?: string } | null, error }
}

export async function rejectRequest(requestId: string) {
  const { data, error } = await supabase.rpc('reject_organization_request', { request_id: requestId })
  return { data: data as { status?: string; error?: string } | null, error }
}

// ==================== Org Members ====================

export async function getUserOrganizations() {
  const user = await getCurrentUser()
  if (!user) return { data: null, error: new Error('Not authenticated') }
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('user_id', user.id)
  if (isRlsRecursionError(error)) {
    return { data: [], error: new Error('RLS_RECURSION') }
  }
  return { data: data as (OrganizationMember & { organizations: Organization })[] | null, error }
}

export async function getOrgMembers(orgId: string) {
  const { data, error } = await supabase.from('organization_members').select('*').eq('organization_id', orgId)
  if (isRlsRecursionError(error)) {
    return { data: [], error: new Error('RLS_RECURSION') }
  }
  return { data: data as OrganizationMember[] | null, error }
}

// ==================== Events (RPC-first with direct fallback) ====================

export async function getPublishedEvents() {
  // Try SECURITY DEFINER RPC first (bypasses RLS - requires rls-fix-v2.sql applied)
  const rpcResult = await tryRpc<CampusEvent[]>('get_published_events')
  if (rpcResult.found) {
    if (rpcResult.error) return { data: null, error: rpcResult.error }
    // Enrich with org data
    const events = (rpcResult.data || []) as (CampusEvent & { organizations?: Pick<Organization, 'name' | 'slug' | 'logo_url'> })[]
    const orgIds = [...new Set(events.map(e => e.organization_id))]
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url')
        .in('id', orgIds) as { data: { id: string; name: string; slug: string; logo_url: string }[] | null }
      const orgMap = new Map((orgs || []).map(o => [o.id, { name: o.name, slug: o.slug, logo_url: o.logo_url }]))
      for (const event of events) {
        event.organizations = orgMap.get(event.organization_id) || { name: '', slug: '', logo_url: '' }
      }
    }
    return { data: events as (CampusEvent & { organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'> })[], error: null }
  }

  // Fallback: direct query (will fail with RLS recursion until SQL fix is applied)
  const { data, error } = await supabase
    .from('events')
    .select('*, organizations(name, slug, logo_url)')
    .eq('status', 'published')
    .order('date', { ascending: true })
  if (isRlsRecursionError(error)) {
    return { data: [], error: new Error('RLS_RECURSION') }
  }
  return { data: data as (CampusEvent & { organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'> })[] | null, error }
}

export async function getEventsByOrganization(orgId: string, filterStatus: string = 'all') {
  // Try RPC first
  const rpcResult = await tryRpc<CampusEvent[]>('get_organization_events', {
    org_id: orgId,
    filter_status: filterStatus === 'all' ? 'all' : filterStatus
  })
  if (rpcResult.found) {
    if (rpcResult.error) return { data: null, error: rpcResult.error }
    return { data: (rpcResult.data || []) as CampusEvent[], error: null }
  }

  // Fallback: direct query
  let query = supabase.from('events').select('*').eq('organization_id', orgId)
  if (filterStatus !== 'all') {
    query = query.eq('status', filterStatus)
  }
  const { data, error } = await query.order('created_at', { ascending: false })
  if (isRlsRecursionError(error)) {
    return { data: [], error: new Error('RLS_RECURSION') }
  }
  return { data: data as CampusEvent[] | null, error }
}

export async function getEventBySlug(slug: string) {
  // Try direct query first
  const { data, error } = await supabase.from('events')
    .select('*, organizations(name, slug, logo_url, description)')
    .eq('slug', slug).single()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  if (!error && data) return { data: data as CampusEvent & { organizations: Organization } | null, error }

  // Fallback: try RPC
  const rpcResult = await tryRpc<CampusEvent[]>('get_published_events')
  if (rpcResult.found && rpcResult.data) {
    const found = (rpcResult.data as CampusEvent[]).find(e => e.slug === slug)
    if (found) {
      const { data: org } = await supabase.from('organizations').select('*').eq('id', found.organization_id).single()
      return { data: { ...found, organizations: org as Organization } as CampusEvent & { organizations: Organization }, error: null }
    }
  }
  return { data: null, error: new Error('RLS_RECURSION') }
}

export async function getEventById(id: string) {
  // Try direct query first
  const { data, error } = await supabase.from('events')
    .select('*, organizations(name, slug, logo_url)')
    .eq('id', id).single()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  if (!error && data) return { data: data as CampusEvent & { organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'> } | null, error }

  // Fallback: try RPC
  const rpcResult = await tryRpc<CampusEvent[]>('get_published_events')
  if (rpcResult.found && rpcResult.data) {
    const found = (rpcResult.data as CampusEvent[]).find(e => e.id === id)
    if (found) {
      const { data: org } = await supabase.from('organizations').select('name, slug, logo_url').eq('id', found.organization_id).single()
      return { data: { ...found, organizations: org as Pick<Organization, 'name' | 'slug' | 'logo_url'> } as CampusEvent & { organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'> }, error: null }
    }
  }
  return { data: null, error: new Error('RLS_RECURSION') }
}

export async function createEvent(event: Partial<CampusEvent>) {
  // Try RPC first (SECURITY DEFINER - bypasses RLS)
  const rpcResult = await tryRpc<{ id: string }>('create_event', {
    org_id: event.organization_id,
    event_title: event.title,
    event_slug: event.slug,
    event_description: event.description || '',
    event_date: event.date || null,
    event_time: event.time || null,
    event_venue: event.venue || '',
    event_form_type: event.form_type || 'manual',
    event_payment_type: event.payment_type || 'free',
    event_price: event.price || 0,
    event_status: event.status || 'draft',
  })
  if (rpcResult.found && rpcResult.data) {
    // Fetch the full event
    return getEventById(rpcResult.data.id as string)
  }

  // Fallback: direct insert
  const { data, error } = await supabase.from('events').insert(event).select().single()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  return { data: data as CampusEvent | null, error }
}

export async function updateEvent(id: string, updates: Partial<CampusEvent>) {
  const { data, error } = await supabase.from('events').update(updates).eq('id', id).select().single()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  return { data: data as CampusEvent | null, error }
}

// ==================== Event Questions ====================

/**
 * The `event_questions.options` column is stored as a JSON string
 * (see saveEventQuestions: JSON.stringify(q.options)). Postgres returns it
 * as a string, not an array, so consumers calling .map() on it would throw
 * "e.options.map is not a function". Normalize defensively to always be string[].
 */
function normalizeQuestionOptions(q: EventQuestion): EventQuestion {
  // options is typed string[] but stored as a JSON string in Postgres;
  // treat it as unknown to avoid TS narrowing it to never.
  const rawOptions = (q.options as unknown) as string[] | string | null | undefined
  let options: string[] = []
  if (Array.isArray(rawOptions)) {
    options = rawOptions
  } else if (typeof rawOptions === 'string') {
    const raw = rawOptions.trim()
    if (raw.length === 0) {
      options = []
    } else {
      try {
        const parsed = JSON.parse(raw)
        options = Array.isArray(parsed) ? parsed.map(String) : String(parsed).split(',').map((s: string) => s.trim())
      } catch {
        options = raw.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
    }
  }
  return { ...q, options }
}

export async function getEventQuestions(eventId: string) {
  const { data, error } = await supabase.from('event_questions').select('*').eq('event_id', eventId).order('sort_order')
  if (isRlsRecursionError(error)) {
    return { data: [], error: new Error('RLS_RECURSION') }
  }
  if (!data) return { data: null, error }
  const normalized = (data as EventQuestion[]).map(normalizeQuestionOptions)
  return { data: normalized as EventQuestion[] | null, error }
}

export async function saveEventQuestions(eventId: string, questions: { title: string; description: string; question_type: string; options: string[]; required: boolean; sort_order: number }[]) {
  const { error: deleteError } = await supabase.from('event_questions').delete().eq('event_id', eventId)
  if (isRlsRecursionError(deleteError)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  if (deleteError) return { data: null, error: deleteError }
  if (questions.length === 0) return { data: [] as EventQuestion[], error: null }
  const inserts = questions.map((q, i) => ({
    event_id: eventId,
    title: q.title,
    description: q.description,
    question_type: q.question_type,
    options: JSON.stringify(q.options),
    required: q.required,
    sort_order: i,
  }))
  const { data, error } = await supabase.from('event_questions').insert(inserts).select()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  return { data: data as EventQuestion[] | null, error }
}

// ==================== Event Responses ====================

export async function submitEventResponse(eventId: string, data: { respondent_name: string; respondent_email: string; respondent_phone?: string }) {
  // Route through a SECURITY DEFINER RPC so anonymous form submissions
  // always succeed (bypasses event_responses RLS). Falls back to direct
  // insert if the RPC is unavailable.
  try {
    const { data: rpcId, error: rpcError } = await supabase.rpc('submit_event_response', {
      p_event_id: eventId,
      p_name: data.respondent_name,
      p_email: data.respondent_email,
      p_phone: data.respondent_phone ?? '',
    })
    if (!rpcError && rpcId) {
      return { data: { id: rpcId } as EventResponse, error: null }
    }
  } catch { /* fall through to direct insert */ }
  const { data: result, error } = await supabase.from('event_responses').insert({ event_id: eventId, ...data }).select().single()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  return { data: result as EventResponse | null, error }
}

export async function submitResponseAnswers(responseId: string, answers: { question_id: string; value: string }[]) {
  if (answers.length === 0) return { data: [] as ResponseAnswer[], error: null }
  // Route through a SECURITY DEFINER RPC (anon-safe). Fall back to direct insert.
  try {
    const { error: rpcError } = await supabase.rpc('submit_response_answers', {
      p_response_id: responseId,
      p_answers: answers,
    })
    if (!rpcError) {
      return { data: answers.map((a, i) => ({ id: `${responseId}-${i}`, ...a })) as ResponseAnswer[], error: null }
    }
  } catch { /* fall through to direct insert */ }
  const inserts = answers.map(a => ({ response_id: responseId, question_id: a.question_id, value: a.value }))
  const { data, error } = await supabase.from('response_answers').insert(inserts).select()
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  return { data: data as ResponseAnswer[] | null, error }
}

export async function getEventResponses(eventId: string) {
  const { data, error } = await supabase.from('event_responses').select('*').eq('event_id', eventId).order('submitted_at', { ascending: false })
  if (isRlsRecursionError(error)) {
    return { data: [], error: new Error('RLS_RECURSION') }
  }
  return { data: data as EventResponse[] | null, error }
}

export async function getResponseAnswers(responseIds: string[]) {
  if (responseIds.length === 0) return { data: [] as ResponseAnswer[], error: null }
  const { data, error } = await supabase.from('response_answers').select('*').in('response_id', responseIds)
  if (isRlsRecursionError(error)) {
    return { data: null, error: new Error('RLS_RECURSION') }
  }
  return { data: data as ResponseAnswer[] | null, error }
}

// ==================== Analytics ====================

export async function getEventAnalytics(eventId: string) {
  const { data, error } = await supabase.rpc('get_event_analytics', { event_id_param: eventId })
  return { data: data as Record<string, unknown> | null, error }
}

// ==================== Storage ====================

export async function uploadPoster(file: File, path: string) {
  return supabase.storage.from('event-posters').upload(path, file, { upsert: true })
}

export function getPosterPublicUrl(path: string) {
  const { data } = supabase.storage.from('event-posters').getPublicUrl(path)
  return data.publicUrl
}

export async function uploadBrochure(file: File, path: string) {
  return supabase.storage.from('event-posters').upload(path, file, { upsert: true })
}

export function getBrochurePublicUrl(path: string) {
  const { data } = supabase.storage.from('event-posters').getPublicUrl(path)
  return data.publicUrl
}

// ==================== RLS Status ====================

export async function checkRlsStatus(): Promise<{ eventsOk: boolean; membersOk: boolean }> {
  // Check if events can be read
  const { error: eventsErr } = await supabase.from('events').select('id').limit(1).maybeSingle()
  const eventsOk = !isRlsRecursionError(eventsErr)

  // Check if organization_members can be read
  const { error: membersErr } = await supabase.from('organization_members').select('id').limit(1).maybeSingle()
  const membersOk = !isRlsRecursionError(membersErr)

  return { eventsOk, membersOk }
}

// ==================== Superadmin ====================

export async function getAllOrganizations() {
  const { data, error } = await supabase.from('organizations').select('*').order('name')
  return { data: data as Organization[] | null, error }
}

export async function getAllEvents() {
  const { data, error } = await supabase.from('events').select('*, organizations(name)').order('created_at', { ascending: false })
  return { data: data as (CampusEvent & { organizations: Pick<Organization, 'name'> })[] | null, error }
}

export async function getAllProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  return { data: data as Profile[] | null, error }
}

// ==================== Ticketing (Phases 4-6) ====================

export interface SeatStatus {
  id: string
  capacity: number
  confirmed_count: number
  seats_left: number | null
}

/** Live seat/capacity rollup from the event_seat_status view. */
export async function getSeatStatus(eventId: string): Promise<{ data: SeatStatus | null; error: unknown }> {
  const { data, error } = await supabase
    .from('event_seat_status')
    .select('id, capacity, confirmed_count, seats_left')
    .eq('id', eventId)
    .maybeSingle()
  if (isRlsRecursionError(error)) return { data: null, error: new Error('RLS_RECURSION') }
  return { data: data as SeatStatus | null, error }
}

export interface AdmitResult {
  name: string | null
  unique_code: string | null
  already_admitted: boolean
  status: 'admitted' | 'already_admitted' | 'waitlisted' | 'not_found'
}

/** Call the admit_registration SECURITY DEFINER RPC (scans a qr_token). */
export async function admitByQrToken(qrToken: string): Promise<{ data: AdmitResult | null; error: unknown }> {
  const { data, error } = await supabase.rpc('admit_registration', { p_qr_token: qrToken })
  if (error) return { data: null, error }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { data: null, error: new Error('No result from admit RPC') }
  const status = (row.status as AdmitResult['status']) || 'not_found'
  return {
    data: {
      name: row.name ?? null,
      unique_code: row.unique_code ?? null,
      already_admitted: !!row.already_admitted,
      status,
    },
    error: null,
  }
}

/** Realtime subscription on event_responses for one event. */
export function subscribeToResponses(
  eventId: string,
  onChange: (payload: unknown) => void
) {
  const channel = supabase
    .channel(`event_responses:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_responses', filter: `event_id=eq.${eventId}` },
      (payload) => onChange(payload)
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
