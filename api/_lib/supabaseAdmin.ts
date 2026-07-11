import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for serverless functions.
 * Uses SUPABASE_SERVICE_ROLE_KEY (server-only, never to the browser).
 * Bypasses RLS — only call from trusted API routes.
 */
export function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) throw new Error('Supabase service role not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}
