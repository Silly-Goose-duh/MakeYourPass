import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = text.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1].trim()
const anon = text.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)?.[1].trim()
const sb = createClient(url, anon)

// 1) Any superadmin / org-admin users?
const { data: profs } = await sb.from('profiles').select('id,email,is_superadmin,full_name').limit(20)
console.log('PROFILES:', (profs||[]).map(p => `${p.email||p.id} superadmin=${!!p.is_superadmin}`))

// 2) Storage bucket exists + public?
const { data: buckets } = await sb.storage.listBuckets()
console.log('BUCKETS:', (buckets||[]).map(b => `${b.name}(public=${b.public})`))

// 3) Can anon read the bucket's public URL form? (no upload; just check public accessor)
const { data: pub } = sb.storage.from('event-posters').getPublicUrl('nope.png')
console.log('PUBLIC_URL_SAMPLE:', pub?.publicUrl)
