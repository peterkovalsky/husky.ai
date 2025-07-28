import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type Prompt } from '../services/api'
import { LoadingSpinner } from './LoadingSpinner'
import { Timer } from './Timer'
import { IterationHistory } from './IterationHistory'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../contexts/ProjectContext'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardHeader } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { Code2, Settings, Plus, RotateCcw, ExternalLink, Loader2, AlertCircle, Clock, ArrowRight, RefreshCw, ArrowLeft } from 'lucide-react'

type AppState = 'initial' | 'submitted' | 'loading' | 'ready' | 'error'

export const Dashboard = () => {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generationTime, setGenerationTime] = useState<number>(0)
  const [showIterations, setShowIterations] = useState(false)
  const [, setSelectedIteration] = useState<Prompt | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const startTimeRef = useRef<Date | null>(null)
  const { user, signOut } = useAuth()
  const { currentProject } = useProject()
  const location = useLocation()
  const navigate = useNavigate()
  
  const isEditMode = location.pathname.includes('/edit')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!prompt.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setGenerationTime(0)
    startTimeRef.current = new Date()

    try {
      const response = await ApiService.submitPrompt(prompt.trim(), currentProject?.id)
      setJobId(response.promptId || response.jobId)
      setAppState('submitted')
      
      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status) => {
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            setAppState('ready')
            // Calculate final generation time
            if (startTimeRef.current) {
              const endTime = new Date()
              const timeDiff = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000)
              setGenerationTime(timeDiff)
            }
          } else if (status.status === 'FAILED' || status.errorMessage) {
            setError(status.errorMessage || 'Job failed to complete')
            setAppState('error')
            // Calculate time even for failed jobs
            if (startTimeRef.current) {
              const endTime = new Date()
              const timeDiff = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000)
              setGenerationTime(timeDiff)
            }
          } else {
            setAppState('loading')
          }
        },
        (error) => {
          setError(error.message)
          setAppState('error')
          // Calculate time even for error cases
          if (startTimeRef.current) {
            const endTime = new Date()
            const timeDiff = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000)
            setGenerationTime(timeDiff)
          }
        }
      )
      
      pollCleanupRef.current = cleanup
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit prompt')
      setAppState('error')
      // Calculate time even for error cases
      if (startTimeRef.current) {
        const endTime = new Date()
        const timeDiff = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000)
        setGenerationTime(timeDiff)
      }
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

  const handleReset = () => {
    setPrompt('')
    setAppState('initial')
    setJobId(null)
    setJobStatus(null)
    setError(null)
    setIsSubmitting(false)
    setGenerationTime(0)
    setSelectedIteration(null)
    startTimeRef.current = null
    
    if (pollCleanupRef.current) {
      pollCleanupRef.current()
      pollCleanupRef.current = null
    }
  }

  const handleNewIteration = () => {
    setPrompt('')
    setAppState('initial')
    setJobId(null)
    setJobStatus(null)
    setError(null)
    setIsSubmitting(false)
    setGenerationTime(0)
    setSelectedIteration(null)
    startTimeRef.current = null
    
    if (pollCleanupRef.current) {
      pollCleanupRef.current()
      pollCleanupRef.current = null
    }
    
    // Focus the textarea for immediate typing
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 100)
  }

  const handleSelectIteration = (iteration: Prompt) => {
    setSelectedIteration(iteration)
    setPrompt(iteration.prompt)
    
    // If the iteration is ready, we might want to load its preview
    if (iteration.status === 'READY') {
      // For now, just show the prompt. Later we could load the preview too.
      setAppState('initial')
    } else {
      setAppState('initial')
    }
    
    setJobId(null)
    setJobStatus(null)
    setError(null)
    setGenerationTime(0)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current()
      }
    }
  }, [])

  const isInitialState = appState === 'initial'
  const showPreview = appState === 'ready' && jobStatus?.previewUrl

  return (
    <div className="min-h-screen bg-background">
      {/* Header Navigation */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              {isEditMode && currentProject && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/project/${currentProject.id}`)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Preview
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}
              <h1 className="text-2xl font-bold">Husky AI</h1>
              {currentProject && (
                <>
                  <Separator orientation="vertical" className="h-6" />
                  <span className="text-sm font-medium text-muted-foreground">{currentProject.name}</span>
                </>
              )}
            </div>

            {/* Center - Timer and Controls */}
            <div className="flex items-center gap-4">
              <Timer 
                isRunning={appState === 'submitted' || appState === 'loading'} 
                className="hidden sm:flex"
              />
              {currentProject && !isInitialState && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowIterations(!showIterations)}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Iterations
                </Button>
              )}
            </div>
            
            {/* User Menu Dropdown */}
            <div className="hs-dropdown relative inline-flex">
              <button 
                id="hs-dropdown-with-header" 
                type="button" 
                className="hs-dropdown-toggle w-8 h-8 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-full border border-transparent hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-haspopup="menu" 
                aria-expanded="false" 
                aria-label="Dropdown"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              </button>

              <div className="hs-dropdown-menu transition-[opacity,margin] duration hs-dropdown-open:opacity-100 opacity-0 hidden min-w-60 bg-popover shadow-md rounded-lg p-2 mt-2 after:h-4 after:absolute after:-top-4 after:start-0 after:w-full before:h-4 before:absolute before:-top-4 before:start-0 before:w-full" 
                   role="menu" 
                   aria-orientation="vertical" 
                   aria-labelledby="hs-dropdown-with-header">
                <div className="py-3 px-5 -m-2 bg-muted rounded-t-lg">
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium truncate">
                    {user?.user_metadata?.display_name || user?.email}
                  </p>
                </div>
                <div className="mt-2 py-2 first:pt-0 last:pb-0">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm hover:bg-accent focus:outline-none focus:bg-accent w-full text-left"
                  >
                    <svg className="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16,17 21,12 16,7"/>
                      <line x1="21" x2="9" y1="12" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${isInitialState ? 'flex items-center justify-center min-h-[calc(100vh-4rem)]' : 'pt-8 pb-6'} transition-all duration-700 ease-in-out`}>
        <div className={`w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8`}>
          <div className={`${isInitialState ? 'text-center' : 'mb-6'}`}>
            {isInitialState && (
              <div className="mb-8">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Code2 className="w-8 h-8 text-primary-foreground" />
                  </div>
                </div>
                <h1 className="text-5xl font-bold mb-4">
                  Husky AI
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                  Describe your app idea and we'll build it for you instantly
                </p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="relative">
              <Card className={`${isInitialState ? 'max-w-2xl mx-auto' : ''}`}>
                <CardContent className="p-6">
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe the app you want to build... (Press Enter to submit)"
                      className={`${isInitialState ? 'min-h-[120px]' : 'min-h-[80px]'} resize-none`}
                      disabled={isSubmitting || (appState !== 'initial' && appState !== 'error')}
                    />
                    
                    {/* Submit Button - positioned in bottom right of textarea for initial state */}
                    {isInitialState && (
                      <Button
                        type="submit"
                        disabled={!prompt.trim() || isSubmitting}
                        className="absolute bottom-3 right-3"
                        size="sm"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Building...
                          </>
                        ) : (
                          <>
                            Build App
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  
                  {!isInitialState && (
                    <>
                      <Separator className="my-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={handleNewIteration}
                            variant="secondary"
                            size="sm"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            New Iteration
                          </Button>
                          
                          <Button
                            type="button"
                            onClick={handleReset}
                            variant="outline"
                            size="sm"
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Start Over
                          </Button>
                        </div>
                        
                        <div className="flex items-center gap-x-4">
                          {/* Show timer on mobile/smaller screens when running */}
                          <Timer 
                            isRunning={appState === 'submitted' || appState === 'loading'} 
                            className="sm:hidden"
                          />
                          
                          {/* Show final generation time when completed */}
                          {generationTime > 0 && (appState === 'ready' || appState === 'error') && (
                            <Badge variant="secondary">
                              <Clock className="mr-1 h-3 w-3" />
                              Generated in {Math.floor(generationTime / 60)}:{(generationTime % 60).toString().padStart(2, '0')}
                            </Badge>
                          )}
                          
                          {jobId && (
                            <Badge variant="outline">
                              <span className="size-1.5 inline-block rounded-full bg-primary mr-1.5"></span>
                              Job ID: {jobId.slice(0, 8)}...
                            </Badge>
                          )}
                          {appState === 'error' && (
                            <Button
                              type="submit"
                              disabled={!prompt.trim() || isSubmitting}
                              size="sm"
                            >
                              {isSubmitting ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Retry
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </form>
          </div>
        </div>
      </div>

      {!isInitialState && (
        <div className="flex-1 flex">
          {/* Iterations Sidebar */}
          {showIterations && currentProject && (
            <div className="w-80 bg-muted/30 border-r flex-shrink-0">
              <div className="h-full overflow-y-auto p-4">
                <IterationHistory
                  projectId={currentProject.id}
                  currentPromptId={jobId || undefined}
                  onSelectIteration={handleSelectIteration}
                  className="sticky top-0"
                />
              </div>
            </div>
          )}
          
          {/* Main Content */}
          <div className="flex-1 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
            {appState === 'error' && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {(appState === 'submitted' || appState === 'loading') && (
              <div className="flex items-center justify-center py-16">
                <LoadingSpinner status={jobStatus?.status} />
              </div>
            )}

            {showPreview && jobStatus?.previewUrl && (
              <Card className="overflow-hidden">
                <CardHeader className="bg-muted/50">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      <span className="size-1.5 inline-block rounded-full bg-green-800 mr-1.5"></span>
                      Preview Ready
                    </Badge>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                    >
                      <a
                        href={jobStatus.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Open in New Tab
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative" style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
                    <iframe
                      src={jobStatus.previewUrl}
                      className="w-full h-full border-0"
                      title="App Preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Widget */}
    </div>
  )
}