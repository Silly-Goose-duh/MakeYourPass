/**
 * POST /api/poster-theme
 *
 * ONE function, two actions, because Vercel's Hobby plan hard-caps a
 * deployment at 12 serverless functions and this project already sits at the
 * ceiling (several endpoints here are deliberately merged, each with an
 * `action` discriminator).
 *
 *   action: 'theme'  (default) → analyse an event poster, return a colour palette
 *   action: 'chat'             → generic Groq chat-completions proxy
 *
 * ── Why the Groq key lives here and not in the browser ──────────────────────
 * `src/lib/groq.ts` used to read `import.meta.env.VITE_GROQ_API_KEY`. Vite
 * INLINES every `VITE_*` variable into the shipped bundle, so the key was
 * readable by anyone who opened devtools and could be lifted straight out to
 * bill or abuse the account. The key is now read only from `process.env`
 * (`GROQ_API_KEY`, a server env var on Vercel) and is never returned.
 *
 * ── Auth ───────────────────────────────────────────────────────────────────
 *   action 'theme' → allowed anonymously. The public registration form
 *                    (`PublicEventForm.tsx`) themes itself from the poster, and
 *                    that page is reachable without an account. It is instead
 *                    protected by a per-IP rate limit, a strict URL validator
 *                    and output shape-checking, because it is a paid upstream
 *                    call anyone on the internet could otherwise loop.
 *   action 'chat'  → requires `Authorization: Bearer <supabase access token>`.
 *                    AI document parsing is an authenticated feature.
 *
 * ── Legacy response shape (action 'theme') ──────────────────────────────────
 *   Unchanged, because PublicEventForm.tsx consumes it:
 *   { palette: {primary,secondary,accent,background,text}, vibe, isDark,
 *     suggestedAccent }
 *
 * ── Vercel bundler constraint ──────────────────────────────────────────────
 * `./_lib/*` is dynamically imported INSIDE the handler. Top-level imports of
 * shared modules crashed the function bundler on this project — see the header
 * comment in api/generate-ticket.ts.
 */

export const config = { runtime: 'nodejs' }

/* eslint-disable @typescript-eslint/no-explicit-any -- Vercel gives us untyped req/res. */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Pinned per action. The caller cannot choose a model, so it cannot rack up
 *  spend on an expensive one. */
const MODELS: Record<'vision' | 'text', string> = {
  vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
  text: 'llama-3.3-70b-versatile',
}

const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 1000

/** Groq accepts at most 5 images per request. */
const MAX_IMAGES = 5
/** ~4MB of base64 per image is Groq's documented ceiling; stay under it. */
const MAX_IMAGE_B64_CHARS = 3_500_000
/** Whole-request guard so a huge paste cannot be used as free storage. */
const MAX_TEXT_CHARS = 20_000
/** Theme action fetches a remote image server-side — keep the payload sane. */
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024

const THEME_PROMPT = `You are a design analyst. Look at this event poster image and extract its color theme and mood.

Return ONLY valid JSON with this exact structure:
{
  "primary": "#RRGGBB (the dominant brand color)",
  "secondary": "#RRGGBB (a supporting color)",
  "accent": "#RRGGBB (a bright pop color, good for buttons/highlights)",
  "background": "#RRGGBB (overall background tone, light or dark)",
  "text": "#RRGGBB (legible text color that works on the background)",
  "vibe": "one or two words describing the mood (e.g. energetic, calm, festive, techy, elegant)",
  "isDark": false  // true if the background is predominantly dark
}

Rules:
- Always return real 6-digit hex codes.
- Prefer high-contrast, accessible combinations.
- The "accent" should be vivid and eye-catching for call-to-action buttons.`

function isMode(v: unknown): v is 'vision' | 'text' {
  return v === 'vision' || v === 'text'
}

/** Clamp a caller-supplied sampling budget into a sane band. */
function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Validate the `messages` array we are about to relay and count any images.
 * Returns null when the payload is not something we are willing to forward.
 */
function sanitizeMessages(messages: unknown, mode: 'vision' | 'text'): unknown[] | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 10) return null

  let imageCount = 0
  const out: unknown[] = []

  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') return null
    const msg = raw as { role?: unknown; content?: unknown }
    const role = msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : null
    if (!role) return null

    if (typeof msg.content === 'string') {
      if (msg.content.length > MAX_TEXT_CHARS) return null
      out.push({ role, content: msg.content })
      continue
    }

    // Multimodal content array (the vision path).
    if (!Array.isArray(msg.content)) return null
    const parts: unknown[] = []
    for (const part of msg.content) {
      if (!part || typeof part !== 'object') return null
      const p = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } }
      if (p.type === 'text') {
        const text = typeof p.text === 'string' ? p.text : ''
        if (text.length > MAX_TEXT_CHARS) return null
        parts.push({ type: 'text', text })
      } else if (p.type === 'image_url') {
        const url = String(p.image_url?.url || '')
        if (!url.startsWith('data:image/') || !url.includes(';base64,')) return null
        const b64 = url.slice(url.indexOf(';base64,') + 8)
        if (!b64 || b64.length > MAX_IMAGE_B64_CHARS) return null
        imageCount += 1
        if (imageCount > MAX_IMAGES) return null
        parts.push({ type: 'image_url', image_url: { url } })
      } else {
        return null
      }
    }
    out.push({ role, content: parts })
  }

  if (mode === 'vision' && imageCount === 0) return null
  return out
}

/**
 * SSRF guard for the remote-image branch.
 *
 * `imageUrl` used to be passed straight to `fetch()` with no checks, so anyone
 * could point the function at `http://169.254.169.254/latest/meta-data/`
 * (cloud credential metadata) or an internal service and read the response
 * back through the generated theme, or at least use the host as a request
 * proxy. Only http(s) is allowed and internal/reserved targets are refused.
 */
function assertFetchableImageUrl(rawUrl: string): { url: URL } | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  // Hostnames that resolve inward.
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return null
  }

  // Literal private / loopback / link-local / reserved addresses.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number)
    const [a, b] = parts
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) || // link-local, incl. 169.254.169.254
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast + reserved
    ) {
      return null
    }
  }
  // IPv6 loopback / unique-local / link-local.
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return null
  }

  return { url }
}

const handler = async (req: any, res: any) => {
  const { applyCors, fail, readBody } = await import('./_lib/http')
  const { rateLimit, applyLimitHeaders, clientIp } = await import('./_lib/rateLimit')
  const { resolveCaller } = await import('./_lib/authz')

  if (applyCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const apiKey = process.env.GROQ_API_KEY || ''
    if (!apiKey) {
      return fail(res, 500, 'AI service is not configured on the server')
    }

    const body = readBody(req)
    if (!body) return fail(res, 400, 'Invalid JSON body')

    const action = body.action === 'chat' ? 'chat' : 'theme'

    // ── action: 'chat' ──────────────────────────────────────────────────────
    if (action === 'chat') {
      // AI feature → a logged-in user only.
      const caller = await resolveCaller(req)
      if (!caller) {
        return res.status(401).json({ error: 'Sign in to use AI document parsing' })
      }

      // Per-caller quota. Fail-open is handled inside rateLimit().
      const limit = await rateLimit(`rl:groq:${caller.id}`, RATE_LIMIT, RATE_WINDOW_MS)
      if (applyLimitHeaders(res, limit)) {
        return res.status(429).json({ error: 'AI request limit reached — try again in a minute' })
      }

      const mode = body.mode
      if (!isMode(mode)) return fail(res, 400, 'mode must be "vision" or "text"')

      const messages = sanitizeMessages(body.messages, mode)
      if (!messages) return fail(res, 400, 'Invalid messages payload')

      const upstream = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELS[mode],
          messages,
          temperature: clampNumber(body.temperature, 0, 2, mode === 'vision' ? 0.1 : 0.2),
          max_tokens: clampNumber(body.max_tokens, 1, 4096, 2048),
          ...(body.response_format && typeof body.response_format === 'object'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
      })

      if (!upstream.ok) {
        // Log the upstream detail; never leak it (it can contain account ids).
        const detail = await upstream.text().catch(() => '')
        console.error(`[api/poster-theme:chat] upstream ${upstream.status}:`, detail.slice(0, 1000))
        return fail(res, 502, 'AI service is unavailable right now — please try again')
      }

      const result = await upstream.json().catch(() => null)
      if (!result || typeof result !== 'object') {
        return fail(res, 502, 'AI service returned an unexpected response')
      }

      return res.status(200).json(result)
    }

    // ── action: 'theme' ─────────────────────────────────────────────────────
    // Anonymous by design (public registration form), so it is rate-limited by
    // IP and every input is validated before we spend money upstream.
    const limit = await rateLimit(`rl:theme:${clientIp(req)}`, 15, RATE_WINDOW_MS)
    if (applyLimitHeaders(res, limit)) {
      return res.status(429).json({ error: 'Too many theme requests — try again shortly' })
    }

    const { imageUrl, imageBase64, mimeType } = body as {
      imageUrl?: string
      imageBase64?: string
      mimeType?: string
    }

    if (!imageUrl && !imageBase64) {
      return fail(res, 400, 'Provide imageUrl or imageBase64')
    }

    // Resolve the image to a base64 data URL.
    let dataUrl: string
    if (imageBase64) {
      if (typeof imageBase64 !== 'string' || imageBase64.length > MAX_IMAGE_B64_CHARS) {
        return fail(res, 400, 'Image is too large')
      }
      const safeMime = typeof mimeType === 'string' && /^image\/(png|jpeg|jpg|webp|gif)$/.test(mimeType)
        ? mimeType
        : 'image/png'
      dataUrl = `data:${safeMime};base64,${imageBase64}`
    } else {
      const checked = assertFetchableImageUrl(String(imageUrl))
      if (!checked) {
        return fail(res, 400, 'Poster image URL is not allowed')
      }
      // Fetch the (presumably public) poster URL server-side, then base64 it.
      const fetched = await fetch(checked.url.toString())
      if (!fetched.ok) {
        return fail(res, 400, 'Could not fetch poster image')
      }
      const buf = Buffer.from(await fetched.arrayBuffer())
      if (buf.length > MAX_REMOTE_IMAGE_BYTES) {
        return fail(res, 400, 'Poster image is too large')
      }
      const ct = fetched.headers.get('content-type') || 'image/png'
      if (!ct.startsWith('image/')) {
        return fail(res, 400, 'Poster URL did not return an image')
      }
      dataUrl = `data:${ct};base64,${buf.toString('base64')}`
    }

    const groqRes = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS.vision,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: THEME_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 512,
        response_format: { type: 'json_object' },
      }),
    })

    if (!groqRes.ok) {
      // Never return the upstream body: it can carry account identifiers.
      const errText = await groqRes.text().catch(() => '')
      console.error(`[api/poster-theme:theme] upstream ${groqRes.status}:`, errText.slice(0, 500))
      return fail(res, 502, 'Theme extraction is unavailable right now')
    }

    const groqJson = await groqRes.json().catch(() => null)
    let content = groqJson?.choices?.[0]?.message?.content || '{}'
    if (typeof content !== 'string') content = JSON.stringify(content)
    // Strip markdown fences if present
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) content = fence[1].trim()

    let theme: any
    try {
      theme = JSON.parse(content)
    } catch {
      // A model that returns prose must not 500 the public registration form.
      theme = {}
    }

    const hex = (v: unknown, fallback: string) =>
      typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : fallback

    return res.status(200).json({
      palette: {
        primary: hex(theme.primary, '#FF4D2E'),
        secondary: hex(theme.secondary, '#2D5BFF'),
        accent: hex(theme.accent, '#FF4D2E'),
        background: hex(theme.background, '#F4EFE1'),
        text: hex(theme.text, '#14110E'),
      },
      vibe: typeof theme.vibe === 'string' ? theme.vibe : 'festive',
      isDark: Boolean(theme.isDark),
      suggestedAccent: hex(theme.accent, '#FF4D2E'),
    })
  } catch (err: unknown) {
    return fail(res, 500, 'Internal error', err)
  }
}

export default handler
