/**
 * Pre-deploy doctor. Run this BEFORE `vercel --prod`.
 *
 *   node scripts/doctor.mjs
 *
 * Exists because of a real incident on 2026-10-15: the hardening commit
 * deployed cleanly, `npm run verify` was green and `vercel build` succeeded,
 * but the configured Supabase project no longer resolved in DNS, so every
 * endpoint that touched the database returned a bare 500. Build success proves
 * nothing about whether the app can actually serve traffic.
 *
 * Exits non-zero on any hard failure. Uses only Node built-ins.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://isvylfovcwtlemjpkdqp.supabase.co'
const ANON = process.env.VITE_SUPABASE_ANON_KEY || ''

const results = []
const ok = (n, d = '') => results.push({ level: 'PASS', n, d })
const warn = (n, d = '') => results.push({ level: 'WARN', n, d })
const bad = (n, d = '') => results.push({ level: 'FAIL', n, d })

// ── 1. Env vars ──────────────────────────────────────────────────────────────
const required = ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RESEND_FROM', 'CRON_SECRET']
for (const k of required) {
  ;(process.env[k] ? ok : bad)(`env ${k}`, process.env[k] ? '' : 'not set')
}
if (process.env.INTERNAL_API_SECRET) ok('env INTERNAL_API_SECRET')
else warn('env INTERNAL_API_SECRET', 'anonymous registrations will email without a ticket PNG')

// ── 2. The database must actually exist ──────────────────────────────────────
let host
try {
  host = new URL(SUPABASE_URL).hostname
} catch {
  bad('supabase url', `VITE_SUPABASE_URL is not a URL: ${SUPABASE_URL}`)
}

if (host) {
  let dnsOk = false
  let dnsErr = null
  try {
    const { lookup } = await import('node:dns/promises')
    await lookup(host)
    dnsOk = true
  } catch (e) {
    dnsErr = e
    bad('supabase DNS', `${host} does not resolve (${e.code || e.message}). The project may be deleted, renamed, or torn down. Nothing that touches the database will work.`)
  }
  if (dnsOk) ok('supabase DNS', host)

  if (dnsOk && ANON) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/events?select=id&limit=1`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      })
      if (r.ok) ok('supabase REST', `events responded ${r.status}`)
      else bad('supabase REST', `events responded ${r.status} — ${(await r.text()).slice(0, 160)}`)
    } catch (e) {
      bad('supabase REST', String(e).slice(0, 160))
    }
  } else if (dnsOk && !ANON) {
    warn('supabase REST', 'VITE_SUPABASE_ANON_KEY not set locally; skipped live query')
  }
}

// ── 3. Leaked client secrets ─────────────────────────────────────────────────
if (process.env.VITE_GROQ_API_KEY) {
  bad('leaked key', 'VITE_GROQ_API_KEY is set — Vite inlines it into the public JS bundle. Remove it and rotate the Groq key.')
} else {
  ok('leaked key', 'VITE_GROQ_API_KEY not set')
}

// ── 4. Vercel function budget (Hobby = 12) ───────────────────────────────────
try {
  const { readdirSync } = await import('node:fs')
  const dir = new URL('../api/', import.meta.url)
  const fns = readdirSync(dir).filter((f) => f.endsWith('.ts'))
  if (fns.length > 12) {
    bad('vercel functions', `${fns.length} endpoints exceeds the Hobby cap of 12 — merge one or upgrade`)
  } else if (fns.length === 12) {
    warn('vercel functions', `12/12 — at the Hobby cap. The next endpoint will fail the build.`)
  } else {
    ok('vercel functions', `${fns.length}/12`)
  }
} catch { /* non-fatal */ }

// ── Report ───────────────────────────────────────────────────────────────────
const icon = { PASS: '  ok  ', WARN: ' warn ', FAIL: ' FAIL ' }
console.log('\nMakeYourPass doctor\n' + '-'.repeat(64))
for (const r of results) console.log(`${icon[r.level]}${r.n}${r.d ? ` — ${r.d}` : ''}`)
const fails = results.filter((r) => r.level === 'FAIL').length
console.log('-'.repeat(64))
console.log(fails ? `${fails} hard failure(s). Do NOT deploy.` : 'No hard failures.\n')
process.exit(fails ? 1 : 0)
