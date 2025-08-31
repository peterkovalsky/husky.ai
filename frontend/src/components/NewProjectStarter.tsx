import { useState, useRef } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Button, Textarea } from '@heroui/react'
import { NewProjectLoading } from './NewProjectLoading'
import { ArrowRight, Loader2, ArrowLeft, LogOut } from 'lucide-react'
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem
} from '@heroui/react'
import { ChatWidget } from './ChatWidget'

interface NewProjectStarterProps {
  projectId: string
  projectName: string
}

type AppState = 'initial' | 'submitted' | 'loading' | 'ready' | 'error'

export const NewProjectStarter = ({ projectId, projectName }: NewProjectStarterProps) => {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!prompt.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await ApiService.submitPrompt(prompt.trim(), projectId)
      setAppState('submitted')
      
      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status) => {
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            setAppState('ready')
          } else if (status.status === 'FAILED' || status.errorMessage) {
            setError(status.errorMessage || 'Generation failed')
            setAppState('error')
          } else {
            setAppState('loading')
          }
        },
        (error) => {
          setError(error.message)
          setAppState('error')
        }
      )
      
      pollCleanupRef.current = cleanup
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit prompt')
      setAppState('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  // Listen for preview reload events from ChatWidget
  React.useEffect(() => {
    const handleReloadPreview = (event: CustomEvent) => {
      const { previewUrl } = event.detail
      
      // Update the job status with new preview URL if provided
      setJobStatus(prev => {
        if (previewUrl && prev) {
          return { ...prev, previewUrl }
        }
        return prev
      })
      
      // Force iframe reload by changing key
      setIframeKey(prev => prev + 1)
    }

    window.addEventListener('reloadPreview', handleReloadPreview as EventListener)
    
    return () => {
      window.removeEventListener('reloadPreview', handleReloadPreview as EventListener)
      if (pollCleanupRef.current) {
        pollCleanupRef.current()
      }
    }
  }, [])

  // If app is ready and we have a preview URL, show the full-screen preview
  if (appState === 'ready' && jobStatus?.previewUrl) {
    return (
      <div className="h-screen flex flex-col">
        <iframe
          key={iframeKey}
          src={jobStatus.previewUrl}
          className="w-full h-full border-0"
          title="Project Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
        <ChatWidget />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Navigation */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="light"
                size="sm"
                onPress={() => navigate('/')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Projects
              </Button>
              <div className="w-px h-6 bg-border"></div>
              <h1 className="text-2xl font-bold">Husky AI</h1>
              <div className="w-px h-6 bg-border"></div>
              <span className="text-sm font-medium text-muted-foreground">{projectName}</span>
            </div>
            
            {/* User Menu Dropdown */}
            <Dropdown>
              <DropdownTrigger>
                <Button
                  isIconOnly
                  variant="light"
                  className="w-8 h-8 rounded-full p-0"
                >
                  <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                  </div>
                </Button>
              </DropdownTrigger>

              <DropdownMenu aria-label="User menu" className="w-60">
                <DropdownItem key="profile" textValue="Profile">
                  <div className="pb-0">
                    <p className="text-sm text-muted-foreground">Signed in as</p>
                    <p className="text-sm font-medium truncate">
                      {user?.user_metadata?.display_name || user?.email}
                    </p>
                  </div>
                </DropdownItem>
                <DropdownItem key="signout" onPress={handleSignOut} className="text-danger" color="danger">
                  <div className="flex items-center">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </div>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {appState === 'initial' && (
        <div 
          style={{
            background: '#fafafa',
            minHeight: 'calc(100vh - 4rem)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '60px 24px 24px'
          }}
        >
          {/* Greeting */}
          <div style={{
            fontSize: '48px',
            fontWeight: 400,
            color: '#1f2937',
            marginBottom: '8px',
            textAlign: 'center'
          }}>
            Good {(() => {
              const hour = new Date().getHours();
              if (hour < 12) return 'Morning';
              if (hour < 17) return 'Afternoon';
              return 'Evening';
            })()}, {user?.user_metadata?.display_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'}
          </div>
          
          <div style={{
            fontSize: '48px',
            fontWeight: 400,
            marginBottom: '32px',
            textAlign: 'center'
          }}>
            What's on <span style={{
              background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>your mind?</span>
          </div>
          
          {/* Orb */}
          <div style={{
            width: '120px',
            height: '120px',
            background: 'linear-gradient(135deg, #8b5cf6, #a855f7, #c084fc)',
            borderRadius: '50%',
            boxShadow: '0 20px 40px rgba(139, 92, 246, 0.3)',
            position: 'relative',
            overflow: 'hidden',
            marginBottom: '40px'
          }}>
            <div style={{
              position: 'absolute',
              top: '20%',
              left: '30%',
              width: '30%',
              height: '30%',
              background: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '50%',
              filter: 'blur(10px)'
            }}></div>
          </div>
          
          {/* Input */}
          <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '24px',
              padding: '16px 24px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '32px'
            }}>
              <button type="button" style={{
                background: '#f3f4f6',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#374151'
              }}>
                <span>📎</span>
                <span>Attach</span>
              </button>
              
              <Textarea
                ref={textareaRef}
                value={prompt}
                onValueChange={setPrompt}
                onKeyDown={handleKeyDown}
                placeholder="Ask AI a question or make a request"
                variant="bordered"
                classNames={{
                  input: "border-none outline-none bg-transparent resize-none text-base text-gray-700",
                  inputWrapper: "border-none shadow-none bg-transparent p-0 min-h-0 h-auto"
                }}
                isDisabled={isSubmitting}
                minRows={1}
                maxRows={1}
              />
              
              <button 
                type="submit" 
                style={{
                  background: !prompt.trim() || isSubmitting ? '#d1d5db' : '#1f2937',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: !prompt.trim() || isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
                disabled={!prompt.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
              </button>
            </div>
          </form>
          
          {/* Example Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            maxWidth: '1200px',
            width: '100%',
            marginTop: '16px'
          }}>
            <div 
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                setPrompt("Write a to-do list for a personal project");
                textareaRef.current?.focus();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                backgroundColor: '#fef3c7'
              }}>
                <span style={{ fontSize: '20px' }}>👤</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>
                Write a to-do list for a personal project
              </div>
            </div>
            
            <div 
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                setPrompt("Generate an email to reply to a job offer");
                textareaRef.current?.focus();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                backgroundColor: '#dbeafe'
              }}>
                <span style={{ fontSize: '20px' }}>✉️</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>
                Generate an email to reply to a job offer
              </div>
            </div>
            
            <div 
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                setPrompt("Summarize this article in one paragraph");
                textareaRef.current?.focus();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                backgroundColor: '#f3e8ff'
              }}>
                <span style={{ fontSize: '20px' }}>💬</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>
                Summarize this article in one paragraph
              </div>
            </div>
            
            <div 
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                setPrompt("How does AI work in a technical capacity");
                textareaRef.current?.focus();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                backgroundColor: '#ecfdf5'
              }}>
                <span style={{ fontSize: '20px' }}>🧠</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500 }}>
                How does AI work in a technical capacity
              </div>
            </div>
          </div>
          
          {/* Bottom Icons */}
          <div style={{
            display: 'flex',
            gap: '24px',
            marginTop: '40px',
            opacity: 0.6
          }}>
            <div style={{ fontSize: '24px' }}>👤</div>
            <div style={{ fontSize: '24px' }}>✉️</div>
            <div style={{ fontSize: '24px' }}>💬</div>
            <div style={{ fontSize: '24px' }}>⚙️</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {(appState === 'submitted' || appState === 'loading') && (
        <NewProjectLoading 
          currentStage={
            jobStatus?.status === 'QUEUED' ? 'analyzing' :
            jobStatus?.status === 'PROCESSING' ? 'generating' :
            jobStatus?.status === 'BUILDING' ? 'building' :
            'analyzing'
          }
        />
      )}

      {/* Error State */}
      {appState === 'error' && (
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <div className="w-8 h-8 bg-destructive rounded-full flex items-center justify-center">
                <span className="text-destructive-foreground text-sm font-bold">!</span>
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">Generation Failed</h3>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onPress={() => {
              setAppState('initial')
              setError(null)
              textareaRef.current?.focus()
            }}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}