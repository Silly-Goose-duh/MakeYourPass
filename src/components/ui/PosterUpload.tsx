import { useState, useRef } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface PosterUploadProps {
  currentUrl?: string | null
  onUpload: (url: string) => void
  eventId?: string
}

export function PosterUpload({ currentUrl, onUpload, eventId }: PosterUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl || null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate type
    if (!file.type.startsWith('image/')) {
      setError('Only image files are accepted')
      return
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }

    setError('')
    setUploading(true)

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop() || 'png'
      const filePath = `posters/${eventId || 'new'}-${Date.now()}.${fileExt}`

      const { data, error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        // If bucket doesn't exist, use a data URL fallback
        setError('Storage unavailable. Using local preview only.')
        onUpload(localUrl)
        setUploading(false)
        return
      }

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('event-images')
          .getPublicUrl(data.path)

        onUpload(publicUrl)
      }
    } catch {
      // Fallback: use the local blob URL
      onUpload(localUrl)
    }

    setUploading(false)
  }

  const handleRemove = () => {
    setPreview(null)
    onUpload('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-primary">
        Event Poster <span className="text-text-muted text-xs">(9:16 recommended)</span>
      </label>

      {preview ? (
        <div className="relative w-full max-w-[200px]">
          <img
            src={preview}
            alt="Event poster"
            className="w-full aspect-[9/16] object-cover rounded-xl border border-border"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 p-1 bg-error text-white rounded-full shadow-lg hover:bg-error/90 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'w-full max-w-[200px] aspect-[9/16] rounded-xl border-2 border-dashed border-border',
            'flex flex-col items-center justify-center gap-2 transition-all',
            'hover:border-primary/50 hover:bg-primary/5',
            uploading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {uploading ? (
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs text-text-muted">Upload Poster</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
