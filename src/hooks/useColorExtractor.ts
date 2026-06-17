import { useState, useEffect, useCallback } from 'react'

export interface ExtractedPalette {
  primary: string
  secondary: string
  accent: string
  bgLight: string
  bgDark: string
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null
}

/**
 * Simple perceptual luminance — how bright a color appears to the human eye.
 * Returns 0 (dark) to 255 (light).
 */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Extract a color palette from an image URL by sampling pixels
 * on a canvas at reduced resolution.
 */
function extractPaletteFromCanvas(img: HTMLImageElement): ExtractedPalette {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return fallbackPalette()
  }

  // Scale down to 32x32 max for performance
  const maxSize = 32
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (w > maxSize || h > maxSize) {
    const ratio = Math.min(maxSize / w, maxSize / h)
    w = Math.round(w * ratio)
    h = Math.round(h * ratio)
  }

  canvas.width = w
  canvas.height = h
  ctx.drawImage(img, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = imageData.data
  const samples: { r: number; g: number; b: number }[] = []

  // Sample every 2nd pixel to reduce data
  for (let i = 0; i < pixels.length; i += 8) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]
    if (a < 128) continue // skip transparent
    // Skip very dark (near-black) and very light (near-white) pixels
    const l = luminance(r, g, b)
    if (l < 20 || l > 240) continue
    samples.push({ r, g, b })
  }

  if (samples.length === 0) {
    return fallbackPalette()
  }

  // Simple k-means clustering with 3 clusters
  const k = 4
  const clusters = kMeansClustering(samples, k)

  // Sort clusters by size (largest first)
  clusters.sort((a, b) => b.size - a.size)

  // Get colors, ensuring enough variety
  const colors = clusters.map(c => rgbToHex(c.centroid.r, c.centroid.g, c.centroid.b))

  // Ensure we have at least 3 distinct colors
  const distinct = ensureDistinctColors(colors, samples.map(s => rgbToHex(s.r, s.g, s.b)))

  const pal = {
    primary: distinct[0] || '#6366F1',
    secondary: distinct[1] || '#8B5CF6',
    accent: distinct[2] || '#F59E0B',
    bgLight: distinct[3] || '#F8FAFC',
    bgDark: distinct[0] || '#6366F1',
  }

  // Ensure text contrast: if primary is too light, darken it
  const pRgb = hexToRgb(pal.primary)
  if (pRgb && luminance(pRgb.r, pRgb.g, pRgb.b) > 180) {
    pal.primary = darkenColor(pal.primary, 60)
  }

  return pal
}

function kMeansClustering(
  samples: { r: number; g: number; b: number }[],
  k: number
): { centroid: { r: number; g: number; b: number }; size: number }[] {
  // Initialize centroids by picking random samples
  const centroids: { r: number; g: number; b: number }[] = []
  const step = Math.max(1, Math.floor(samples.length / k))
  for (let i = 0; i < k; i++) {
    const idx = Math.min(i * step, samples.length - 1)
    centroids.push({ ...samples[idx] })
  }

  // Iterate (max 10)
  for (let iter = 0; iter < 10; iter++) {
    const assignments: { r: number; g: number; b: number }[][] = Array.from({ length: k }, () => [])

    for (const s of samples) {
      let minDist = Infinity
      let bestIdx = 0
      for (let j = 0; j < k; j++) {
        const dx = s.r - centroids[j].r
        const dy = s.g - centroids[j].g
        const dz = s.b - centroids[j].b
        const dist = dx * dx + dy * dy + dz * dz
        if (dist < minDist) {
          minDist = dist
          bestIdx = j
        }
      }
      assignments[bestIdx].push(s)
    }

    // Recompute centroids
    let changed = false
    for (let j = 0; j < k; j++) {
      if (assignments[j].length === 0) continue
      let sumR = 0, sumG = 0, sumB = 0
      for (const s of assignments[j]) {
        sumR += s.r
        sumG += s.g
        sumB += s.b
      }
      const n = assignments[j].length
      const newR = Math.round(sumR / n)
      const newG = Math.round(sumG / n)
      const newB = Math.round(sumB / n)
      if (centroids[j].r !== newR || centroids[j].g !== newG || centroids[j].b !== newB) {
        changed = true
      }
      centroids[j] = { r: newR, g: newG, b: newB }
    }

    if (!changed) break
  }

  // Count sizes
  return centroids.map((c) => {
    let size = 0
    for (const s of samples) {
      const dx = s.r - c.r; const dy = s.g - c.g; const dz = s.b - c.b
      const dist = dx * dx + dy * dy + dz * dz
      if (dist < 5000) size++ // approximate
    }
    return { centroid: c, size }
  })
}

function ensureDistinctColors(colors: string[], allSamples: string[]): string[] {
  const result: string[] = []
  for (const c of colors) {
    if (result.length >= 4) break
    // Check if this color is distinct from already chosen ones
    const isDistinct = result.every(existing => {
      const c1 = hexToRgb(c); const c2 = hexToRgb(existing)
      if (!c1 || !c2) return true
      const d = Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b)
      return d > 100
    })
    if (isDistinct) result.push(c)
  }

  // Fill remaining slots from samples
  if (colors.length > 0 && result.length === 0) result.push(colors[0])
  while (result.length < 4 && allSamples.length > 0) {
    const candidate = allSamples[Math.floor(Math.random() * allSamples.length)]
    const isDistinct = result.every(existing => {
      const c1 = hexToRgb(candidate); const c2 = hexToRgb(existing)
      if (!c1 || !c2) return true
      const d = Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b)
      return d > 100
    })
    if (isDistinct) result.push(candidate)
  }

  return result
}

function darkenColor(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(
    Math.max(0, rgb.r - amount),
    Math.max(0, rgb.g - amount),
    Math.max(0, rgb.b - amount)
  )
}

function fallbackPalette(): ExtractedPalette {
  return {
    primary: '#6366F1',
    secondary: '#8B5CF6',
    accent: '#F59E0B',
    bgLight: '#F8FAFC',
    bgDark: '#6366F1',
  }
}

/**
 * Hook that extracts a color palette from an image URL.
 * Returns loading state, palette, and a retrigger function.
 */
export function useColorExtractor(imageUrl: string | null | undefined) {
  const [palette, setPalette] = useState<ExtractedPalette>(fallbackPalette())
  const [loading, setLoading] = useState(false)

  const extract = useCallback(() => {
    if (!imageUrl) {
      setPalette(fallbackPalette())
      return
    }

    setLoading(true)
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const pal = extractPaletteFromCanvas(img)
        setPalette(pal)
      } catch {
        setPalette(fallbackPalette())
      }
      setLoading(false)
    }

    img.onerror = () => {
      setPalette(fallbackPalette())
      setLoading(false)
    }

    img.src = imageUrl
  }, [imageUrl])

  useEffect(() => {
    const t = setTimeout(() => extract(), 0)
    return () => clearTimeout(t)
  }, [extract])

  return { palette, loading, retrigger: extract }
}
