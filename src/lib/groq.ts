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
 * Send image to Groq vision API to extract event details
 */
async function analyzeImageWithGroq(file: File): Promise<ExtractedEventData> {
  const base64 = await fileToBase64(file)
  const mimeType = file.type || 'image/png'

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all event details from this image/brochure. Return ONLY valid JSON with these fields:
{
  "title": "Event name",
  "description": "Full event description",
  "shortDescription": "One-line tagline",
  "category": "conference|workshop|meetup|festival|concert|sports|networking|college_fest|webinar|other",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "venueName": "Venue name",
  "venueAddress": "Full address",
  "city": "City",
  "state": "State",
  "maxAttendees": "Number or empty"
}

Fill what you can from the image. Leave empty strings for fields not found. Return ONLY the JSON object, no other text.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
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
          content: 'You extract structured event data from text. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Extract event details from this document text. Return ONLY valid JSON with these fields:
{
  "title": "Event name",
  "description": "Full event description",
  "shortDescription": "One-line tagline",
  "category": "conference|workshop|meetup|festival|concert|sports|networking|college_fest|webinar|other",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "startTime": "HH:MM (24hr)",
  "endTime": "HH:MM (24hr)",
  "venueName": "Venue name",
  "venueAddress": "Full address",
  "city": "City",
  "state": "State",
  "maxAttendees": "Number or empty"
}

Fill what you can. Empty string for missing fields. ONLY the JSON object, no other text.

DOCUMENT TEXT:
${text.slice(0, 8000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
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
 * Parse the JSON response from Groq, handling markdown code blocks
 */
function parseGroqResponse(content: string): ExtractedEventData {
  // Handle markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()

  try {
    const data = JSON.parse(jsonStr)
    return {
      title: data.title || '',
      description: data.description || '',
      shortDescription: data.shortDescription || '',
      category: data.category || '',
      startDate: data.startDate || '',
      endDate: data.endDate || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      venueName: data.venueName || '',
      venueAddress: data.venueAddress || '',
      city: data.city || '',
      state: data.state || '',
      maxAttendees: data.maxAttendees || '',
    }
  } catch {
    console.warn('Failed to parse Groq response as JSON:', content.slice(0, 200))
    throw new Error('Could not parse the document. Please try a clearer file or fill in the details manually.')
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
