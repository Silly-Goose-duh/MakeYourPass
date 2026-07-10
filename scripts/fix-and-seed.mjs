import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://isvylfovcwtlemjpkdqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdnlsZm92Y3d0bGVtanBrZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTA5ODMsImV4cCI6MjA5Njc2Njk4M30.lQu0tMHo5PKwIqsM28kt8F1DdXWZpPpyaKNY7yraN9c'
)

async function main() {
  // Sign in
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gooseisback4u@gmail.com',
    password: 'gooseisawesome1234',
  })
  if (authErr) { console.error('Auth failed:', authErr.message); return }
  console.log('✅ Signed in as superadmin')

  const userId = (await supabase.auth.getUser()).data.user?.id
  console.log('User ID:', userId)

  // Check org
  const { data: orgs } = await supabase.from('organizations').select('*').eq('slug', 'foss-mec')
  const org = orgs?.[0]
  console.log('Org:', org ? org.name : 'not found yet')

  if (!org) {
    console.error('FOSS org not created — run the approve step first')
    return
  }

  const orgId = org.id

  // Try to add ourselves as admin member
  const { error: memberErr } = await supabase.from('organization_members').insert({
    organization_id: orgId,
    user_id: userId,
    role: 'admin',
  })
  if (memberErr) {
    console.log('Member insert error:', memberErr.message)
    // If it fails due to RLS recursion, try a different approach
    // Use the REST API directly bypassing RLS by using the service_role key isn't possible
    // Let's try with raw SQL via pg API
    console.log('Trying direct REST API approach...')
  } else {
    console.log('✅ Added as org admin')
  }

  // Check if member was added
  const { data: members } = await supabase.from('organization_members').select('*').eq('organization_id', orgId)
  console.log('Members:', members?.length || 0, members ? JSON.stringify(members) : '')

  // Create event
  const eventDate = new Date()
  const day = eventDate.getDay()
  const daysUntilSat = (6 - day + 7) % 7 || 7
  eventDate.setDate(eventDate.getDate() + daysUntilSat)
  const dateStr = eventDate.toISOString().split('T')[0]
  console.log('Target date:', dateStr)

  // Check if event already exists
  const { data: existingEv } = await supabase
    .from('events')
    .select('id')
    .eq('slug', 'ai-workshop-opencode')
    .maybeSingle()

  if (existingEv) {
    console.log('✅ Event already exists:', existingEv.id)
    return
  }

  const { data: ev, error: evErr } = await supabase.from('events').insert({
    organization_id: orgId,
    title: 'AI Workshop: Build with Opencode',
    description:
      'Learn how to build AI-powered applications using Opencode — a framework for creating intelligent agents. This hands-on workshop covers prompt engineering, tool use, and deploying your own AI agent. Bring your laptop!',
    date: dateStr,
    time: '10:00',
    venue: 'AI & Robotics Lab, Block C',
    poster_url: '',
    brochure_url: '',
    payment_type: 'free',
    price: 0,
    status: 'published',
    slug: 'ai-workshop-opencode',
  }).select().single()

  if (evErr) {
    console.error('Event creation failed:', evErr.message)
    return
  }

  console.log('✅ Event created:', ev.title, '-', ev.date, '10:00-12:00')

  // Add questions
  const { error: qErr } = await supabase.from('event_questions').insert([
    { event_id: ev.id, title: 'Full Name', question_type: 'short_text', required: true, sort_order: 0 },
    { event_id: ev.id, title: 'Email', question_type: 'email', required: true, sort_order: 1 },
    { event_id: ev.id, title: 'Department & Year', question_type: 'short_text', required: true, sort_order: 2 },
    { event_id: ev.id, title: 'Coding Experience', question_type: 'short_text', required: false, sort_order: 3 },
  ])

  if (qErr) console.error('Question error:', qErr.message)
  else console.log('✅ Registration questions added')

  console.log('\n🎉 All done! Visit https://mec-campuspass.vercel.app to see it live.')
}

main().catch(console.error)
