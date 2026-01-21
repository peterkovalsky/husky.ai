import { useState, useEffect } from 'react'
import { ApiService } from '../services/api'
import type { AttachedImage } from '../components/ImagePreview'

interface UseMediaUploadOptions {
  projectId?: string
  onError?: (message: string) => void
  maxFiles?: number
}

export const useMediaUpload = ({ projectId, onError, maxFiles = 1 }: UseMediaUploadOptions) => {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const validateFile = (file: File): string | null => {
    const allowedTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Videos
      'video/mp4',
      'video/webm',
      'video/quicktime', // .mov
      // PDFs
      'application/pdf',
    ]
    if (!allowedTypes.includes(file.type)) {
      return 'Only images (JPEG, PNG, GIF, WebP), videos (MP4, WebM, MOV), and PDFs are allowed'
    }

    // File size limit: 10MB for all media types
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return 'File must be smaller than 10MB'
    }
    return null
  }

  const uploadFile = async (file: File) => {
    const fileId = Date.now().toString()
    const preview = URL.createObjectURL(file)

    // Add to attached images with uploading status
    const newImage: AttachedImage = {
      id: fileId,
      file,
      preview,
      uploadStatus: 'uploading'
    }
    setAttachedImages(prev => [...prev, newImage])

    try {
      // Step 1: Get presigned upload URL (projectId is optional - new project flow doesn't have one yet)
      const { mediaId, uploadUrl } = await ApiService.generatePresignedUpload(
        file.name,
        file.type,
        file.size,
        projectId // Can be undefined for new project flow
      )

      // Step 2: Upload to S3
      await ApiService.uploadToS3(file, uploadUrl)

      // Step 3: Confirm upload
      await ApiService.confirmMediaUpload(mediaId)

      // Update file status to ready
      setAttachedImages(prev =>
        prev.map(img =>
          img.id === fileId
            ? { ...img, uploadStatus: 'ready', mediaId }
            : img
        )
      )
    } catch (error) {
      console.error('File upload failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'

      setAttachedImages(prev =>
        prev.map(img =>
          img.id === fileId
            ? { ...img, uploadStatus: 'failed', error: errorMessage }
            : img
        )
      )

      onError?.(errorMessage)
    }
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    // Limit to maxFiles per request
    if (files.length > maxFiles) {
      onError?.(`Only ${maxFiles} file${maxFiles > 1 ? 's' : ''} can be uploaded per request`)
      return
    }

    // Check if there are already attached files
    if (attachedImages.length > 0) {
      onError?.('Please remove the existing file before uploading a new one')
      return
    }

    const file = files[0]
    const error = validateFile(file)
    if (error) {
      onError?.(error)
      return
    }
    await uploadFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    await handleFileSelect(files)
  }

  const removeFile = (fileId: string) => {
    // Find the file before removing
    const file = attachedImages.find(img => img.id === fileId)

    // Optimistic delete - remove from UI immediately
    setAttachedImages(prev => {
      const img = prev.find(i => i.id === fileId)
      if (img) {
        URL.revokeObjectURL(img.preview)
      }
      return prev.filter(i => i.id !== fileId)
    })

    // Async cleanup - delete from backend if it was uploaded
    if (file?.mediaId && projectId) {
      ApiService.deleteMedia(file.mediaId, projectId)
        .then(() => {
          console.log(`[useMediaUpload] Successfully deleted media ${file.mediaId} from backend`)
        })
        .catch(error => {
          console.error(`[useMediaUpload] Failed to delete media ${file.mediaId} from backend:`, error)
          // Don't show error to user - file already removed from UI
        })
    }
  }

  const getMediaIds = (): string[] => {
    return attachedImages
      .filter(img => img.uploadStatus === 'ready' && img.mediaId)
      .map(img => img.mediaId!)
  }

  const clearFiles = (revokeUrls: boolean = true) => {
    if (revokeUrls) {
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview))
    }
    setAttachedImages([])
  }

  const hasUploadingFiles = () => {
    return attachedImages.some(img => img.uploadStatus === 'uploading')
  }

  const hasFailedFiles = () => {
    return attachedImages.some(img => img.uploadStatus === 'failed')
  }

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview))
    }
  }, [])

  return {
    attachedImages,
    isDragging,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeFile,
    getMediaIds,
    clearFiles,
    hasUploadingFiles,
    hasFailedFiles,
  }
}
