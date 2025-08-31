import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { Button, Textarea, Card, CardBody, Chip, Spinner } from '@heroui/react'
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
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />
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
            className="rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow"
            color="primary"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        )}

        {/* Chat Window */}
        {isOpen && (
          <Card className="w-80 h-[576px] shadow-xl border-2 py-0">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                <span className="font-medium">{currentProject?.name || 'Quick Build'}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => navigate('/')}
                  className="text-primary-foreground h-8 w-8 p-0 cursor-pointer min-w-8"
                  title="Back to Projects"
                  isIconOnly
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => setIsOpen(false)}
                  className="text-primary-foreground h-8 w-8 p-0 cursor-pointer min-w-8"
                  isIconOnly
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 space-y-3 h-96">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>
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
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.status === 'failed'
                        ? 'bg-red-50 text-red-800 border border-red-200'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1">{message.content}</span>
                      {message.type === 'user' && getStatusIcon(message.status)}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {formatTime(message.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm max-w-[80%]">
                    <Spinner size="sm" className="text-muted-foreground" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <CardBody className="p-3 border-t">
              <form onSubmit={handleSubmit} className="space-y-2">
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={currentPrompt}
                    onValueChange={setCurrentPrompt}
                    onKeyDown={handleKeyDown}
                    placeholder={currentProject ? "Describe your changes..." : "Select a project first..."}
                    className="pr-12"
                    classNames={{
                      input: "min-h-[60px] max-h-[120px] resize-none text-sm"
                    }}
                    isDisabled={isSubmitting || !currentProject}
                    minRows={2}
                    maxRows={5}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    isDisabled={!currentPrompt.trim() || isSubmitting || !currentProject}
                    className="absolute bottom-2 right-2 h-8 w-8 p-0 min-w-8"
                    isIconOnly
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {currentProject && (
                  <div className="flex items-center gap-2">
                    <Chip variant="bordered" size="sm" className="text-xs">
                      {currentProject.name}
                    </Chip>
                    <span className="text-xs text-muted-foreground">
                      Press Enter to send
                    </span>
                  </div>
                )}
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  )
}