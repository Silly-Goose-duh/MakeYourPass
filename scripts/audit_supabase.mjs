// Probe live Supabase: auth ping, published events RPC, RLS recursion detection.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = text.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1].trim()
const anon = text.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)?.[1].trim()
const sb = createClient(url, anon)

const out = {}
// 1) Can we reach the DB at all?
try {
  const { data, error } = await sb.from('events').select('id').limit(1)
  out.events_direct = error ? `ERR:${error.message}` : `OK rows=${data.length}`
} catch (e) { out.events_direct = 'THREW:' + e.message }

// 2) Try the SECURITY DEFINER RPC the app prefers
try {
  const { data, error } = await sb.rpc('get_published_events')
  out.rpc_published = error ? `ERR:${error.message}` : `OK rows=${data?.length ?? 0}`
} catch (e) { out.rpc_published = 'THREW:' + e.message }

// 3) Organizations visibility
try {
  const { data, error } = await sb.from('organizations').select('id,name,is_approved').eq('is_approved', true).limit(5)
  out.orgs = error ? `ERR:${error.message}` : `OK rows=${data.length}`
} catch (e) { out.orgs = 'THREW:' + e.message }

console.log(JSON.stringify(out, null, 2))
