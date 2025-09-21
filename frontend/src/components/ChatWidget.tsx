import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { Button, Textarea, Card, Spinner } from '@heroui/react'
import { MessageCircle, X, Send, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'

interface ChatMessage {
  id: string
  type: 'user' | 'system'
  content: string
  timestamp: Date
  status?: 'sending' | 'processing' | 'completed' | 'failed'
  jobId?: string
}

export const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentPrompt, setCurrentPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { currentProject } = useProject()
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const lastStatusRef = useRef<string | null>(null)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!currentPrompt.trim() || isSubmitting) return
    
    // If no current project, show a message
    if (!currentProject) {
      addSystemMessage('Please select a project first to build your app.', 'error')
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

    setMessages(prev => [...prev, userMessage])
    setCurrentPrompt('')
    setIsSubmitting(true)

    try {
      const response = await ApiService.submitPrompt(userMessage.content, currentProject.id)
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
                <span>{currentProject?.name || 'Quick Build'}</span>
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
                    {currentProject 
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
            <div className="p-4 border-t border-divider">
              <form onSubmit={handleSubmit}>
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={currentPrompt}
                    onValueChange={setCurrentPrompt}
                    onKeyDown={handleKeyDown}
                    placeholder={currentProject ? "Describe your changes..." : "Select a project first..."}
                    className="pr-12"
                    classNames={{
                      input: "min-h-[60px] max-h-[120px] resize-none"
                    }}
                    isDisabled={isSubmitting || !currentProject}
                    minRows={2}
                    maxRows={5}
                    variant="bordered"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    isDisabled={!currentPrompt.trim() || isSubmitting || !currentProject}
                    className="absolute bottom-2 right-2"
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
              </form>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}