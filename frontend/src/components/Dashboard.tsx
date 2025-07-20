import { useState, useEffect, useRef } from 'react'
import { ApiService, type JobStatus } from '../services/api'
import { LoadingSpinner } from './LoadingSpinner'
import { useAuth } from '../hooks/useAuth'

type AppState = 'initial' | 'submitted' | 'loading' | 'ready' | 'error'

export const Dashboard = () => {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const { user, signOut } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!prompt.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await ApiService.submitPrompt(prompt.trim())
      setJobId(response.jobId)
      setAppState('submitted')
      
      const cleanup = await ApiService.pollJobStatus(
        response.jobId,
        (status) => {
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            setAppState('ready')
          } else if (status.errorMessage) {
            setError(status.errorMessage)
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

  const handleReset = () => {
    setPrompt('')
    setAppState('initial')
    setJobId(null)
    setJobStatus(null)
    setError(null)
    setIsSubmitting(false)
    
    if (pollCleanupRef.current) {
      pollCleanupRef.current()
      pollCleanupRef.current = null
    }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className={`${isInitialState ? 'flex items-center justify-center min-h-screen' : 'pt-8 pb-6'} transition-all duration-700 ease-in-out`}>
        <div className={`w-full max-w-4xl mx-auto px-4 ${isInitialState ? '' : 'border-b border-gray-200 bg-white/80 backdrop-blur-sm'}`}>
          <div className={`${isInitialState ? 'text-center' : 'mb-6'}`}>
            {isInitialState && (
              <div className="mb-8">
                <h1 className="text-5xl font-bold text-gray-800 mb-4">
                  Husky AI
                </h1>
                <p className="text-xl text-gray-600 mb-4">
                  Describe your app idea and we'll build it for you
                </p>
                <div className="flex items-center justify-center space-x-4 text-sm text-gray-600 mb-8">
                  <span>Welcome, {user?.user_metadata?.display_name || user?.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
            
            {!isInitialState && (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Husky AI</h2>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600">
                    {user?.user_metadata?.display_name || user?.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the app you want to build... (Press Enter to submit)"
                className={`w-full ${isInitialState ? 'h-32' : 'h-20'} p-4 text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 resize-none text-lg`}
                disabled={isSubmitting || (appState !== 'initial' && appState !== 'error')}
                rows={isInitialState ? 4 : 2}
              />
              
              {!isInitialState && (
                <div className="flex justify-between items-center mt-4">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-gray-200 text-sm font-medium px-5 py-2.5 hover:text-gray-900 focus:z-10"
                  >
                    Start Over
                  </button>
                  <div className="flex items-center space-x-4">
                    {jobId && (
                      <span className="text-sm text-gray-500">
                        Job ID: {jobId.slice(0, 8)}...
                      </span>
                    )}
                    {appState === 'error' && (
                      <button
                        type="submit"
                        disabled={!prompt.trim() || isSubmitting}
                        className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? 'Retrying...' : 'Retry'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {!isInitialState && (
        <div className="flex-1 px-4">
          <div className="max-w-4xl mx-auto">
            {appState === 'error' && (
              <div className="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50">
                <svg className="flex-shrink-0 inline w-4 h-4 mr-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
                </svg>
                <span className="sr-only">Info</span>
                <div>
                  <span className="font-medium">Error:</span> {error}
                </div>
              </div>
            )}

            {(appState === 'submitted' || appState === 'loading') && (
              <div className="flex items-center justify-center py-16">
                <LoadingSpinner status={jobStatus?.status} />
              </div>
            )}

            {showPreview && jobStatus?.previewUrl && (
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium text-gray-700">
                        Preview Ready
                      </span>
                    </div>
                    <a
                      href={jobStatus.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Open in New Tab ↗
                    </a>
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
      )}
    </div>
  )
}