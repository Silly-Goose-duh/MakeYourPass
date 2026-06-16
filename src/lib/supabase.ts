import { createClient } from '@supabase/supabase-js'
import type { Profile, Organization, OrganizationMember, OrgRegistrationRequest, CampusEvent, EventQuestion, EventResponse, ResponseAnswer } from '@/types'

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
    get(_, p) {
      if (p === 'auth') return new Proxy({} as ReturnType<typeof createClient>['auth'], {
        get(_, m) { return () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) },
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
  return { data: data as any[] | null, error }
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
  return { data: data as (OrganizationMember & { organizations: Organization })[] | null, error }
}

export async function getOrgMembers(orgId: string) {
  const { data, error } = await supabase.from('organization_members').select('*').eq('organization_id', orgId)
  return { data: data as OrganizationMember[] | null, error }
}

// ==================== Events ====================

export async function getPublishedEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*, organizations(name, slug, logo_url)')
    .eq('status', 'published')
    .order('date', { ascending: true })
  return { data: data as (CampusEvent & { organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'> })[] | null, error }
}

export async function getEventsByOrganization(orgId: string, filterStatus: string = 'all') {
  let query = supabase.from('events').select('*').eq('organization_id', orgId)
  if (filterStatus !== 'all') {
    query = query.eq('status', filterStatus)
  }
  const { data, error } = await query.order('created_at', { ascending: false })
  return { data: data as CampusEvent[] | null, error }
}

export async function getEventBySlug(slug: string) {
  const { data, error } = await supabase.from('events').select('*, organizations(name, slug, logo_url, description)').eq('slug', slug).single()
  return { data: data as CampusEvent & { organizations: Organization } | null, error }
}

export async function getEventById(id: string) {
  const { data, error } = await supabase.from('events').select('*, organizations(name, slug, logo_url)').eq('id', id).single()
  return { data: data as CampusEvent & { organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'> } | null, error }
}

export async function createEvent(event: Partial<CampusEvent>) {
  const { data, error } = await supabase.from('events').insert(event).select().single()
  return { data: data as CampusEvent | null, error }
}

export async function updateEvent(id: string, updates: Partial<CampusEvent>) {
  const { data, error } = await supabase.from('events').update(updates).eq('id', id).select().single()
  return { data: data as CampusEvent | null, error }
}

// ==================== Event Questions ====================

export async function getEventQuestions(eventId: string) {
  const { data, error } = await supabase.from('event_questions').select('*').eq('event_id', eventId).order('sort_order')
  return { data: data as EventQuestion[] | null, error }
}

export async function saveEventQuestions(eventId: string, questions: { title: string; description: string; question_type: string; options: string[]; required: boolean; sort_order: number }[]) {
  const { error: deleteError } = await supabase.from('event_questions').delete().eq('event_id', eventId)
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
  return { data: data as EventQuestion[] | null, error }
}

// ==================== Event Responses ====================

export async function submitEventResponse(eventId: string, data: { respondent_name: string; respondent_email: string; respondent_phone?: string }) {
  const { data: result, error } = await supabase.from('event_responses').insert({ event_id: eventId, ...data }).select().single()
  return { data: result as EventResponse | null, error }
}

export async function submitResponseAnswers(responseId: string, answers: { question_id: string; value: string }[]) {
  if (answers.length === 0) return { data: [] as ResponseAnswer[], error: null }
  const inserts = answers.map(a => ({ response_id: responseId, question_id: a.question_id, value: a.value }))
  const { data, error } = await supabase.from('response_answers').insert(inserts).select()
  return { data: data as ResponseAnswer[] | null, error }
}

export async function getEventResponses(eventId: string) {
  const { data, error } = await supabase.from('event_responses').select('*').eq('event_id', eventId).order('submitted_at', { ascending: false })
  return { data: data as EventResponse[] | null, error }
}

export async function getResponseAnswers(responseIds: string[]) {
  if (responseIds.length === 0) return { data: [] as ResponseAnswer[], error: null }
  const { data, error } = await supabase.from('response_answers').select('*').in('response_id', responseIds)
  return { data: data as ResponseAnswer[] | null, error }
}

// ==================== Analytics ====================

export async function getEventAnalytics(eventId: string) {
  const { data, error } = await supabase.rpc('get_event_analytics', { event_id_param: eventId })
  return { data: data as any, error }
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
