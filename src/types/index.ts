// ============================================================
// MakeYourPass — Type Definitions
// ============================================================

export interface Profile {
  id: string
  full_name: string
  email: string
  is_superadmin: boolean
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  description: string
  logo_url: string
  is_approved: boolean
  upi_id?: string
  upi_phone?: string
  upi_qr_url?: string
  cover_url?: string
  website?: string
  instagram?: string
  contact_email?: string
  contact_phone?: string
  created_at: string
  updated_at: string
  member_count?: number
  event_count?: number
}

export interface OrgExecomMember {
  id: string
  organization_id: string
  full_name: string
  role_title: string
  photo_url: string
  sort_order: number
  created_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: 'admin' | 'host' | 'member'
  created_at: string
}

export interface OrgRegistrationRequest {
  id: string
  user_id: string
  organization_name: string
  organization_slug: string
  description: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export interface CampusEvent {
  id: string
  organization_id: string
  title: string
  slug: string
  description: string
  poster_url: string
  brochure_url: string
  date: string | null
  time: string | null
  venue: string
  form_type: 'brochure' | 'manual'
  payment_type: 'free' | 'paid'
  price: number
  capacity: number
  id_prefix: string | null
  registration_counter: number
  status: 'draft' | 'published' | 'cancelled'
  response_count: number
  ticket_template_url?: string
  certificate_template_url?: string
  ended_at?: string | null
  created_at: string
  updated_at: string
  organization?: Organization
}

export interface EventQuestion {
  id: string
  event_id: string
  title: string
  description: string
  question_type: 'short_text' | 'paragraph' | 'multiple_choice' | 'checkboxes' | 'dropdown' | 'linear_scale'
  options: string[]
  required: boolean
  sort_order: number
  created_at: string
}

export type PaymentStatus = 'na' | 'pending' | 'verified' | 'rejected'

export interface EventResponse {
  id: string
  event_id: string
  respondent_name: string
  respondent_email: string
  respondent_phone: string
  submitted_at: string
  unique_code: string | null
  qr_token: string
  status: 'confirmed' | 'waitlisted' | 'cancelled'
  admitted_at: string | null
  admitted_by: string | null
  ticket_url: string | null
  email_sent_at: string | null
  payment_proof_url?: string
  payment_status?: PaymentStatus
  payment_verified_at?: string | null
  certificate_url?: string | null
  certificate_sent_at?: string | null
  reminder_sent_at?: string | null
}

export interface ResponseAnswer {
  id: string
  response_id: string
  question_id: string
  value: string
  created_at: string
}

export interface FormQuestion {
  id?: string
  title: string
  description: string
  question_type: 'short_text' | 'paragraph' | 'multiple_choice' | 'checkboxes' | 'dropdown' | 'linear_scale'
  options: string[]
  required: boolean
  sort_order: number
}
