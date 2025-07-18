import { useState, useEffect, useRef } from 'react'
import { ApiService, type JobStatus } from './services/api'
import { LoadingSpinner } from './components/LoadingSpinner'

type AppState = 'initial' | 'submitted' | 'loading' | 'ready' | 'error'

function App() {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!prompt.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await ApiService.submitPrompt(prompt.trim())
      setJobId(response.jobId)
      setAppState('submitted')
      
      // Start polling for status
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

  // Cleanup polling on unmount
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
      {/* Header/Textarea Section */}
      <div className={`${isInitialState ? 'flex items-center justify-center min-h-screen' : 'pt-8 pb-6'} transition-all duration-700 ease-in-out`}>
        <div className={`w-full max-w-4xl mx-auto px-4 ${isInitialState ? '' : 'border-b border-gray-200 bg-white/80 backdrop-blur-sm'}`}>
          <div className={`${isInitialState ? 'text-center' : 'mb-6'}`}>
            {isInitialState && (
              <div className="mb-8">
                <h1 className="text-5xl font-bold text-gray-800 mb-4">
                  Husky AI
                </h1>
                <p className="text-xl text-gray-600 mb-8">
                  Describe your app idea and we'll build it for you
                </p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the app you want to build... (Press Enter to submit)"
                className={`w-full ${isInitialState ? 'h-32' : 'h-20'} p-4 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none resize-none transition-all duration-300 text-lg`}
                disabled={isSubmitting || (appState !== 'initial' && appState !== 'error')}
              />
              
              {!isInitialState && (
                <div className="flex justify-between items-center mt-4">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
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
                        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* Content Section */}
      {!isInitialState && (
        <div className="flex-1 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Error State */}
            {appState === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <div className="flex items-center mb-2">
                  <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <h3 className="text-lg font-semibold text-red-800">Error</h3>
                </div>
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {(appState === 'submitted' || appState === 'loading') && (
              <div className="flex items-center justify-center py-16">
                <LoadingSpinner status={jobStatus?.status} />
              </div>
            )}

            {/* Preview State */}
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

export default App
