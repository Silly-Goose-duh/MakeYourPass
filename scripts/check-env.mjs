/**
 * Prints whether each required environment variable is present (and its
 * length), never the value itself. Run with the shell env loaded, e.g.
 * `vercel env pull .env.local && node scripts/check-env.mjs`
 *
 * `VITE_GROQ_API_KEY` was removed from this list on 2026-10-15: the key used
 * to be inlined into the public JS bundle by Vite, so anyone could extract it
 * from the browser. Groq is now called through the authenticated serverless
 * proxy (`/api/poster-theme`, action `chat`) and reads the server-only
 * `GROQ_API_KEY`. If you still find `VITE_GROQ_API_KEY` defined anywhere, the
 * key must be rotated.
 */
const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'GROQ_API_KEY',
  'VITE_EMAILJS_SERVICE_ID',
  'VITE_EMAILJS_TEMPLATE_ID',
  'VITE_EMAILJS_PUBLIC_KEY',
]

const serverOnlyRequired = [
  // Server-to-server secret for the internal on-registration -> generate-ticket
  // hop. Without it an anonymous registrant gets an email with no ticket PNG.
  'INTERNAL_API_SECRET',
  'CRON_SECRET',
  'EVENT_TIMEZONE',
  'APP_ORIGIN',
  'SUPERADMIN_EMAILS',
]

const optional = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
]

// Should never be defined. If this prints, the Groq key is still public.
const forbidden = ['VITE_GROQ_API_KEY']

const report = (name, keys) => {
  for (const k of keys) {
    const v = process.env[k] || ''
    console.log(`${v ? 'OK     ' : 'MISSING'} ${k}${v ? ` (len=${v.length})` : ''}`)
  }
}

report('required:', required)
report('server-only:', serverOnlyRequired)
report('optional:', optional)

const leaked = forbidden.filter((k) => process.env[k])
if (leaked.length) {
  console.log('')
  console.error(`FORBIDDEN vars are set: ${leaked.join(', ')}`)
  console.error('These get inlined into the public JS bundle. Delete them and rotate the key.')
  process.exitCode = 1
}
