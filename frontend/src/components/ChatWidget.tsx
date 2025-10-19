import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { Button, Textarea, Card, Spinner } from '@heroui/react'
import { MessageCircle, X, Send, Loader2, CheckCircle, AlertCircle, ArrowLeft, ImageIcon } from 'lucide-react'

interface ChatMessage {
  id: string
  type: 'user' | 'system'
  content: string
  timestamp: Date
  status?: 'sending' | 'processing' | 'completed' | 'failed'
  jobId?: string
}

interface AttachedImage {
  id: string
  file: File
  preview: string
  uploadStatus: 'pending' | 'uploading' | 'ready' | 'failed'
  mediaId?: string
  error?: string
}

interface ChatWidgetProps {
  projectId?: string;
  projectName?: string;
}

export const ChatWidget = ({ projectId, projectName }: ChatWidgetProps = {}) => {
  const [isOpen, setIsOpen] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const { currentProject } = useProject()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const lastStatusRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use explicit projectId prop if provided, otherwise fall back to context
  const activeProjectId = projectId || currentProject?.id
  const activeProjectName = projectName || currentProject?.name

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current()
      }
    }
  }, [])

  const updateMessageStatus = (messageId: string, status: ChatMessage['status'], jobId?: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, status, jobId }
        : msg
    ))
  }

  const addSystemMessage = (content: string, type: 'success' | 'error' = 'success') => {
    const systemMessage: ChatMessage = {
      id: Date.now().toString() + '_system',
      type: 'system',
      content,
      timestamp: new Date(),
      status: type === 'success' ? 'completed' : 'failed'
    }
    setMessages(prev => [...prev, systemMessage])
  }

  const validateImage = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return 'Only JPEG, PNG, GIF, and WebP images are allowed'
    }
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return 'Image must be smaller than 5MB'
    }
    return null
  }

  const uploadImage = async (file: File) => {
    if (!activeProjectId) {
      console.error('No active project for image upload')
      return
    }

    const imageId = Date.now().toString()
    const preview = URL.createObjectURL(file)

    // Add to attached images with pending status
    const newImage: AttachedImage = {
      id: imageId,
      file,
      preview,
      uploadStatus: 'uploading'
    }
    setAttachedImages(prev => [...prev, newImage])

    try {
      // Step 1: Get presigned upload URL
      const { mediaId, uploadUrl } = await ApiService.generatePresignedUpload(
        file.name,
        file.type,
        activeProjectId
      )

      // Step 2: Upload to S3
      await ApiService.uploadToS3(file, uploadUrl)

      // Step 3: Confirm upload
      await ApiService.confirmMediaUpload(mediaId)

      // Update image status to ready
      setAttachedImages(prev =>
        prev.map(img =>
          img.id === imageId
            ? { ...img, uploadStatus: 'ready', mediaId }
            : img
        )
      )
    } catch (error) {
      console.error('Image upload failed:', error)
      setAttachedImages(prev =>
        prev.map(img =>
          img.id === imageId
            ? { ...img, uploadStatus: 'failed', error: error instanceof Error ? error.message : 'Upload failed' }
            : img
        )
      )
    }
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const error = validateImage(file)
      if (error) {
        addSystemMessage(error, 'error')
        continue
      }
      await uploadImage(file)
    }
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

  const removeImage = (imageId: string) => {
    setAttachedImages(prev => {
      const image = prev.find(img => img.id === imageId)
      if (image) {
        URL.revokeObjectURL(image.preview)
      }
      return prev.filter(img => img.id !== imageId)
    })
  }

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview))
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPrompt.trim() || isSubmitting) return

    // If no active project, show a message
    if (!activeProjectId) {
      addSystemMessage('Please select a project first to build your app.', 'error')
      return
    }

    // Check if any images are still uploading
    const uploadingImages = attachedImages.filter(img => img.uploadStatus === 'uploading')
    if (uploadingImages.length > 0) {
      addSystemMessage('Please wait for images to finish uploading', 'error')
      return
    }

    // Check if any images failed
    const failedImages = attachedImages.filter(img => img.uploadStatus === 'failed')
    if (failedImages.length > 0) {
      addSystemMessage('Please remove failed images before submitting', 'error')
      return
    }

    const messageId = Date.now().toString()
    const userMessage: ChatMessage = {
      id: messageId,
      type: 'user',
      content: currentPrompt.trim(),
      timestamp: new Date(),
      status: 'sending'
    }

    // Get mediaIds from ready images
    const mediaIds = attachedImages
      .filter(img => img.uploadStatus === 'ready' && img.mediaId)
      .map(img => img.mediaId!)

    console.log('[ChatWidget] Attached images:', attachedImages)
    console.log('[ChatWidget] Media IDs to submit:', mediaIds)

    setMessages(prev => [...prev, userMessage])
    setCurrentPrompt('')
    setIsSubmitting(true)

    try {
      console.log('[ChatWidget] Submitting prompt with mediaIds:', mediaIds)
      const response = await ApiService.submitPrompt(
        userMessage.content,
        activeProjectId,
        mediaIds.length > 0 ? mediaIds : undefined
      )
      console.log('[ChatWidget] Submit response:', response)
      updateMessageStatus(messageId, 'processing', response.promptId || response.jobId)
      
      addSystemMessage('🚀 Building your app update...')
      lastStatusRef.current = 'QUEUED'

      setIsProcessing(true)
      
      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status: JobStatus) => {
          // Only show new status messages to avoid duplicates
          if (status.status !== lastStatusRef.current) {
            if (status.status === 'PROCESSING') {
              addSystemMessage('⚙️ Processing your changes...')
            } else if (status.status === 'BUILDING') {
              addSystemMessage('🔨 Building updated app...')
            }
            lastStatusRef.current = status.status
          }
          
          if (status.status === 'READY' && status.previewUrl) {
            updateMessageStatus(messageId, 'completed')
            addSystemMessage('✅ Your app has been updated! Preview refreshed.', 'success')
            setIsProcessing(false)
            
            // Cache-busting iframe reload
            setTimeout(() => {
              // Add timestamp to URL to force cache bypass
              const cacheBustUrl = status.previewUrl?.includes('?') 
                ? `${status.previewUrl}&t=${Date.now()}`
                : `${status.previewUrl}?t=${Date.now()}`
              
              // Dispatch event with cache-busted URL
              window.dispatchEvent(new CustomEvent('reloadPreview', { 
                detail: { 
                  previewUrl: cacheBustUrl, 
                  forceReload: true 
                } 
              }))
            }, 500)
          } else if (status.status === 'FAILED' || status.errorMessage) {
            updateMessageStatus(messageId, 'failed')
            addSystemMessage(`❌ Build failed: ${status.errorMessage || 'Unknown error'}`, 'error')
            setIsProcessing(false)
          }
        },
        (error) => {
          updateMessageStatus(messageId, 'failed')
          addSystemMessage(`❌ Error: ${error.message}`, 'error')
          setIsProcessing(false)
        }
      )


      pollCleanupRef.current = cleanup

      // Clear attached images after successful submission
      attachedImages.forEach(img => URL.revokeObjectURL(img.preview))
      setAttachedImages([])
    } catch (error) {
      updateMessageStatus(messageId, 'failed')
      addSystemMessage(`❌ Failed to submit: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
      setIsProcessing(false)
    } finally {
      setIsSubmitting(false)
      lastStatusRef.current = null // Reset for next submission
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const getStatusIcon = (status?: ChatMessage['status']) => {
    switch (status) {
      case 'sending':
        return <Loader2 className="h-3 w-3 animate-spin text-primary" />
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-warning" />
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-success" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-danger" />
      default:
        return null
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    })
  }

  // Always show the widget, but handle no project case in the UI

  return (
    <>
      {/* Chat Bubble */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <Button
            onPress={() => setIsOpen(true)}
            size="lg"
            className="rounded-full shadow-lg"
            color="primary"
            isIconOnly            
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        )}

        {/* Chat Window */}
        {isOpen && (
          <Card className="w-80 h-[576px] flex flex-col shadow-2xl" isBlurred={true}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-divider">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <span>{activeProjectName || 'Quick Build'}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => navigate('/')}
                  title="Back to Projects"
                  isIconOnly
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => setIsOpen(false)}
                  isIconOnly
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 space-y-3 py-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="bg-content2 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <MessageCircle className="h-8 w-8 opacity-60" />
                  </div>
                  <p className="opacity-70 leading-relaxed">
                    {activeProjectId
                      ? "Describe changes to your app and I'll build them instantly!"
                      : "Select a project to start building!"
                    }
                  </p>
                </div>
              )}
              
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 backdrop-blur-sm ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : message.status === 'failed'
                        ? 'bg-danger/10 text-danger border border-danger/20'
                        : 'bg-content2 text-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1 leading-relaxed">{message.content}</span>
                      {message.type === 'user' && getStatusIcon(message.status)}
                    </div>
                    <div className="opacity-60 mt-2 text-xs">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-content2 rounded-2xl px-4 py-3 max-w-[80%] backdrop-blur-sm">
                    <Spinner size="sm" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="p-4 border-t border-divider"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Image Previews */}
              {attachedImages.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
                  {attachedImages.map((image) => (
                    <div key={image.id} className="relative flex-shrink-0">
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-divider">
                        <img
                          src={image.preview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        {image.uploadStatus === 'uploading' && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 text-white animate-spin" />
                          </div>
                        )}
                        {image.uploadStatus === 'failed' && (
                          <div className="absolute inset-0 bg-danger/50 flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-white" />
                          </div>
                        )}
                        {image.uploadStatus === 'ready' && (
                          <div className="absolute top-0 right-0 bg-success rounded-bl-lg p-0.5">
                            <CheckCircle className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeImage(image.id)}
                        className="absolute -top-2 -right-2 bg-danger rounded-full p-1 hover:bg-danger/80"
                        type="button"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Drag & Drop Overlay */}
              {isDragging && (
                <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10 pointer-events-none">
                  <div className="text-center">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium text-primary">Drop images here</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    onChange={(e) => handleFileSelect(e.target.files)}
                    className="hidden"
                  />
                  <Textarea
                    ref={textareaRef}
                    value={currentPrompt}
                    onValueChange={setCurrentPrompt}
                    onKeyDown={handleKeyDown}
                    placeholder={activeProjectId ? "Describe your changes..." : "Select a project first..."}
                    className="pr-20"
                    classNames={{
                      input: "min-h-[60px] max-h-[120px] resize-none"
                    }}
                    isDisabled={isSubmitting || !activeProjectId}
                    minRows={2}
                    maxRows={5}
                    variant="bordered"
                  />
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => fileInputRef.current?.click()}
                      isDisabled={!activeProjectId}
                      title="Attach image"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      isDisabled={!currentPrompt.trim() || isSubmitting || !activeProjectId}
                      isIconOnly
                      color="primary"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}