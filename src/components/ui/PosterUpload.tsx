import { useState, useRef } from 'react'
import { X, Image as ImageIcon } from 'lucide-react'
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

    if (!file.type.startsWith('image/')) {
      setError('Only image files are accepted')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }

    setError('')
    setUploading(true)

    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)

    try {
      const fileExt = file.name.split('.').pop() || 'png'
      const filePath = `posters/${eventId || 'new'}-${Date.now()}.${fileExt}`

      const { data, error: uploadError } = await supabase.storage
        .from('event-posters')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        setError('Storage unavailable. Using local preview only.')
        onUpload(localUrl)
        setUploading(false)
        return
      }

      if (data) {
        const { data: { publicUrl } } = supabase.storage
          .from('event-posters')
          .getPublicUrl(data.path)

        onUpload(publicUrl)
      }
    } catch {
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
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-brand-light">
        Event Poster <span className="text-text-muted">(9:16 recommended)</span>
      </label>

      {preview ? (
        <div className="relative w-full max-w-[180px]">
          <img
            src={preview}
            alt="Event poster"
            className="w-full aspect-[9/16] object-cover rounded border border-brand/20"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 p-1 bg-error text-white rounded-full hover:bg-error/80 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'w-full max-w-[180px] aspect-[9/16] rounded border-2 border-dashed border-brand/20',
            'flex flex-col items-center justify-center gap-1.5 transition-all',
            'hover:border-brand/50 hover:bg-brand/5',
            uploading && 'opacity-50 cursor-not-allowed',
          )}
        >
          {uploading ? (
            <div className="h-4 w-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <div className="h-8 w-8 rounded-full bg-brand/10 flex items-center justify-center">
                <ImageIcon className="h-4 w-4 text-brand" />
              </div>
              <span className="text-[11px] text-text-muted">Upload Poster</span>
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

      {error && <p className="text-[11px] text-error">{error}</p>}
    </div>
  )
}
