import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const url = text.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1].trim()
const anon = text.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)?.[1].trim()
const sb = createClient(url, anon)

const slug = 'ai-workshop-opencode'
// 1) RPC published events — does the slug appear?
const { data: rpc } = await sb.rpc('get_published_events')
const viaRpc = (rpc || []).find(e => e.slug === slug)
console.log('via RPC found:', !!viaRpc, viaRpc ? { status: viaRpc.status, title: viaRpc.title } : null)

// 2) Direct select by slug (anon)
const { data: direct, error } = await sb.from('events').select('id,slug,status,title,poster_url').eq('slug', slug).maybeSingle()
console.log('direct select:', error ? 'ERR:' + error.message : JSON.stringify(direct))

// 3) Is it published?
const all = await sb.rpc('get_published_events')
console.log('all published slugs:', (all.data || []).map(e => `${e.slug}(${e.status})`))
