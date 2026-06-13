import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envRaw = readFileSync('.env.local', 'utf-8')
const envVars = Object.fromEntries(
  envRaw.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const [k, ...v] = l.split('=')
    return [k.trim(), v.join('=').trim()]
  })
)

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY)

async function main() {
  // Sign in with email/password from env or prompt
  const email = 'gooseisback4u@gmail.com'
  const password = process.env.TEST_PASSWORD || ''

  if (!password) {
    console.log('Set TEST_PASSWORD env var or use the website to create an event manually.')
    console.log('Go to https://makeyourpass.vercel.app → Dashboard → Create Event')
    process.exit(0)
  }

  const { data: { user }, error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
  if (loginErr) { console.error('Login failed:', loginErr.message); process.exit(1) }
  console.log('Logged in as:', user.email)

  // Find or create org
  let { data: orgs } = await supabase.from('organizations').select('id').eq('owner_id', user.id).limit(1)
  let orgId
  if (!orgs || orgs.length === 0) {
    const { data: newOrg } = await supabase.from('organizations').insert({
      name: 'Test Organization',
      slug: 'test-org-' + Date.now(),
      owner_id: user.id,
    }).select('id').single()
    orgId = newOrg.id
    console.log('Created org:', orgId)
  } else {
    orgId = orgs[0].id
    console.log('Using existing org:', orgId)
  }

  // Create test event
  const { data: event, error: evErr } = await supabase.from('events').insert({
    org_id: orgId,
    title: 'Tech Summit 2026 — Test Event',
    slug: 'tech-summit-2026-test',
    description: 'A test event to verify the registration and email flow. This is a fake event for testing purposes.',
    short_description: 'Test your registration and email flow here',
    venue_name: 'Test Convention Center',
    city: 'Bangalore',
    state: 'Karnataka',
    start_date: '2026-07-15',
    end_date: '2026-07-16',
    start_time: '09:00',
    end_time: '18:00',
    timezone: 'Asia/Kolkata',
    category: 'conference',
    status: 'published',
    visibility: 'public',
    max_attendees: 100,
  }).select('id').single()

  if (evErr) { console.error('Event error:', evErr); process.exit(1) }
  console.log('✅ Created event:', event.id)

  // Create ticket types
  const tickets = [
    { name: 'Early Bird', price: 0, quantity: 50, max_per_order: 5, sort_order: 0 },
    { name: 'General Admission', price: 0, quantity: 50, max_per_order: 5, sort_order: 1 },
  ]

  for (const ticket of tickets) {
    const { error: tErr } = await supabase.from('ticket_types').insert({
      event_id: event.id, ...ticket, is_active: true, currency: 'INR',
    })
    if (tErr) console.error('Ticket error:', tErr)
    else console.log(`  Created ticket: ${ticket.name}`)
  }

  console.log('\n🌐 https://makeyourpass.vercel.app/event/tech-summit-2026-test')
}

main().catch(console.error)
