import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Event, TicketType, Order, Ticket } from '@/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const hasCredentials = !!(supabaseUrl && supabaseAnonKey)

if (!hasCredentials) {
  console.warn(
    '⚠️ Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  )
}

/**
 * Create a Supabase client, or a mock proxy that returns graceful errors
 * when credentials haven't been configured yet.
 */
function createSupabaseClient(): SupabaseClient {
  if (hasCredentials) {
    return createClient(supabaseUrl, supabaseAnonKey, {
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
  }

  // Mock proxy that returns promises rejecting with a helpful message
  const noop = () => Promise.resolve({ data: null, error: new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local') })
  const chainProxy = new Proxy(noop, {
    get(_target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
      if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') return undefined
      return chainProxy
    },
    apply() {
      return Promise.resolve({ data: null, error: new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local') })
    },
  })

  return new Proxy({} as SupabaseClient, {
    get(_, prop) {
      if (prop === 'auth') {
        return new Proxy({} as SupabaseClient['auth'], {
          get(_, method) {
            return (...args: any[]) => {
              console.warn(`Supabase.auth.${String(method)}() — not available (missing credentials)`)
              return Promise.resolve({ data: null, error: new Error('Supabase not configured') })
            }
          },
        })
      }
      if (prop === 'storage') {
        return new Proxy({} as SupabaseClient['storage'], {
          get(_, bucket) {
            return new Proxy({} as any, {
              get(_, method) {
                return (...args: any[]) => {
                  console.warn(`Supabase.storage.${String(bucket)}.${String(method)}() — not available (missing credentials)`)
                  return Promise.resolve({ data: null, error: new Error('Supabase not configured') })
                }
              },
            })
          },
        })
      }
      return chainProxy
    },
  })
}

export const supabase = createSupabaseClient()

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

export async function getPublicEvents(limit = 12, category?: string) {
  let query = supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date', { ascending: true })
    .limit(limit)

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  const { data, error } = await query
  return { data: data as Event[] | null, error }
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

// ==================== Order & Ticket Helpers ====================

export async function createOrder(order: {
  event_id: string
  ticket_type_id: string
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  quantity: number
  total_amount: number
  currency?: string
  payment_method?: string
  status?: string
}) {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      event_id: order.event_id,
      ticket_type_id: order.ticket_type_id,
      buyer_name: order.buyer_name,
      buyer_email: order.buyer_email,
      buyer_phone: order.buyer_phone || null,
      quantity: order.quantity,
      total_amount: order.total_amount,
      currency: order.currency || 'INR',
      payment_method: order.payment_method || 'free',
      status: order.status || 'confirmed',
    })
    .select()
    .single()

  return { data: data as Order | null, error }
}

export async function createTickets(tickets: {
  order_id: string
  event_id: string
  ticket_type_id: string
  qr_code: string
  qr_code_url: string
  attendee_name?: string
  attendee_email?: string
}[]) {
  const { data, error } = await supabase
    .from('tickets')
    .insert(tickets)
    .select()

  return { data: data as Ticket[] | null, error }
}

export async function getOrdersForEvent(eventId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  return { data: data as Order[] | null, error }
}

export async function getTicketsForEvent(eventId: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  return { data: data as Ticket[] | null, error }
}

export async function getTicketCountsForEvents(eventIds: string[]) {
  if (eventIds.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('ticket_types')
    .select('event_id, quantity, quantity_sold')
    .in('event_id', eventIds)
  return { data: data as { event_id: string; quantity: number; quantity_sold: number }[] | null, error }
}

export async function updateTicketTypeSales(ticketTypeId: string, quantitySold: number) {
  const { error } = await supabase
    .from('ticket_types')
    .update({ quantity_sold: quantitySold })
    .eq('id', ticketTypeId)

  return { error }
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