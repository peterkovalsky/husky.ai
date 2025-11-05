import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { Button, Card, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Alert } from '@heroui/react'
import { MessageCircle, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp, ArrowLeft, RotateCcw } from 'lucide-react'
import { PromptInput } from './PromptInput'
import { useMediaUpload } from '../hooks/useMediaUpload'

interface ChatMessage {
  id: string
  type: 'user' | 'system'
  content: string
  timestamp: Date
  status?: 'sending' | 'processing' | 'completed' | 'failed'
  jobId?: string
}


interface ChatWidgetProps {
  projectId?: string;
  projectName?: string;
}

export const ChatWidget = ({ projectId }: ChatWidgetProps = {}) => {
  const [isOpen, setIsOpen] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentLoadingStatus, setCurrentLoadingStatus] = useState<'QUEUED' | 'PROCESSING' | 'BUILDING' | null>(null)
  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [successfulBuildsCount, setSuccessfulBuildsCount] = useState(0)
  const [currentVersion, setCurrentVersion] = useState<number>(0)
  const { currentProject } = useProject()
  const navigate = useNavigate()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const lastStatusRef = useRef<string | null>(null)

  // Use explicit projectId prop if provided, otherwise fall back to context
  const activeProjectId = projectId || currentProject?.id

  // Media upload hook
  const {
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
  } = useMediaUpload({
    projectId: activeProjectId,
    onError: (message) => addSystemMessage(message, 'error'),
    maxFiles: 1,
  })

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

  // Fetch successful builds count and current version
  useEffect(() => {
    const fetchProjectDetails = async () => {
      if (!activeProjectId) {
        setSuccessfulBuildsCount(0)
        setCurrentVersion(0)
        return
      }

      try {
        const details = await ApiService.getProjectDetails(activeProjectId)
        // Count builds with status READY
        const readyBuilds = details.builds.filter(build => build.version > 0).length
        setSuccessfulBuildsCount(readyBuilds)
        setCurrentVersion(details.stats.currentVersion)
      } catch (error) {
        console.error('Failed to fetch project details:', error)
        setSuccessfulBuildsCount(0)
        setCurrentVersion(0)
      }
    }

    fetchProjectDetails()
  }, [activeProjectId])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPrompt.trim() || isSubmitting) return

    // If no active project, show a message
    if (!activeProjectId) {
      addSystemMessage('Please select a project first to build your app.', 'error')
      return
    }

    // Check if any images are still uploading
    if (hasUploadingFiles()) {
      addSystemMessage('Please wait for images to finish uploading', 'error')
      return
    }

    // Check if any images failed
    if (hasFailedFiles()) {
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
    const mediaIds = getMediaIds()

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
      setCurrentLoadingStatus('QUEUED')

      setIsProcessing(true)

      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status: JobStatus) => {
          // Update loading status for progress indicator
          if (status.status === 'QUEUED' || status.status === 'PROCESSING' || status.status === 'BUILDING') {
            setCurrentLoadingStatus(status.status)
          }

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
            setCurrentLoadingStatus(null)

            // Update builds count and current version after successful build
            setSuccessfulBuildsCount(prev => prev + 1)
            setCurrentVersion(prev => prev + 1)

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
            setCurrentLoadingStatus(null)
          }
        },
        (error) => {
          updateMessageStatus(messageId, 'failed')
          addSystemMessage(`❌ Error: ${error.message}`, 'error')
          setIsProcessing(false)
          setCurrentLoadingStatus(null)
        }
      )


      pollCleanupRef.current = cleanup

      // Clear attached images after successful submission
      clearFiles()
    } catch (error) {
      updateMessageStatus(messageId, 'failed')
      addSystemMessage(`❌ Failed to submit: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
      setIsProcessing(false)
      setCurrentLoadingStatus(null)
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

  const handleUndo = async () => {
    if (!activeProjectId) return

    setIsUndoing(true)
    setUndoError(null)

    try {
      const result = await ApiService.undoVersion(activeProjectId)

      // Update successful builds count and current version
      setSuccessfulBuildsCount(prev => Math.max(0, prev - 1))
      setCurrentVersion(result.version)

      // Close modal
      setIsUndoModalOpen(false)

      // Show success message
      addSystemMessage(`✅ Reverted to version ${result.version}`, 'success')

      // Dispatch event to reload preview
      setTimeout(() => {
        const cacheBustUrl = result.previewUrl.includes('?')
          ? `${result.previewUrl}&t=${Date.now()}`
          : `${result.previewUrl}?t=${Date.now()}`

        window.dispatchEvent(new CustomEvent('reloadPreview', {
          detail: {
            previewUrl: cacheBustUrl,
            forceReload: true
          }
        }))
      }, 500)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to undo version'
      setUndoError(errorMessage)
      addSystemMessage(`❌ ${errorMessage}`, 'error')
    } finally {
      setIsUndoing(false)
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
          <Card className={`w-80 flex flex-col shadow-2xl transition-all ${isExpanded ? 'h-[576px]' : 'h-auto'}`} isBlurred={true}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4">
              <Button
                variant="light"
                size="sm"
                onPress={() => navigate('/dashboard')}
                startContent={<ArrowLeft className="h-4 w-4" />}
              >
                Back to projects
              </Button>
              <div className="flex items-center gap-1">
                {successfulBuildsCount >= 2 && (
                  <Button
                    variant="light"
                    size="sm"
                    onPress={() => setIsUndoModalOpen(true)}
                    title="Undo last version"
                    isIconOnly
                    isDisabled={isProcessing || isSubmitting}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Collapse" : "Expand"}
                  isIconOnly
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Messages */}
            {isExpanded && (
              <div className="flex-1 overflow-y-auto px-4 space-y-3 py-4">
                {messages.filter(msg => msg.type === 'user').length === 0 && (
                  <div className="text-center py-12">
                    <div className="bg-content2 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <MessageCircle className="h-8 w-8 opacity-60" />
                    </div>
                    <p className="opacity-70 leading-relaxed">
                      {activeProjectId
                        ? "No prompts yet"
                        : "Select a project to start building!"
                      }
                    </p>
                  </div>
                )}

                {messages.filter(msg => msg.type === 'user').map((message) => (
                  <div
                    key={message.id}
                    className="flex justify-end"
                  >
                    <div className="max-w-[80%] rounded-2xl px-4 py-3 backdrop-blur-sm bg-primary text-primary-foreground shadow-sm">
                      <div className="flex items-start gap-2">
                        <span className="flex-1 leading-relaxed">{message.content}</span>
                        {getStatusIcon(message.status)}
                      </div>
                      <div className="opacity-60 mt-2 text-xs">
                        {formatTime(message.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Input */}
            <div className="p-4">
              <PromptInput
                value={currentPrompt}
                onChange={setCurrentPrompt}
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                onFileSelect={handleFileSelect}
                onRemoveFile={removeFile}
                attachedFiles={attachedImages}
                isSubmitting={isSubmitting || isProcessing}
                isDisabled={!activeProjectId || isSubmitting || isProcessing}
                placeholder={activeProjectId ? "Describe your changes..." : "Select a project first..."}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                isDragging={isDragging}
                loadingStatus={currentLoadingStatus}
              />
            </div>
          </Card>
        )}

        {/* Undo Confirmation Modal */}
        <Modal
          isOpen={isUndoModalOpen}
          onClose={() => {
            if (!isUndoing) {
              setIsUndoModalOpen(false)
              setUndoError(null)
            }
          }}
          size="md"
        >
          <ModalContent>
            <ModalHeader>Undo Last Version?</ModalHeader>
            <ModalBody>
              {undoError && (
                <Alert
                  color="danger"
                  variant="flat"
                  title="Error"
                  description={undoError}
                  className="mb-4"
                />
              )}
              <p>
                This will permanently delete the latest version (v{currentVersion}) and restore the previous version. This action cannot be undone.
              </p>
              <p className="text-sm opacity-70 mt-2">
                Are you sure you want to continue?
              </p>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="light"
                onPress={() => {
                  setIsUndoModalOpen(false)
                  setUndoError(null)
                }}
                isDisabled={isUndoing}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onPress={handleUndo}
                isLoading={isUndoing}
                isDisabled={isUndoing}
              >
                {isUndoing ? 'Undoing...' : 'Undo Version'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </>
  )
}