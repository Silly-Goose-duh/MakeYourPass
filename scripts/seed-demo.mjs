import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://isvylfovcwtlemjpkdqp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdnlsZm92Y3d0bGVtanBrZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTA5ODMsImV4cCI6MjA5Njc2Njk4M30.lQu0tMHo5PKwIqsM28kt8F1DdXWZpPpyaKNY7yraN9c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function main() {
  // 1. Sign in as superadmin
  console.log('🔑 Signing in as superadmin...')
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'gooseisback4u@gmail.com',
    password: 'gooseisawesome1234',
  })
  if (authError) { console.error('Auth error:', authError.message); return }
  console.log('✅ Signed in as:', authData.user?.email)

  // 2. Check if FOSS Club @ MEC already exists
  console.log('\n🔍 Checking for existing FOSS organizations...')
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('*')
    .ilike('name', '%foss%')
  if (orgsError) { console.error('Org query error:', orgsError.message) }

  let orgId
  let orgSlug

  if (orgs && orgs.length > 0) {
    console.log('✅ Found existing FOSS org:', orgs[0].name)
    orgId = orgs[0].id
    orgSlug = orgs[0].slug
  } else {
    // Check for pending requests
    const { data: pendingReqs } = await supabase
      .from('organization_registration_requests')
      .select('id')
      .eq('slug', 'foss-mec')
      .eq('status', 'pending')
      .maybeSingle()

    let reqId = pendingReqs?.id

    if (!reqId) {
      console.log('📝 Creating organization registration request...')
      const name = 'FOSS Club @ MEC'
      const slug = 'foss-mec'
      const description = 'Free and Open Source Software Club at Marian Engineering College — promoting open-source culture, Linux, and collaborative development.'

      const { data: requestData, error: requestError } = await supabase.rpc(
        'create_organization_request',
        { org_name: name, org_slug: slug, org_description: description }
      )
      if (requestError && !requestError.message.includes('already have a pending')) {
        console.error('Request error:', requestError.message); return
      }
      reqId = typeof requestData === 'string' ? requestData : requestData?.id
    }

    if (!reqId) {
      // Try looking up by slug
      const { data: lookupReq } = await supabase
        .from('organization_registration_requests')
        .select('id')
        .eq('slug', 'foss-mec')
        .maybeSingle()
      reqId = lookupReq?.id
    }

    if (reqId) {
      console.log('✅ Approving request:', reqId)
      const { data: approveData, error: approveError } = await supabase.rpc(
        'approve_organization_request',
        { request_id: reqId }
      )
      if (approveError) { console.error('Approve error:', approveError.message); return }
      console.log('✅ Org approved:', approveData)
      orgId = approveData?.organization_id
      orgSlug = 'foss-mec'
    }
  }

  if (!orgId) {
    // Try to find the org by slug
    const { data: foundOrg } = await supabase
      .from('organizations')
      .select('id, slug')
      .eq('slug', 'foss-mec')
      .maybeSingle()
    if (foundOrg) {
      orgId = foundOrg.id
      orgSlug = foundOrg.slug
      console.log('✅ Found org by slug:', orgSlug)
    } else {
      console.error('❌ Could not find or create FOSS org')
      return
    }
  }

  console.log(`📋 Org ID: ${orgId}, Slug: ${orgSlug}`)

  // 4. Create an event
  console.log('\n📅 Creating event...')

  // Calculate dates for this week
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  // Next Saturday (or today if Saturday)
  const daysUntilSat = dayOfWeek <= 6 ? (6 - dayOfWeek) : 0
  const eventDate = new Date(now)
  eventDate.setDate(now.getDate() + daysUntilSat + (daysUntilSat === 0 && now.getHours() >= 12 ? 7 : 0))
  // If today is Saturday but past 12PM, go to next Saturday
  if (dayOfWeek === 6 && now.getHours() >= 12) {
    eventDate.setDate(eventDate.getDate() + 7)
  }

  const dateStr = eventDate.toISOString().split('T')[0]

  const { data: eventCheck, error: checkError } = await supabase
    .from('events')
    .select('id')
    .eq('title', 'AI Workshop: Build with Opencode')
    .maybeSingle()

  if (checkError) { console.error('Event check error:', checkError.message) }

  if (eventCheck) {
    console.log('✅ Event already exists with ID:', eventCheck.id)
  } else {
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .insert({
        organization_id: orgId,
        title: 'AI Workshop: Build with Opencode',
        description: 'Learn how to build AI-powered applications using Opencode — a framework for creating intelligent agents. This hands-on workshop covers prompt engineering, tool use, and deploying your own AI agent. Bring your laptop!',
        date: dateStr,
        time: '10:00',
        venue: 'AI & Robotics Lab, Block C',
        poster_url: '',
        brochure_url: '',
        payment_type: 'free',
        price: 0,
        status: 'published',
        slug: 'ai-workshop-opencode-' + dateStr,
        created_by: authData.user.id,
      })
      .select()
      .single()

    if (eventError) { console.error('Event creation error:', eventError.message); return }
    console.log(`✅ Event created: "${eventData.title}" on ${eventData.date} (10:00 AM - 12:00 PM)`)
    console.log(`   Venue: ${eventData.venue}`)
    console.log(`   Slug: ${eventData.slug}`)
  }

  // 5. Add a few basic registration questions
  let targetEventId = eventCheck?.id
  if (!targetEventId) {
    const { data: ev } = await supabase
      .from('events')
      .select('id')
      .eq('title', 'AI Workshop: Build with Opencode')
      .maybeSingle()
    targetEventId = ev?.id
  }

  const { data: existingQuestions } = targetEventId
    ? await supabase.from('event_questions').select('id').eq('event_id', targetEventId).limit(1)
    : { data: null }

  if (targetEventId && (!existingQuestions || existingQuestions.length === 0)) {
    console.log('\n📝 Adding registration questions...')
    const questions = [
      { event_id: targetEventId, title: 'Full Name', question_type: 'short_text', required: true, sort_order: 0 },
      { event_id: targetEventId, title: 'Email', question_type: 'email', required: true, sort_order: 1 },
      { event_id: targetEventId, title: 'Department & Year', question_type: 'short_text', required: true, sort_order: 2 },
      { event_id: targetEventId, title: 'Do you have prior coding experience?', question_type: 'short_text', required: false, sort_order: 3 },
    ]
    const { error: qError } = await supabase.from('event_questions').insert(questions)
    if (qError) { console.error('Question creation error:', qError.message) }
    else { console.log('✅ Registration questions added') }
  }

  console.log('\n🎉 Done! FOSS Club @ MEC is ready with an AI Workshop event.')
}

main().catch(console.error)
