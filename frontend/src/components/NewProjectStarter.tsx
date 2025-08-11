import { useState, useRef } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent } from './ui/card'
import { NewProjectLoading } from './NewProjectLoading'
import { ArrowRight, Loader2, ArrowLeft, LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      if (previewUrl && jobStatus) {
        setJobStatus(prev => prev ? { ...prev, previewUrl } : null)
      }
      
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
  }, [jobStatus])

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
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-8 h-8 rounded-full p-0"
                >
                  <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                  </div>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="pb-0">
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium truncate">
                    {user?.user_metadata?.display_name || user?.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {appState === 'initial' && (
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Hero Section */}
            <div className="mb-12">
              <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                What will you build today?
              </h1>
              <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
                Describe your app idea and we'll build it for you instantly
              </p>
            </div>
            
            {/* Input Section */}
            <form onSubmit={handleSubmit} className="relative max-w-3xl mx-auto">
              <Card className="border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 transition-colors">
                <CardContent className="p-8">
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe the app you want to build... (Press Enter to submit)"
                      className="min-h-[140px] resize-none text-lg border-0 bg-transparent placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                      disabled={isSubmitting}
                    />
                    
                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={!prompt.trim() || isSubmitting}
                      className="absolute bottom-4 right-4 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                      size="lg"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Building...
                        </>
                      ) : (
                        <>
                          Build App
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
            
            {/* Examples */}
            <div className="mt-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">Not sure where to start? Try one of these:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "A modern todo app with drag and drop",
                  "A crypto portfolio tracker dashboard", 
                  "A recipe sharing social network",
                  "A personal finance expense tracker"
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setPrompt(example)}
                    className="px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
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
            <Button onClick={() => {
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