const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || ''
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface ExtractedEventData {
  title: string
  description: string
  shortDescription: string
  category: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  venueName: string
  venueAddress: string
  city: string
  state: string
  maxAttendees: string
}

/**
 * Parse event details from a PDF document by sending extracted text to Groq
 */
export async function parseEventDocument(
  file: File,
  onProgress?: (msg: string) => void
): Promise<ExtractedEventData | null> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured. Set VITE_GROQ_API_KEY in .env.local')
  }

  onProgress?.('Reading document...')

  // Step 1: Extract text from the document
  const fileName = file.name.toLowerCase()
  const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf')
  const isImage = file.type.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp'].some(ext => fileName.endsWith(ext))
  let documentText: string | undefined
  if (isPdf) {
    try {
      documentText = await extractTextFromPDF(file)
      // If pdfjs returned empty text, the PDF is likely scanned/image-based.
      // Render the first page as an image and send to Groq vision instead.
      if (!documentText.trim()) {
        onProgress?.('No extractable text — analyzing PDF page as image...')
        try {
          return await analyzePdfPageAsImage(file)
        } catch (visionErr: unknown) {
          const visionMsg = visionErr instanceof Error ? visionErr.message : String(visionErr)
          throw new Error(
            `Could not read this PDF. It appears to be a scanned document without selectable text, ` +
            `and AI vision analysis failed: ${visionMsg}. ` +
            `Please try uploading a screenshot or photo of the event poster instead.`,
            { cause: visionErr }
          )
        }
      }
    } catch (pdfErr: unknown) {
      // If pdfjs fails, try reading as text or report the specific error
      const pdfErrObj = pdfErr as { message?: string }
      if (pdfErrObj?.message?.includes('worker') || pdfErrObj?.message?.includes('Worker')) {
        throw new Error('PDF worker failed to load. Please try uploading as an image or text file instead.', { cause: pdfErr })
      }
      throw new Error(`Could not read PDF: ${pdfErrObj?.message || 'Unknown error'}. Try uploading as an image.`, { cause: pdfErr })
    }
  } else if (isImage) {
    // For images, we'll use Groq vision directly
    onProgress?.('Analyzing image with AI...')
    return await analyzeImageWithGroq(file)
  } else if (file.type === 'text/plain') {
    documentText = await file.text()
  } else {
    // Try reading as text
    try {
      documentText = await file.text()
    } catch {
      // Fallback: try as image
      if (file.type === 'application/octet-stream' || !file.type) {
        onProgress?.('Analyzing document with AI...')
        return await analyzeImageWithGroq(file)
      }
      throw new Error('Unsupported file format. Please upload a PDF, image, or text file.')
    }
  }

  if (!documentText.trim()) {
    throw new Error('Could not extract any text from the document.')
  }

  // Step 2: Send extracted text to Groq for structured parsing
  onProgress?.('Parsing event details with AI...')
  return await parseTextWithGroq(documentText)
}

/**
 * Extract text from a PDF file using pdfjs-dist loaded from CDN
 * (Avoids Vite code-split chunk caching issues in production)
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  
  // Load pdfjs from CDN dynamically — avoids Vite code-split chunk issues
  // @ts-expect-error — URL import is resolved at runtime, not by TypeScript
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs'

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []

  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const text = textContent.items.map((item: Record<string, unknown>) => item.str as string).join(' ')
    pages.push(text)
  }

  return pages.join('\n\n')
}

/**
 * Render ALL pages of a PDF as individual images and analyze with Groq vision
 * (Max 5 pages per request due to Groq's 5-image limit)
 */
async function analyzePdfPageAsImage(file: File): Promise<ExtractedEventData> {
  const arrayBuffer = await file.arrayBuffer()

  // Load pdfjs from CDN
  // @ts-expect-error — URL import resolved at runtime
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs'

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages = Math.min(pdf.numPages, 5) // Groq allows max 5 images

  const base64Images: string[] = []

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i)
    // Use 1x scale to keep total under 4MB base64 limit
    const viewport = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser canvas context not available')

    await page.render({ canvasContext: ctx, viewport }).promise
    // Use quality 0.8 to reduce size
    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    canvas.remove()
    base64Images.push(b64)
  }

  return sendToGroqVision(base64Images, 'image/jpeg')
}

/**
 * Send image to Groq vision API to extract event details
 */
async function analyzeImageWithGroq(file: File): Promise<ExtractedEventData> {
  const base64 = await fileToBase64(file)
  const mimeType = file.type || 'image/png'
  return sendToGroqVision([base64], mimeType)
}

/**
 * Send one or more base64 images to Groq vision API
 * Uses response_format: json_object to force structured JSON output
 * @param base64Images Array of base64-encoded images (max 5 per Groq limits)
 */
async function sendToGroqVision(base64Images: string[], mimeType: string): Promise<ExtractedEventData> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured. Set VITE_GROQ_API_KEY in .env.local')
  }

  // Build content array: text prompt + all page images
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: `You are an event detail extraction AI. This is a multi-page event brochure.

Read EVERY piece of text from ALL pages/images carefully. Extract ALL visible event details and return them as a JSON object.

Fill every field you can find. Use empty string "" for anything not found:
- title: the full event name
- description: the complete event description, agenda, or details
- shortDescription: a one-line tagline or subtitle
- category: one of: conference, workshop, meetup, festival, concert, sports, networking, college_fest, webinar, other
- startDate: the start date in YYYY-MM-DD format
- endDate: the end date in YYYY-MM-DD format
- startTime: the start time in HH:MM 24-hour format
- endTime: the end time in HH:MM 24-hour format
- venueName: the venue or location name
- venueAddress: the full street address
- city: the city name
- state: the state or region
- maxAttendees: the maximum number of attendees, or empty string

Look through ALL pages — headers, body text, footers, fine print. Extract dates, times, location, description, every detail you can see across all pages. If you see a date like "June 15, 2026", format it as "2026-06-15".`,
    },
  ]

  for (const b64 of base64Images) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${b64}` },
    })
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content }],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq API error: ${err}`)
  }

  const result = await response.json()
  const responseContent = result.choices?.[0]?.message?.content || '{}'
  return parseGroqResponse(responseContent)
}

/**
 * Send extracted text to Groq for structured data extraction
 */
async function parseTextWithGroq(text: string): Promise<ExtractedEventData> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You extract ALL structured event data from text. Be thorough — read every line and fill as many fields as possible.',
        },
        {
          role: 'user',
          content: `Extract ALL event details from the document text below. Return ONLY valid JSON with exactly this structure. Fill every field you can find. Use empty string "" only if truly absent:
{
  "title": "Full event name/title",
  "description": "Complete event description, agenda, or details",
  "shortDescription": "One-line tagline or subtitle",
  "category": "conference|workshop|meetup|festival|concert|sports|networking|college_fest|webinar|other",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "startTime": "HH:MM (24-hour format)",
  "endTime": "HH:MM (24-hour format)",
  "venueName": "Venue or location name",
  "venueAddress": "Full street address",
  "city": "City name",
  "state": "State or region",
  "maxAttendees": "Maximum participant count or empty"
}

SCAN THE ENTIRE TEXT BELOW. Look for dates, times, locations, descriptions, ticket counts, categories. Extract everything you can find. Return ONLY the JSON object, no markdown, no code blocks, no other text.

DOCUMENT TEXT:
${text.slice(0, 8000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Groq API error: ${err}`)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content || '{}'
  return parseGroqResponse(content)
}

/**
 * Parse the JSON response from Groq, handling various formats and edge cases
 */
function parseGroqResponse(content: string): ExtractedEventData {
  // Step 1: Try to extract JSON from markdown code blocks
  let jsonStr = content.trim()

  // Remove markdown code block fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // Step 2: If still not valid JSON, try finding the first { and last }
  if (jsonStr) {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }
  }

  // Step 3: Try parsing, with fallback for common issues
  let data: Record<string, unknown>
  try {
    data = JSON.parse(jsonStr)
  } catch {
    // Try fixing trailing commas before re-trying
    try {
      const fixed = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      data = JSON.parse(fixed)
    } catch {
      // Last resort: log the raw content for debugging
      console.warn('Failed to parse Groq response. Raw content (first 500 chars):', content.slice(0, 500))
      throw new Error('Could not parse the document. Please try a clearer file or fill in the details manually.')
    }
  }

  return {
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    shortDescription: typeof data.shortDescription === 'string' ? data.shortDescription : '',
    category: typeof data.category === 'string' ? data.category : '',
    startDate: typeof data.startDate === 'string' ? data.startDate : '',
    endDate: typeof data.endDate === 'string' ? data.endDate : '',
    startTime: typeof data.startTime === 'string' ? data.startTime : '',
    endTime: typeof data.endTime === 'string' ? data.endTime : '',
    venueName: typeof data.venueName === 'string' ? data.venueName : '',
    venueAddress: typeof data.venueAddress === 'string' ? data.venueAddress : '',
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    maxAttendees: typeof data.maxAttendees === 'string' ? data.maxAttendees : '',
  }
}

/**
 * Convert a File to a base64 data URL
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
