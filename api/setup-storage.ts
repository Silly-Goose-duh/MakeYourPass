/**
 * POST /api/setup-storage
 *
 * One-shot admin helper: ensure Supabase storage buckets + public policies
 * exist for posters and tickets. Uses SUPABASE_SERVICE_ROLE_KEY.
 *
 * Body: { secret: string }  — must match SETUP_SECRET env (or a hard-coded
 * bootstrap secret for first run). Safe to call repeatedly (idempotent).
 *
 * Remove or disable this endpoint after first successful run in production.
 */

export const config = { runtime: 'nodejs' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const expected = process.env.SETUP_SECRET || 'makeyourpass-setup-2026'
    if (!body?.secret || body.secret !== expected) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabaseMod = await import('@supabase/supabase-js')
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return res.status(500).json({
        error: 'Missing Supabase credentials',
        hasUrl: !!url,
        hasServiceRole: !!key,
      })
    }

    const sb = supabaseMod.createClient(url, key, { auth: { persistSession: false } })
    const results: Record<string, unknown> = {}

    // Create buckets via Storage API (service role)
    const buckets = [
      {
        id: 'event-posters',
        options: {
          public: true,
          fileSizeLimit: 5242880,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
        },
      },
      {
        id: 'tickets',
        options: {
          public: true,
          fileSizeLimit: 2097152,
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
        },
      },
    ]

    for (const b of buckets) {
      const { data: existing } = await sb.storage.getBucket(b.id)
      if (existing) {
        const { error } = await sb.storage.updateBucket(b.id, b.options)
        results[b.id] = error ? { status: 'update_error', message: error.message } : { status: 'updated' }
      } else {
        const { error } = await sb.storage.createBucket(b.id, b.options)
        results[b.id] = error ? { status: 'create_error', message: error.message } : { status: 'created' }
      }
    }

    // Verify
    const { data: list, error: listErr } = await sb.storage.listBuckets()
    results.buckets = listErr
      ? { error: listErr.message }
      : (list || []).map((x: { id: string; public: boolean }) => ({ id: x.id, public: x.public }))

    return res.status(200).json({ ok: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
}
