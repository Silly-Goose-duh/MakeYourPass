const keys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM',
  'GROQ_API_KEY',
  'VITE_EMAILJS_SERVICE_ID',
  'VITE_EMAILJS_TEMPLATE_ID',
  'VITE_EMAILJS_PUBLIC_KEY',
  'VITE_GROQ_API_KEY',
]
for (const k of keys) {
  const v = process.env[k] || ''
  console.log(`${k}: len=${v.length} prefix=${v ? v.slice(0, 8) : 'EMPTY'}`)
}
