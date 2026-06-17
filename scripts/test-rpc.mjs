import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://isvylfovcwtlemjpkdqp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdnlsZm92Y3d0bGVtanBrZHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTA5ODMsImV4cCI6MjA5Njc2Njk4M30.lQu0tMHo5PKwIqsM28kt8F1DdXWZpPpyaKNY7yraN9c'
)

await s.auth.signInWithPassword({ email: 'gooseisback4u@gmail.com', password: 'gooseisawesome1234' })

const tests = [
  ['is_superadmin', {}],
  ['get_organizations_with_counts', {}],
  ['get_organization_events', { org_id: 'ec9d8256-c7b9-4921-8d77-e8d07a45df33', filter_status: 'all' }],
  ['get_event_analytics', { event_id_param: '00000000-0000-0000-0000-000000000000' }],
  ['get_published_events', {}],
  ['create_event', { org_id: 'ec9d8256-c7b9-4921-8d77-e8d07a45df33', event_title: 'Test', event_slug: 'test-' + Date.now() }],
]

for (const [name, params] of tests) {
  try {
    const { data, error } = await s.rpc(name, params)
    const status = error ? 'ERR: ' + error.message.substring(0, 100) : 'OK: ' + JSON.stringify(data).substring(0, 120)
    console.log(name + ' -> ' + status)
  } catch (e) {
    console.log(name + ' -> EXC: ' + e.message.substring(0, 80))
  }
}
