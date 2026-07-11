// ============================================================
// CAMPUSPASS — Type Definitions
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
  created_at: string
  updated_at: string
  member_count?: number
  event_count?: number
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: 'admin' | 'member'
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
  status: 'draft' | 'published' | 'cancelled'
  response_count: number
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

export interface EventResponse {
  id: string
  event_id: string
  respondent_name: string
  respondent_email: string
  respondent_phone: string
  submitted_at: string
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
