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
 * Render the first page of a PDF as an image and analyze it with Groq vision
 */
async function analyzePdfPageAsImage(file: File): Promise<ExtractedEventData> {
  const arrayBuffer = await file.arrayBuffer()

  // Load pdfjs from CDN (browser cache serves instantly since extractTextFromPDF already loaded it)
  // @ts-expect-error — URL import resolved at runtime
  const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs'

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)

  // Set viewport at 2x scale for decent resolution
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser canvas context not available')

  await page.render({ canvasContext: ctx, viewport }).promise

  // Convert canvas to JPEG base64
  const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  canvas.remove()

  return sendToGroqVision(base64, 'image/jpeg')
}

/**
 * Send image to Groq vision API to extract event details
 */
async function analyzeImageWithGroq(file: File): Promise<ExtractedEventData> {
  const base64 = await fileToBase64(file)
  const mimeType = file.type || 'image/png'
  return sendToGroqVision(base64, mimeType)
}

/**
 * Shared function: send a base64 image to Groq vision API
 * Uses a two-step approach: first describes everything visible, then parses into structured JSON
 */
async function sendToGroqVision(base64: string, mimeType: string): Promise<ExtractedEventData> {
  if (!GROQ_API_KEY) {
    throw new Error('Groq API key not configured. Set VITE_GROQ_API_KEY in .env.local')
  }

  // Step 1: Use the vision model to transcribe ALL visible text from the image
  const visionResponse = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Look at this event brochure/flyer image carefully. Read EVERY piece of text visible in the image from top to bottom, left to right.

Your task is to DESCRIBE everything you see in plain text. Include:
- The event name/title
- Any tagline or subtitle
- The full description or agenda text
- Dates and times mentioned
- Venue name and address/city
- Ticket prices, registration details, capacity limits
- Any other text or details visible

Be COMPLETE. Transcribe ALL text you can see. Do NOT summarize or omit anything. Output only the raw text description, no commentary.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  })

  if (!visionResponse.ok) {
    const err = await visionResponse.text()
    throw new Error(`Groq API error: ${err}`)
  }

  const visionResult = await visionResponse.json()
  const extractedText = visionResult.choices?.[0]?.message?.content || ''

  if (!extractedText.trim()) {
    throw new Error('AI could not read any text from this image. Please try a clearer image or enter details manually.')
  }

  // Step 2: Feed the extracted text into the reliable text model for structured JSON
  return parseTextWithGroq(extractedText)
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
