import { X, Loader2, AlertCircle, ImageIcon } from 'lucide-react'

export interface AttachedImage {
  id: string
  file: File
  preview: string
  uploadStatus: 'pending' | 'uploading' | 'ready' | 'failed'
  mediaId?: string
  error?: string
}

interface ImagePreviewProps {
  file: AttachedImage
  onRemove: (fileId: string) => void
}

export const ImagePreview = ({ file, onRemove }: ImagePreviewProps) => {
  return (
    <div className="relative w-14 h-14 group">
      <div className="relative w-full h-full rounded-2xl overflow-hidden bg-content2 border-2 border-divider">
        {file.file.type.startsWith('image/') ? (
          <img
            src={file.preview}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center px-1">
              <ImageIcon className="h-6 w-6 mx-auto mb-0.5 opacity-60" />
              <p className="text-[8px] opacity-60 truncate max-w-full">
                {file.file.name.split('.').pop()?.toUpperCase()}
              </p>
            </div>
          </div>
        )}

        {/* Upload Status Overlays */}
        {file.uploadStatus === 'uploading' && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
        {file.uploadStatus === 'failed' && (
          <div className="absolute inset-0 bg-danger/70 flex items-center justify-center backdrop-blur-sm">
            <AlertCircle className="h-6 w-6 text-white" />
          </div>
        )}
      </div>

      {/* Remove Button - Top Right with dark background */}
      <button
        onClick={() => onRemove(file.id)}
        className="absolute -top-1 -right-1 bg-default-900 hover:bg-default-800 rounded-full w-4 h-4 flex items-center justify-center transition-all shadow-lg z-10 opacity-0 group-hover:opacity-100 cursor-pointer"
        type="button"
        aria-label="Remove file"
      >
        <X className="h-3 w-3 text-default-50" />
      </button>
    </div>
  )
}
