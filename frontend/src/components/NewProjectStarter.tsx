import { useState, useRef } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { Button, Spinner } from '@heroui/react'
import { ArrowLeft } from 'lucide-react'
import { ChatWidget } from './ChatWidget'
import { PromptInput } from './PromptInput'
import { useMediaUpload } from '../hooks/useMediaUpload'

interface NewProjectStarterProps {
  projectId: string
  projectName: string
}

type AppState = 'initial' | 'ready' | 'error'

export const NewProjectStarter = ({ projectId }: NewProjectStarterProps) => {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const navigate = useNavigate()

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
    clearFiles,
    hasUploadingFiles,
    hasFailedFiles,
  } = useMediaUpload({
    projectId,
    onError: (message) => setError(message),
    maxFiles: 1,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!prompt.trim() || isSubmitting) return

    // Check if any files are still uploading
    if (hasUploadingFiles()) {
      setError('Please wait for files to finish uploading')
      return
    }

    // Check if any files failed
    if (hasFailedFiles()) {
      setError('Please remove failed files before submitting')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Get mediaIds from ready files
      const mediaIds = getMediaIds()

      const response = await ApiService.submitPrompt(
        prompt.trim(),
        projectId,
        mediaIds.length > 0 ? mediaIds : undefined
      )

      // Start generating - stay on initial screen
      setIsGenerating(true)

      // Clear attached files after successful submission
      clearFiles()

      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status) => {
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            setAppState('ready')
            setIsGenerating(false)
          } else if (status.status === 'FAILED' || status.errorMessage) {
            setError(status.errorMessage || 'Generation failed')
            setAppState('error')
            setIsGenerating(false)
          }
          // For other statuses (QUEUED, PROCESSING, BUILDING), keep showing initial screen
        },
        (error) => {
          setError(error.message)
          setAppState('error')
          setIsGenerating(false)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit prompt')
      setAppState('error')
      setIsGenerating(false)
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
      <div className="h-screen flex bg-background">
        <div style={{ width: '400px' }} className="h-full">
          <ChatWidget projectId={projectId}/>
        </div>
        <div className="flex-1 h-full">
          <iframe
            key={iframeKey}
            src={jobStatus.previewUrl}
            className="w-full h-full border-0"
            title="Project Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Navigation */}
      <div className="px-6 py-4">
        <Button
          variant="flat"
          size="md"
          onPress={() => navigate('/')}
          startContent={<ArrowLeft className="h-4 w-4" />}
          className="rounded-full"
        >
          Back to Projects
        </Button>
      </div>

      {/* Main Content */}
      {appState === 'initial' && (
        <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-6">
          <div className="w-full max-w-3xl flex flex-col items-center">
            {/* Main Heading */}
            <h1 className="text-4xl font-normal text-foreground mb-12 text-center">
              How can I help you today?
            </h1>

            {/* Loading Indicator - shown while generating */}
            {isGenerating && (
              <div className="mb-8 flex items-center gap-3 text-primary">
                <Spinner size="sm" color="primary" />
                <span className="text-sm font-medium">
                  {jobStatus?.status === 'QUEUED' && 'Analyzing your idea...'}
                  {jobStatus?.status === 'PROCESSING' && 'Generating your app...'}
                  {jobStatus?.status === 'BUILDING' && 'Building your app...'}
                  {!jobStatus?.status && 'Starting generation...'}
                </span>
              </div>
            )}

            {/* Prompt Input */}
            <div className="w-full mb-6">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                onFileSelect={handleFileSelect}
                onRemoveFile={removeFile}
                attachedFiles={attachedImages}
                isSubmitting={isSubmitting}
                isDisabled={isSubmitting || isGenerating}
                placeholder="Enter a prompt here"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                isDragging={isDragging}
              />
            </div>

            {/* Action Buttons */}
            {!isGenerating && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="bordered"
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Create a landing page for a SaaS product");
                  }}
                >
                  <span className="mr-2">📝</span>
                  Create a landing page
                </Button>
                <Button
                  variant="bordered"
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Build a dashboard with charts");
                  }}
                >
                  <span className="mr-2">📊</span>
                  Build a dashboard
                </Button>
                <Button
                  variant="bordered"
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Design a portfolio website");
                  }}
                >
                  <span className="mr-2">💡</span>
                  Design portfolio
                </Button>
                <Button
                  variant="bordered"
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Create a blog layout");
                  }}
                >
                  <span className="mr-2">✍️</span>
                  Create blog
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {appState === 'error' && (
        <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
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
              setIsGenerating(false)
            }}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}