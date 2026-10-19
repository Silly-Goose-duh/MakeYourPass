// ============================================================
// MakeYourPass — dependency-free ticket PDF export
// ============================================================
// Draws the ticket PNG onto a canvas, re-encodes it as JPEG
// (quality 0.92) and hand-writes those bytes into a minimal,
// valid single-page PDF (PDF 1.4) using a /DCTDecode image
// XObject. No external PDF library — fits the "no new deps"
// constraint for the paid-event flow.
// ============================================================

const JPEG_QUALITY = 0.92

/** Decodes a base64 string into raw bytes (browser `atob`). */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const marker = ';base64,'
  const at = dataUrl.indexOf(marker)
  return base64ToBytes(at >= 0 ? dataUrl.slice(at + marker.length) : dataUrl)
}

/** Accumulates strings + raw bytes while tracking the current byte offset (needed for the xref table). */
class ByteAssembler {
  private chunks: Uint8Array[] = []
  private readonly encoder = new TextEncoder()
  offset = 0

  private push(raw: Uint8Array): void {
    this.chunks.push(raw)
    this.offset += raw.byteLength
  }

  text(value: string): void {
    this.push(this.encoder.encode(value))
  }

  bytes(value: Uint8Array): void {
    this.push(value)
  }

  toUint8Array(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(new ArrayBuffer(this.offset))
    let cursor = 0
    for (const chunk of this.chunks) {
      out.set(chunk, cursor)
      cursor += chunk.byteLength
    }
    return out
  }
}

/**
 * Wraps JPEG bytes in a minimal single-page PDF:
 *   1 catalog → 2 pages → 3 page (MediaBox = image size)
 *   → 4 image XObject (/Filter /DCTDecode, /DeviceRGB)
 *   → 5 page-content stream (draws the image full-bleed)
 * xref offsets are recorded while the bytes are written, so the
 * table is always exact.
 */
export function wrapJpegInPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))

  const writer = new ByteAssembler()
  const objectOffsets: number[] = []

  const startObject = (num: number) => {
    objectOffsets[num] = writer.offset
    writer.text(`${num} 0 obj\n`)
  }

  writer.text('%PDF-1.4\n')
  // Binary marker comment — tells line-oriented parsers that binary streams follow (required for JPEG data).
  writer.bytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  startObject(1)
  writer.text('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')

  startObject(2)
  writer.text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')

  startObject(3)
  writer.text(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  )

  startObject(4)
  writer.text(
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`,
  )
  writer.bytes(jpeg)
  writer.text('endstream\nendobj\n')

  // Content stream: scale the image to the full MediaBox and paint it once.
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`
  startObject(5)
  writer.text(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`)

  const xrefOffset = writer.offset
  writer.text('xref\n0 6\n0000000000 65535 f \n')
  for (let num = 1; num <= 5; num++) {
    writer.text(`${String(objectOffsets[num] ?? 0).padStart(10, '0')} 00000 n \n`)
  }
  writer.text(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return writer.toUint8Array()
}

/**
 * Loads a (signed) ticket image URL through a fetch → blob → <img> pipeline
 * so the canvas never becomes cross-origin tainted, re-encodes it as JPEG 0.92
 * and returns the bytes with the image dimensions.
 */
async function reencodeAsJpeg(sourceUrl: string): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`Could not fetch the ticket image (HTTP ${response.status})`)
  const blobUrl = URL.createObjectURL(await response.blob())
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('The ticket image could not be decoded'))
      image.src = blobUrl
    })
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) throw new Error('The ticket image has no readable dimensions')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable in this browser')
    ctx.drawImage(img, 0, 0)

    const jpeg = bytesFromDataUrl(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
    if (jpeg.length === 0) throw new Error('The ticket image could not be re-encoded')
    return { jpeg, width, height }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

/** Triggers a blob download and revokes the object URL shortly after. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function filenamePart(uniqueCode: string): string {
  const safe = uniqueCode.trim().replace(/[^A-Za-z0-9._-]+/g, '')
  return safe || 'ticket'
}

/** Downloads the ticket image as `MakeYourPass-<code>.pdf`. */
export async function downloadTicketPdf(sourceUrl: string, uniqueCode: string): Promise<void> {
  const { jpeg, width, height } = await reencodeAsJpeg(sourceUrl)
  const pdfBytes = wrapJpegInPdf(jpeg, width, height)
  saveBlob(
    new Blob([pdfBytes], { type: 'application/pdf' }),
    `MakeYourPass-${filenamePart(uniqueCode)}.pdf`,
  )
}

/**
 * Downloads the ticket image as `MakeYourPass-<code>.png`. The signed URL is
 * normally cross-origin (Supabase storage), where the `download` attribute is
 * ignored — so we fetch a blob copy to make the filename stick.
 */
export async function downloadTicketPng(sourceUrl: string, uniqueCode: string): Promise<void> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`Could not fetch the ticket image (HTTP ${response.status})`)
  saveBlob(await response.blob(), `MakeYourPass-${filenamePart(uniqueCode)}.png`)
}
