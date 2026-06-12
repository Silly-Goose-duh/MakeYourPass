// ==================== User & Auth ====================

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url?: string
  description?: string
  owner_id: string
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  invited_email?: string
  status: 'active' | 'invited' | 'declined'
  created_at: string
}

// ==================== Events ====================

export interface Event {
  id: string
  org_id: string
  title: string
  slug: string
  description: string
  short_description?: string
  cover_image_url?: string
  venue_name?: string
  venue_address?: string
  city?: string
  state?: string
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  timezone: string
  category: EventCategory
  status: EventStatus
  visibility: 'public' | 'private' | 'unlisted'
  max_attendees?: number
  form_link?: string
  use_external_form?: boolean
  created_at: string
  updated_at: string
}

export type EventCategory = 
  | 'conference'
  | 'workshop'
  | 'meetup'
  | 'festival'
  | 'concert'
  | 'sports'
  | 'networking'
  | 'college_fest'
  | 'webinar'
  | 'other'

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed' | 'archived'

// ==================== Tickets ====================

export interface TicketType {
  id: string
  event_id: string
  name: string
  description?: string
  price: number
  currency: string
  quantity: number
  quantity_sold: number
  max_per_order: number
  sales_start?: string
  sales_end?: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Order {
  id: string
  event_id: string
  ticket_type_id: string
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  quantity: number
  total_amount: number
  currency: string
  status: OrderStatus
  payment_method: PaymentMethod
  payment_id?: string
  promo_code?: string
  discount_amount?: number
  created_at: string
  updated_at: string
}

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded'
export type PaymentMethod = 'razorpay' | 'slice' | 'free'

// ==================== Tickets (issued) ====================

export interface Ticket {
  id: string
  order_id: string
  event_id: string
  ticket_type_id: string
  attendee_name?: string
  attendee_email?: string
  attendee_phone?: string
  qr_code: string
  qr_code_url: string
  status: TicketStatus
  checked_in_at?: string
  checked_in_by?: string
  created_at: string
}

export type TicketStatus = 'active' | 'used' | 'cancelled' | 'refunded'

// ==================== Check-in ====================

export interface CheckIn {
  id: string
  ticket_id: string
  event_id: string
  checked_in_by: string
  checked_in_at: string
  method: 'scan' | 'manual'
  notes?: string
}

// ==================== Analytics ====================

export interface EventAnalytics {
  total_tickets: number
  total_sold: number
  total_revenue: number
  total_checked_in: number
  tickets_by_type: {
    ticket_type_id: string
    ticket_name: string
    total: number
    sold: number
    checked_in: number
    revenue: number
  }[]
  daily_sales: {
    date: string
    tickets: number
    revenue: number
  }[]
  check_in_rate: number
}

// ==================== Coupons ====================

export interface Coupon {
  id: string
  event_id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  max_uses?: number
  current_uses: number
  min_order_amount?: number
  max_discount_amount?: number
  valid_from?: string
  valid_until?: string
  is_active: boolean
  created_at: string
}

// ==================== Notifications ====================

export interface NotificationTemplate {
  id: string
  event_id?: string
  org_id: string
  type: 'email' | 'whatsapp'
  trigger: 'registration' | 'check_in' | 'reminder' | 'cancellation'
  subject?: string
  body: string
  is_active: boolean
}

// ==================== Integrations ====================

export interface Integration {
  id: string
  org_id: string
  provider: 'razorpay' | 'slice' | 'stripe'
  api_key?: string
  webhook_secret?: string
  is_active: boolean
  created_at: string
}