import { useState, useEffect, useRef } from 'react'
import { ApiService, type JobStatus, type Prompt } from '../services/api'
import { LoadingSpinner } from './LoadingSpinner'
import { Timer } from './Timer'
import { IterationHistory } from './IterationHistory'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../contexts/ProjectContext'

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-gray-900">Husky AI</h1>
              {currentProject && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">•</span>
                  <span className="text-sm font-medium text-gray-700">{currentProject.name}</span>
                </div>
              )}
            </div>

            {/* Center - Timer and Controls */}
            <div className="flex items-center gap-4">
              <Timer 
                isRunning={appState === 'submitted' || appState === 'loading'} 
                className="hidden sm:flex"
              />
              {currentProject && !isInitialState && (
                <button
                  onClick={() => setShowIterations(!showIterations)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                  </svg>
                  Iterations
                </button>
              )}
            </div>
            
            {/* User Menu Dropdown */}
            <div className="hs-dropdown relative inline-flex">
              <button 
                id="hs-dropdown-with-header" 
                type="button" 
                className="hs-dropdown-toggle w-8 h-8 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"
                aria-haspopup="menu" 
                aria-expanded="false" 
                aria-label="Dropdown"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              </button>

              <div className="hs-dropdown-menu transition-[opacity,margin] duration hs-dropdown-open:opacity-100 opacity-0 hidden min-w-60 bg-white shadow-md rounded-lg p-2 mt-2 after:h-4 after:absolute after:-top-4 after:start-0 after:w-full before:h-4 before:absolute before:-top-4 before:start-0 before:w-full" 
                   role="menu" 
                   aria-orientation="vertical" 
                   aria-labelledby="hs-dropdown-with-header">
                <div className="py-3 px-5 -m-2 bg-gray-100 rounded-t-lg">
                  <p className="text-sm text-gray-500">Signed in as</p>
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {user?.user_metadata?.display_name || user?.email}
                  </p>
                </div>
                <div className="mt-2 py-2 first:pt-0 last:pb-0">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm text-gray-800 hover:bg-gray-100 focus:outline-none focus:bg-gray-100 w-full text-left"
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
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-5xl font-bold text-gray-900 mb-4">
                  Husky AI
                </h1>
                <p className="text-xl text-gray-600 mb-8">
                  Describe your app idea and we'll build it for you instantly
                </p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="relative">
              <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${isInitialState ? 'max-w-2xl mx-auto' : ''}`}>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the app you want to build... (Press Enter to submit)"
                    className={`block w-full ${isInitialState ? 'min-h-[120px]' : 'min-h-[80px]'} p-4 text-gray-900 border border-gray-200 rounded-lg bg-gray-50 text-base focus:ring-blue-500 focus:border-blue-500 resize-none placeholder:text-gray-400`}
                    disabled={isSubmitting || (appState !== 'initial' && appState !== 'error')}
                  />
                  
                  {/* Submit Button - positioned in bottom right of textarea for initial state */}
                  {isInitialState && (
                    <button
                      type="submit"
                      disabled={!prompt.trim() || isSubmitting}
                      className="absolute bottom-3 right-3 py-2 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin inline-block size-4 border-[3px] border-current border-t-transparent text-white rounded-full" role="status" aria-label="loading"></span>
                          Building...
                        </>
                      ) : (
                        <>
                          Build App
                          <svg className="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6"/>
                          </svg>
                        </>
                      )}
                    </button>
                  )}
                </div>
                
                {!isInitialState && (
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleNewIteration}
                        className="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <svg className="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14"/>
                          <path d="M5 12h14"/>
                        </svg>
                        New Iteration
                      </button>
                      
                      <button
                        type="button"
                        onClick={handleReset}
                        className="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <svg className="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                          <path d="M3 3v5h5"/>
                        </svg>
                        Start Over
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-x-4">
                      {/* Show timer on mobile/smaller screens when running */}
                      <Timer 
                        isRunning={appState === 'submitted' || appState === 'loading'} 
                        className="sm:hidden"
                      />
                      
                      {/* Show final generation time when completed */}
                      {generationTime > 0 && (appState === 'ready' || appState === 'error') && (
                        <span className="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <svg className="size-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                          Generated in {Math.floor(generationTime / 60)}:{(generationTime % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                      
                      {jobId && (
                        <span className="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <span className="size-1.5 inline-block rounded-full bg-blue-800"></span>
                          Job ID: {jobId.slice(0, 8)}...
                        </span>
                      )}
                      {appState === 'error' && (
                        <button
                          type="submit"
                          disabled={!prompt.trim() || isSubmitting}
                          className="py-2 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {isSubmitting ? (
                            <>
                              <span className="animate-spin inline-block size-4 border-[3px] border-current border-t-transparent text-white rounded-full" role="status" aria-label="loading"></span>
                              Retrying...
                            </>
                          ) : (
                            <>
                              <svg className="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23,4 23,10 17,10"/>
                                <polyline points="1,20 1,14 7,14"/>
                                <path d="M20.49,9A9,9,0,0,0,5.64,5.64L1,10"/>
                                <path d="M3.51,15A9,9,0,0,0,18.36,18.36L23,14"/>
                              </svg>
                              Retry
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {!isInitialState && (
        <div className="flex-1 flex">
          {/* Iterations Sidebar */}
          {showIterations && currentProject && (
            <div className="w-80 bg-gray-50 border-r border-gray-200 flex-shrink-0">
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
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6" role="alert">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="size-4 text-red-400 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" x2="9" y1="9" y2="15"/>
                      <line x1="9" x2="15" y1="9" y2="15"/>
                    </svg>
                  </div>
                  <div className="ms-3">
                    <h3 className="text-sm text-red-800 font-medium">
                      Something went wrong
                    </h3>
                    <p className="text-sm text-red-700 mt-1">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(appState === 'submitted' || appState === 'loading') && (
              <div className="flex items-center justify-center py-16">
                <LoadingSpinner status={jobStatus?.status} />
              </div>
            )}

            {showPreview && jobStatus?.previewUrl && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-x-3">
                      <span className="inline-flex items-center gap-x-1.5 py-1.5 px-3 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <span className="size-1.5 inline-block rounded-full bg-green-800"></span>
                        Preview Ready
                      </span>
                    </div>
                    <div className="flex items-center gap-x-2">
                      <a
                        href={jobStatus.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-3 inline-flex items-center gap-x-2 text-xs font-medium rounded-lg border border-transparent text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <svg className="size-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6"/>
                          <path d="M10 14 21 3"/>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        </svg>
                        Open in New Tab
                      </a>
                    </div>
                  </div>
                </div>
                <div className="relative" style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}>
                  <iframe
                    src={jobStatus.previewUrl}
                    className="w-full h-full border-0"
                    title="App Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}