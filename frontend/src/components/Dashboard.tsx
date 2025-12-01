import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type Prompt } from '../services/api'
import { LoadingSpinner } from './LoadingSpinner'
import { Timer } from './Timer'
import { IterationHistory } from './IterationHistory'
import { CreditWarningBanner } from './CreditWarningBanner'
import { useProject } from '../contexts/ProjectContext'
import { Button, Textarea, Card, CardBody, CardHeader, Chip, Divider } from '@heroui/react'
import { Code2, Settings, Plus, RotateCcw, ExternalLink, Loader2, AlertCircle, Clock, ArrowRight, RefreshCw } from 'lucide-react'

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
  const { currentProject, creditBalance, refreshCredits } = useProject()
  const location = useLocation()
  const navigate = useNavigate()
  
  const isEditMode = location.pathname.includes('/edit')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!prompt.trim() || isSubmitting) return

    // Check if user has credits before submitting
    if (creditBalance?.isOut) {
      setError('You are out of credits. Please upgrade your plan or purchase additional credits to continue.')
      return
    }

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
            // Refresh credits after successful build
            refreshCredits()
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    if (iteration.status === 'READY' || iteration.status === 'COMPLETED') {
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
      {/* Header Controls */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-4">
              {isEditMode && currentProject && (
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => navigate(`/project/${currentProject.id}`)}
                >
                  Back to Preview
                </Button>
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
                  variant="bordered"
                  size="sm"
                  onClick={() => setShowIterations(!showIterations)}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Iterations
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`${isInitialState ? 'flex items-center justify-center min-h-[calc(100vh-8rem)]' : 'pt-8 pb-6'} transition-all duration-700 ease-in-out`}>
        <div className={`w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8`}>
          <div className={`${isInitialState ? 'text-center' : 'mb-6'}`}>
            {isInitialState && (
              <div className="mb-8">
                <div className="mb-6">
                  <Code2 className="w-12 h-12 text-husky-500 mx-auto" />
                </div>
                <h1 className="text-5xl font-bold mb-4">
                  Husky AI
                </h1>
                <p className="text-xl text-muted-foreground mb-8">
                  Describe your app idea and we'll build it for you instantly
                </p>
              </div>
            )}

            {/* Credit Warning Banner */}
            {!isInitialState && <CreditWarningBanner showWhen="always" />}

            <form onSubmit={handleSubmit} className="relative">
              <Card className={`${isInitialState ? 'max-w-2xl mx-auto' : ''}`}>
                <CardBody className="p-6">
                  {/* Credit Warning Banner for initial state */}
                  {isInitialState && <CreditWarningBanner showWhen="always" />}

                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        creditBalance?.isOut
                          ? "Please upgrade your plan or purchase credits to continue..."
                          : "Describe the app you want to build... (Press Enter to submit)"
                      }
                      className={`${isInitialState ? 'min-h-[120px]' : 'min-h-[80px]'} resize-none`}
                      disabled={isSubmitting || (appState !== 'initial' && appState !== 'error') || creditBalance?.isOut}
                    />
                    
                    {/* Submit Button - positioned in bottom right of textarea for initial state */}
                    {isInitialState && (
                      <Button
                        type="submit"
                        disabled={!prompt.trim() || isSubmitting || creditBalance?.isOut}
                        className="absolute bottom-3 right-3"
                        size="sm"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Building...
                          </>
                        ) : creditBalance?.isOut ? (
                          <>
                            Out of Credits
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
                      <Divider className="my-4" />
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={handleNewIteration}
                            color="secondary"
                            size="sm"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            New Iteration
                          </Button>
                          
                          <Button
                            type="button"
                            onClick={handleReset}
                            variant="bordered"
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
                            <Chip color="secondary" size="sm">
                              <Clock className="mr-1 h-3 w-3" />
                              Generated in {Math.floor(generationTime / 60)}:{(generationTime % 60).toString().padStart(2, '0')}
                            </Chip>
                          )}
                          
                          {jobId && (
                            <Chip variant="bordered" size="sm">
                              <span className="size-1.5 inline-block rounded-full bg-primary mr-1.5"></span>
                              Job ID: {jobId.slice(0, 8)}...
                            </Chip>
                          )}
                          {appState === 'error' && (
                            <Button
                              type="submit"
                              disabled={!prompt.trim() || isSubmitting || creditBalance?.isOut}
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
                </CardBody>
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
              <div className="mb-6 p-4 border border-danger-200 bg-danger-50 text-danger-700 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  {error}
                </div>
              </div>
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
                    <Chip color="success" size="sm">
                      <span className="size-1.5 inline-block rounded-full bg-green-800 mr-1.5"></span>
                      Preview Ready
                    </Chip>
                    <Button
                      as="a"
                      href={jobStatus.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="light"
                      size="sm"
                      startContent={<ExternalLink className="h-3.5 w-3.5" />}
                    >
                      Open in New Tab
                    </Button>
                  </div>
                </CardHeader>
                <CardBody className="p-0">
                  <div className="relative" style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
                    <iframe
                      src={jobStatus.previewUrl}
                      className="w-full h-full border-0"
                      title="App Preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  </div>
                </CardBody>
              </Card>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}