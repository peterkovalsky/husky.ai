import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type ChatMessage as APIChatMessage, type ChatMessageMedia } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Alert, Divider, Image } from '@heroui/react'
import { MessageCircle, Loader2, CheckCircle, AlertCircle, Undo2, Bot, SkipForward, FileText, X } from 'lucide-react'
import { PromptInput } from './PromptInput'
import { useMediaUpload } from '../hooks/useMediaUpload'
import type { OnboardingPhase, OnboardingChatMessage, OnboardingMessageMetadata } from '../types/onboarding'

// Map backend message types to frontend message types
const BACKEND_TYPE_TO_FRONTEND: Record<string, ChatMessage['type']> = {
  'USER_PROMPT': 'user',
  'AI_QUESTION': 'ai-question',
  'USER_ANSWER': 'user-answer',
  'INSPO_SELECTION': 'inspo-selection',
  'SYSTEM_STATUS': 'system',
  'SYSTEM_ERROR': 'system',
  'BUILD_RESULT': 'system',
  'AI_SUMMARY': 'ai-summary',
}

interface ChatMessage {
  id: string
  type: 'user' | 'system' | 'ai-question' | 'ai-summary' | 'user-answer' | 'inspo-selection'
  content: string
  timestamp: Date
  status?: 'sending' | 'processing' | 'completed' | 'failed'
  jobId?: string
  metadata?: OnboardingMessageMetadata
  mediaUrls?: ChatMessageMedia[]
}


export interface PageContext {
  path: string;
  title: string;
  sections: string[];
}

interface ChatWidgetProps {
  projectId?: string;
  projectName?: string;
  // Onboarding props
  onboardingPhase?: OnboardingPhase;
  onboardingMessages?: OnboardingChatMessage[];
  buildJustCompleted?: boolean;
  onAnnotate?: () => void;
  pageContextRef?: RefObject<PageContext | null>;
}

export const ChatWidget = ({
  projectId,
  onboardingPhase = 'NONE',
  onboardingMessages = [],
  buildJustCompleted = false,
  onAnnotate,
  pageContextRef,
}: ChatWidgetProps = {}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([])
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentLoadingStatus, setCurrentLoadingStatus] = useState<'QUEUED' | 'PROCESSING' | 'BUILDING' | null>(null)
  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [successfulBuildsCount, setSuccessfulBuildsCount] = useState(0)
  const [lastPromptText, setLastPromptText] = useState<string | null>(null)
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false)
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' | 'video' | 'doc'; textContent?: string } | null>(null)

  // Pagination state
  const [isLoadingInitial, setIsLoadingInitial] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [oldestMessageCursor, setOldestMessageCursor] = useState<string | null>(null)

  const { currentProject } = useProject()
  const navigate = useNavigate()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const lastStatusRef = useRef<string | null>(null)
  const initialLoadDoneRef = useRef(false)

  // Use explicit projectId prop if provided, otherwise fall back to context
  const activeProjectId = projectId || currentProject?.id

  // Check if onboarding is in progress (disable input during onboarding steps)
  const isOnboarding = onboardingPhase !== 'NONE' &&
    onboardingPhase !== 'BUILDING' &&
    onboardingPhase !== 'SUBMITTING'

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
    getAnnotationMediaIds,
    clearFiles,
    hasUploadingFiles,
    hasFailedFiles,
  } = useMediaUpload({
    projectId: activeProjectId,
    onError: (message) => addSystemMessage(message, 'error'),
    maxFiles: 5,
  })

  // Convert API chat messages to frontend ChatMessage format
  const mapApiMessages = (chatMessages: APIChatMessage[]): ChatMessage[] => {
    return chatMessages.map((msg) => ({
      id: msg.id,
      type: BACKEND_TYPE_TO_FRONTEND[msg.type] || 'system',
      content: msg.content,
      timestamp: new Date(msg.createdAt),
      status: msg.status === 'completed' ? 'completed' as const : msg.status === 'failed' ? 'failed' as const : 'processing' as const,
      metadata: {
        inspoThumbnail: msg.metadata?.inspoThumbnail,
        inspoName: msg.metadata?.inspoName,
        questionId: msg.questionId,
        isSkipped: msg.isSkipped,
      } as OnboardingMessageMetadata,
      mediaUrls: msg.mediaUrls,
    }))
  }

  // Re-fetch latest messages from API and merge with existing history
  const refreshConversationHistory = async () => {
    if (!activeProjectId) return
    const result = await ApiService.getChatMessages(activeProjectId, 10)
    if (result.chatMessages && result.chatMessages.length > 0) {
      const newMessages = mapApiMessages(result.chatMessages)

      setConversationHistory(prev => {
        // Merge: keep older messages that aren't in the new batch, then append new
        const newIds = new Set(newMessages.map(m => m.id))
        const olderMessages = prev.filter(m => !newIds.has(m.id))
        return [...olderMessages, ...newMessages]
      })
      setMessages([]) // Clear session messages since they're now in conversation history

      // Update cursor and hasMore
      setHasMore(result.hasMore)
      // Don't update cursor since we may have older messages already loaded
    }
  }

  // Listen for annotation completion event from ProjectPage
  useEffect(() => {
    const handleAnnotationComplete = (event: CustomEvent) => {
      const file = event.detail?.file as File | undefined
      if (file) {
        // Create a FileList-like object from the annotation file
        const dt = new DataTransfer()
        dt.items.add(file)
        handleFileSelect(dt.files, { isAnnotation: true })
      }
    }

    window.addEventListener('annotationComplete', handleAnnotationComplete as EventListener)
    return () => {
      window.removeEventListener('annotationComplete', handleAnnotationComplete as EventListener)
    }
  }, [handleFileSelect])

  const scrollToBottom = (instant = false) => {
    if (instant) {
      // Jump to bottom without animation (for initial load)
      const container = scrollContainerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Scroll to bottom on initial load (instant, no animation)
  useEffect(() => {
    if (!isLoadingInitial && conversationHistory.length > 0 && initialLoadDoneRef.current) {
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        scrollToBottom(true)
      })
    }
  }, [isLoadingInitial]) // Only trigger when initial load completes

  // Smooth scroll for new session messages and onboarding messages
  useEffect(() => {
    if (messages.length > 0 || onboardingMessages.length > 0) {
      scrollToBottom()
    }
  }, [messages, onboardingMessages])

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
        return
      }

      try {
        const details = await ApiService.getProjectDetails(activeProjectId)
        // Count builds with status READY
        const readyBuilds = details.builds.filter(build => build.version > 0).length
        setSuccessfulBuildsCount(readyBuilds)
      } catch (error) {
        console.error('Failed to fetch project details:', error)
        setSuccessfulBuildsCount(0)
      }
    }

    fetchProjectDetails()
  }, [activeProjectId])

  // Fetch initial chat messages (paginated)
  useEffect(() => {
    const fetchInitialMessages = async () => {
      if (!activeProjectId) {
        setConversationHistory([])
        setLastPromptText(null)
        setHasMore(false)
        setOldestMessageCursor(null)
        initialLoadDoneRef.current = false
        return
      }

      setIsLoadingInitial(true)
      try {
        const result = await ApiService.getChatMessages(activeProjectId, 10)

        console.log('[ChatWidget] Fetched initial chat messages:', {
          projectId: activeProjectId,
          count: result.chatMessages.length,
          hasMore: result.hasMore,
        })

        if (result.chatMessages.length > 0) {
          const historyMessages = mapApiMessages(result.chatMessages)
          setConversationHistory(historyMessages)
          setHasMore(result.hasMore)

          // Set cursor to the oldest message's createdAt
          const oldest = result.chatMessages[0]
          setOldestMessageCursor(oldest.createdAt)

          // Find the last user prompt for undo modal
          const userPrompts = historyMessages.filter(m => m.type === 'user' && m.status === 'completed')
          if (userPrompts.length > 0) {
            setLastPromptText(userPrompts[userPrompts.length - 1].content)
          } else {
            setLastPromptText(null)
          }
        } else {
          setConversationHistory([])
          setHasMore(false)
          setOldestMessageCursor(null)
          setLastPromptText(null)
        }

        initialLoadDoneRef.current = true
      } catch (error) {
        console.error('Failed to fetch conversation history:', error)
        setConversationHistory([])
        setLastPromptText(null)
        setHasMore(false)
        setOldestMessageCursor(null)
      } finally {
        setIsLoadingInitial(false)
      }
    }

    fetchInitialMessages()
  }, [activeProjectId])

  // Re-fetch latest messages when a build just completed
  useEffect(() => {
    if (buildJustCompleted && activeProjectId && initialLoadDoneRef.current) {
      refreshConversationHistory().catch(err => {
        console.error('Failed to refresh after build completion:', err)
      })
    }
  }, [buildJustCompleted, activeProjectId])

  // Load older messages when scrolling to top
  const loadOlderMessages = useCallback(async () => {
    if (!activeProjectId || !hasMore || isLoadingMore || !oldestMessageCursor) return

    setIsLoadingMore(true)
    const container = scrollContainerRef.current
    const previousScrollHeight = container?.scrollHeight || 0

    try {
      const result = await ApiService.getChatMessages(activeProjectId, 10, oldestMessageCursor)

      if (result.chatMessages.length > 0) {
        const olderMessages = mapApiMessages(result.chatMessages)

        setConversationHistory(prev => [...olderMessages, ...prev])
        setHasMore(result.hasMore)

        // Update cursor to the oldest message
        const oldest = result.chatMessages[0]
        setOldestMessageCursor(oldest.createdAt)

        // Preserve scroll position after DOM update
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight
            container.scrollTop = newScrollHeight - previousScrollHeight
          }
        })
      } else {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Failed to load older messages:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [activeProjectId, hasMore, isLoadingMore, oldestMessageCursor])

  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoadingInitial) {
          loadOlderMessages()
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.1,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, isLoadingInitial, loadOlderMessages])

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

    // Get mediaIds from ready images
    const mediaIds = getMediaIds()
    const annotationMediaIds = getAnnotationMediaIds()

    // Create media URLs from attached images for immediate display
    const localMediaUrls: ChatMessageMedia[] = attachedImages
      .filter(img => img.uploadStatus === 'ready' && img.mediaId)
      .map(img => ({
        id: img.mediaId!,
        thumbnailUrl: img.preview, // Use blob URL for thumbnail
        fullUrl: img.preview,      // Use blob URL for full view
        type: (img.file.type.startsWith('video/') ? 'video' :
               img.file.type.startsWith('image/') ? 'image' : 'doc') as 'image' | 'video' | 'doc',
        mimeType: img.file.type,
      }))

    const userMessage: ChatMessage = {
      id: messageId,
      type: 'user',
      content: currentPrompt.trim(),
      timestamp: new Date(),
      status: 'sending',
      mediaUrls: localMediaUrls.length > 0 ? localMediaUrls : undefined,
    }

    console.log('[ChatWidget] Attached images:', attachedImages)
    console.log('[ChatWidget] Media IDs to submit:', mediaIds)

    setMessages(prev => [...prev, userMessage])
    setCurrentPrompt('')
    clearFiles(false)
    setIsSubmitting(true)

    try {
      // Capture current page context from preview iframe
      const pageContext = pageContextRef?.current || undefined

      console.log('[ChatWidget] Submitting prompt with mediaIds:', mediaIds, 'pageContext:', pageContext)
      const response = await ApiService.submitPrompt(
        userMessage.content,
        activeProjectId,
        mediaIds.length > 0 ? mediaIds : undefined,
        undefined, // clarificationAnswers
        undefined, // analysisId
        undefined, // skippedClarification
        undefined, // inspoId
        undefined, // chatMessages
        annotationMediaIds.length > 0 ? annotationMediaIds : undefined,
        pageContext
      )
      console.log('[ChatWidget] Submit response:', response)

      // Check for insufficient credits
      if (response.insufficientCredits) {
        updateMessageStatus(messageId, 'failed')
        addSystemMessage(`💳 ${response.message || "You've run out of credits. Purchase more to continue building."}`, 'error')
        setShowInsufficientCredits(true)
        return
      }

      const jobIdToTrack = response.promptId || response.jobId
      if (!jobIdToTrack) {
        updateMessageStatus(messageId, 'failed')
        addSystemMessage('❌ Error: No job ID returned from server', 'error')
        return
      }

      updateMessageStatus(messageId, 'processing', jobIdToTrack)

      lastStatusRef.current = 'QUEUED'
      setCurrentLoadingStatus('QUEUED')

      setIsProcessing(true)

      const cleanup = await ApiService.pollJobStatus(
        jobIdToTrack,
        (status: JobStatus) => {
          // Update loading status for progress indicator
          if (status.status === 'QUEUED' || status.status === 'PROCESSING' || status.status === 'BUILDING') {
            setCurrentLoadingStatus(status.status)
          }

          // Track status transitions (loading indicator is handled by PromptInput)
          if (status.status !== lastStatusRef.current) {
            lastStatusRef.current = status.status
          }

          if (status.status === 'NEEDS_RESPONSE' && status.aiQuestion) {
            updateMessageStatus(messageId, 'completed')
            setIsProcessing(false)
            setCurrentLoadingStatus(null)

            refreshConversationHistory().catch(err => {
              console.error('Failed to refresh conversation history:', err)
            })
            return
          }

          if (status.status === 'READY' && status.previewUrl) {
            updateMessageStatus(messageId, 'completed')
            setIsProcessing(false)
            setCurrentLoadingStatus(null)

            // Update builds count after successful build
            setSuccessfulBuildsCount(prev => prev + 1)

            // Update last prompt text for undo modal
            setLastPromptText(userMessage.content)

            // Re-fetch conversation history to display persisted AI summary
            refreshConversationHistory().catch(err => {
              console.error('Failed to refresh conversation history after build:', err)
            })

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
            setIsProcessing(false)
            setCurrentLoadingStatus(null)

            // Re-fetch conversation history to display persisted error message
            refreshConversationHistory().catch(() => {
              // If re-fetch fails, fall back to ephemeral message
              addSystemMessage(`Build failed: ${status.errorMessage || 'Unknown error'}`, 'error')
            })
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

      // Update successful builds count
      setSuccessfulBuildsCount(prev => Math.max(0, prev - 1))

      // Re-fetch conversation history from API (undo deletes chat messages server-side)
      const chatResult = await ApiService.getChatMessages(activeProjectId, 10)
      if (chatResult.chatMessages.length > 0) {
        const historyMessages = mapApiMessages(chatResult.chatMessages)
        setConversationHistory(historyMessages)
        setHasMore(chatResult.hasMore)
        const oldestMsg = chatResult.chatMessages[0]
        setOldestMessageCursor(oldestMsg.createdAt)

        const userPrompts = historyMessages.filter(m => m.type === 'user' && m.status === 'completed')
        setLastPromptText(userPrompts.length > 0 ? userPrompts[userPrompts.length - 1].content : null)
      } else {
        setConversationHistory([])
        setHasMore(false)
        setOldestMessageCursor(null)
        setLastPromptText(null)
      }
      setMessages([])

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

  // Render a single message based on its type
  const renderMessage = (message: ChatMessage | OnboardingChatMessage, showUndo?: boolean, onUndoClick?: () => void) => {
    const isAiMessage = message.type === 'ai-question' || message.type === 'ai-summary' || message.type === 'system'
    const isUserMessage = message.type === 'user' || message.type === 'user-answer'
    const isInspoSelection = message.type === 'inspo-selection'

    // AI/System messages - left aligned
    if (isAiMessage) {
      return (
        <div key={message.id} className="flex justify-start">
          <div className="max-w-[85%] flex items-start gap-2">
            <div className="bg-primary/10 rounded-full p-2 flex-shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-default-100 shadow-sm">
              <span className="leading-relaxed break-words text-sm">{message.content}</span>
              <div className="opacity-60 mt-2 text-xs">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Inspo selection - right aligned with thumbnail
    if (isInspoSelection) {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="max-w-[85%]">
            <div className="rounded-2xl px-4 py-3 bg-[#2d2d2d] text-white shadow-sm">
              {message.metadata?.inspoThumbnail && (
                <div className="mb-2">
                  <Image
                    src={message.metadata.inspoThumbnail}
                    alt={message.metadata.inspoName || 'Selected inspiration'}
                    className="w-32 h-40 object-cover object-top rounded-lg"
                  />
                </div>
              )}
              <span className="leading-relaxed break-words text-sm">
                {message.content || `Selected: ${message.metadata?.inspoName || 'Design inspiration'}`}
              </span>
              <div className="opacity-60 mt-2 text-xs">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // User answer with skipped indicator
    if (message.type === 'user-answer' && message.metadata?.isSkipped) {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="max-w-[85%]">
            <div className="rounded-2xl px-4 py-3 bg-default-200 text-default-600 shadow-sm">
              <div className="flex items-center gap-2">
                <SkipForward className="h-4 w-4" />
                <span className="leading-relaxed text-sm italic">Skipped</span>
              </div>
              <div className="opacity-60 mt-2 text-xs">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // User messages - right aligned (default styling)
    if (isUserMessage) {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="relative group max-w-[85%]">
            <div className="rounded-2xl px-4 py-3 bg-[#2d2d2d] text-white shadow-sm">
              <div className="flex items-start gap-2">
                <span className="flex-1 leading-relaxed break-words text-sm">{message.content}</span>
                {getStatusIcon(message.status)}
              </div>
              {/* Media attachments - shown below the prompt */}
              {message.mediaUrls && message.mediaUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.mediaUrls.map((media) => (
                    <button
                      key={media.id}
                      className="relative w-16 h-16 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        if (media.mimeType === 'text/plain') {
                          fetch(media.fullUrl)
                            .then(res => res.text())
                            .then(textContent => setLightboxMedia({ url: media.fullUrl, type: 'doc', textContent }))
                            .catch(() => setLightboxMedia({ url: media.fullUrl, type: media.type }))
                        } else {
                          setLightboxMedia({ url: media.fullUrl, type: media.type })
                        }
                      }}
                    >
                      {media.type === 'video' ? (
                        <video
                          src={media.thumbnailUrl}
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : media.type === 'image' ? (
                        <Image src={media.thumbnailUrl} className="w-full h-full object-cover" removeWrapper />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/10 rounded-lg">
                          <div className="text-center px-1">
                            <FileText className="h-6 w-6 mx-auto mb-0.5 text-white/60" />
                            <p className="text-[8px] text-white/60 truncate max-w-full">TXT</p>
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="opacity-60 mt-2 text-xs">
                {formatTime(message.timestamp)}
              </div>
            </div>
            {showUndo && (
              <button
                className="absolute -bottom-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-default-100 hover:bg-default-200 rounded-full p-1.5 text-default-500 shadow-sm cursor-pointer"
                onClick={onUndoClick}
                title="Undo this version"
              >
                <Undo2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )
    }

    // Default fallback
    return null
  }

  return (
    <>
      {/* Full-height sidebar */}
      <div className="h-full flex flex-col bg-white">
        {/* Conversation history */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Loading indicator for initial load */}
          {isLoadingInitial && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {/* Sentinel for infinite scroll + loading indicator for older messages */}
          {!isLoadingInitial && hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-2">
              {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-default-400" />}
            </div>
          )}

          {!isLoadingInitial && conversationHistory.length === 0 && messages.filter(msg => msg.type === 'user').length === 0 && onboardingMessages.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-content2 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <MessageCircle className="h-8 w-8 opacity-60" />
              </div>
              <p className="opacity-70 leading-relaxed">
                {activeProjectId
                  ? "No prompts yet. Start building your app!"
                  : "Select a project to start building!"
                }
              </p>
            </div>
          )}

          {/* Render onboarding messages (only during active onboarding, not after completion) */}
          {/* After build completes, messages come from conversationHistory instead */}
          {onboardingPhase !== 'NONE' && onboardingMessages.map((message) => renderMessage(message))}

          {/* Display conversation history (all message types: user prompts, AI questions, answers, inspo) */}
          {(() => {
            // Determine which message is the last completed user prompt (eligible for undo)
            const sessionUserMessages = messages.filter(msg => msg.type === 'user')
            const allCompletedUserPrompts = [
              ...conversationHistory.filter(m => m.type === 'user' && m.status === 'completed'),
              ...sessionUserMessages.filter(m => m.status === 'completed')
            ]
            const lastCompletedId = allCompletedUserPrompts.length > 0
              ? allCompletedUserPrompts[allCompletedUserPrompts.length - 1].id
              : null

            return (
              <>
                {/* Render all conversation history messages using renderMessage */}
                {conversationHistory.map((message) => {
                  const isLastCompletedPrompt = message.id === lastCompletedId
                  const showUndoButton = isLastCompletedPrompt && successfulBuildsCount >= 2 && !isProcessing && !isSubmitting

                  return renderMessage(message, showUndoButton, () => setIsUndoModalOpen(true))
                })}

                {/* Display current session messages in chronological order */}
                {messages.map((message) => {
                  const isLastCompletedPrompt = message.id === lastCompletedId
                  const showUndoButton = message.type === 'user' && isLastCompletedPrompt && successfulBuildsCount >= 2 && !isProcessing && !isSubmitting

                  return renderMessage(message, showUndoButton, () => setIsUndoModalOpen(true))
                })}
              </>
            )
          })()}

          <div ref={messagesEndRef} />
        </div>

        <Divider />

        {/* Insufficient credits alert */}
        {showInsufficientCredits && (
          <div className="px-4 pt-4">
            <Alert
              color="warning"
              variant="flat"
              title="Out of credits"
              description="You've run out of credits. Purchase more to continue building your app."
              endContent={
                <Button
                  color="warning"
                  variant="solid"
                  size="sm"
                  onPress={() => {
                    setShowInsufficientCredits(false)
                    navigate('/billing')
                  }}
                >
                  Purchase Credits
                </Button>
              }
              onClose={() => setShowInsufficientCredits(false)}
              isClosable
            />
          </div>
        )}

        {/* Input area at bottom */}
        <div className="p-4 bg-white">
          <PromptInput
            value={currentPrompt}
            onChange={setCurrentPrompt}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            onFileSelect={handleFileSelect}
            onRemoveFile={removeFile}
            attachedFiles={attachedImages}
            isSubmitting={isSubmitting || isProcessing}
            isDisabled={!activeProjectId || isSubmitting || isProcessing || isOnboarding}
            placeholder={
              isOnboarding
                ? "Complete the setup steps above..."
                : activeProjectId
                  ? "Describe your changes..."
                  : "Select a project first..."
            }
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            isDragging={isDragging}
            loadingStatus={currentLoadingStatus}
            onAnnotate={onAnnotate}
            onPreviewFile={(file) => {
              if (file.file.type === 'text/plain') {
                // Read text file content for preview
                file.file.text().then(textContent => {
                  setLightboxMedia({ url: file.preview, type: 'doc', textContent })
                })
              } else {
                const type = file.file.type.startsWith('video/') ? 'video' : 'image' as const
                setLightboxMedia({ url: file.preview, type })
              }
            }}
          />
        </div>
      </div>

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
            <p className="mb-3">
              This will undo the following prompt:
            </p>
            {lastPromptText && (
              <div className="bg-default-100 rounded-lg p-3 mb-3">
                <p className="text-sm italic break-words">
                  "{lastPromptText.length > 150 ? lastPromptText.substring(0, 150) + '...' : lastPromptText}"
                </p>
              </div>
            )}
            <p>
              This version will be permanently deleted and the previous version restored.
            </p>
            <p className="text-sm opacity-70 mt-2">
              This action cannot be undone. Are you sure?
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

      {/* Media Lightbox Modal - rendered via portal to escape chat widget */}
      {lightboxMedia && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxMedia(null)}
        >
          <Button
            isIconOnly
            variant="light"
            className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white"
            onPress={() => setLightboxMedia(null)}
          >
            <X className="h-5 w-5" />
          </Button>
          <div
            className="max-w-[90vw] max-h-[90vh] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {lightboxMedia.type === 'video' ? (
              <video
                src={lightboxMedia.url}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
            ) : lightboxMedia.type === 'image' ? (
              <Image
                src={lightboxMedia.url}
                className="max-w-full max-h-[90vh] object-contain"
                removeWrapper
              />
            ) : lightboxMedia.textContent ? (
              <div className="bg-content1 rounded-lg p-6 max-w-[80vw] max-h-[80vh] overflow-auto">
                <pre className="text-sm whitespace-pre-wrap break-words font-mono">{lightboxMedia.textContent}</pre>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}