/**
 * POST /api/poster-theme
 *
 * Analyzes an event poster image with Groq vision and returns a color
 * palette + vibe so the public registration form can re-theme itself to
 * match the event's look.
 *
 * Body: { imageUrl?: string, imageBase64?: string, mimeType?: string }
 * Response: {
 *   palette: { primary, secondary, accent, background, text },
 *   vibe: string,
 *   suggestedAccent: string  // hex for CSS --event-accent
 * }
 *
 * SECURITY: Groq key stays server-side (GROQ_API_KEY). The browser never
 * sees it. This is the safe replacement for the client-side VITE_GROQ_API_KEY
 * usage for this feature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
  if (!GROQ_API_KEY) {
    res.status(500).json({ error: 'Groq not configured (GROQ_API_KEY missing)' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { imageUrl, imageBase64, mimeType } = body as {
      imageUrl?: string
      imageBase64?: string
      mimeType?: string
    }

    if (!imageUrl && !imageBase64) {
      res.status(400).json({ error: 'Provide imageUrl or imageBase64' })
      return
    }

    // Resolve the image to a base64 data URL.
    let dataUrl: string
    if (imageBase64) {
      dataUrl = `data:${mimeType || 'image/png'};base64,${imageBase64}`
    } else {
      // Fetch the (presumably public) poster URL server-side, then base64 it.
      const fetched = await fetch(imageUrl as string)
      if (!fetched.ok) {
        res.status(400).json({ error: 'Could not fetch poster image' })
        return
      }
      const buf = Buffer.from(await fetched.arrayBuffer())
      const ct = fetched.headers.get('content-type') || 'image/png'
      dataUrl = `data:${ct};base64,${buf.toString('base64')}`
    }

    const prompt = `You are a design analyst. Look at this event poster image and extract its color theme and mood.

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

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
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
      const errText = await groqRes.text()
      res.status(502).json({ error: `Groq error: ${errText.slice(0, 300)}` })
      return
    }

    const groqJson = await groqRes.json()
    let content = groqJson?.choices?.[0]?.message?.content || '{}'
    if (typeof content !== 'string') content = JSON.stringify(content)
    // Strip markdown fences if present
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) content = fence[1].trim()
    const theme = JSON.parse(content)

    const hex = (v: unknown, fallback: string) =>
      typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith('#') ? v : `#${v}`) : fallback

    res.status(200).json({
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
    console.error('poster-theme error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    res.status(500).json({ error: message })
  }
}
