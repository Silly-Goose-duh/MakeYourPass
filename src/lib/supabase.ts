import { createClient } from '@supabase/supabase-js'
import type { Event, TicketType } from '@/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// ==================== Auth Helpers ====================

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })
  return { data, error }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  return { data, error }
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function createOrganization(name: string, slug: string, description?: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      description,
      owner_id: user.id,
    })
    .select()
    .single()

  return { data, error }
}

export async function getOrganizations() {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function getEvents(orgId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('org_id', orgId)
    .order('start_date', { ascending: false })
  return { data, error }
}

export async function getEvent(eventSlug: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('slug', eventSlug)
    .single()
  return { data, error }
}

export async function createEvent(event: Partial<Event>) {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single()
  return { data, error }
}

export async function updateEvent(id: string, updates: Partial<Event>) {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function getTicketTypes(eventId: string) {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  return { data, error }
}

export async function createTicketType(ticketType: Partial<TicketType>) {
  const { data, error } = await supabase
    .from('ticket_types')
    .insert(ticketType)
    .select()
    .single()
  return { data, error }
}

export async function getEventAnalytics(eventId: string) {
  const { data, error } = await supabase
    .rpc('get_event_analytics', { event_id_param: eventId })
  return { data, error }
}

export async function uploadEventImage(file: File, path: string) {
  const { data, error } = await supabase.storage
    .from('event-images')
    .upload(path, file)
  return { data, error }
}

export async function getEventImage(path: string) {
  const { data } = supabase.storage
    .from('event-images')
    .getPublicUrl(path)
  return data.publicUrl
}