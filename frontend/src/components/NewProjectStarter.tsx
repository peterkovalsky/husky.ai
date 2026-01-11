import { useState, useRef } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus } from '../services/api'
import { Button } from '@heroui/react'
import { ArrowLeft, Loader2, AlertTriangle, Sparkles, Layout, BarChart3, Palette, FileText } from 'lucide-react'
import { PromptInput } from './PromptInput'
import { useMediaUpload } from '../hooks/useMediaUpload'
import ClarificationPanel from './ClarificationPanel'
import FailedBuildOptions from './FailedBuildOptions'
import type { ClarificationQuestion, ClarificationAnswer } from '../types/clarification'

interface NewProjectStarterProps {
  projectId: string
  projectName: string
  onBuildComplete?: () => void
}

type AppState = 'initial' | 'ready' | 'error'

export const NewProjectStarter = ({ projectId, onBuildComplete }: NewProjectStarterProps) => {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const navigate = useNavigate()

  // Clarification state
  const [showClarification, setShowClarification] = useState(false)
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([])
  const [analysisId, setAnalysisId] = useState<string>('')
  const [pendingPrompt, setPendingPrompt] = useState<string>('')
  const [pendingMediaIds, setPendingMediaIds] = useState<string[]>([])
  const [lastClarificationAnswers, setLastClarificationAnswers] = useState<ClarificationAnswer[]>([])
  const [showFailedBuildOptions, setShowFailedBuildOptions] = useState(false)

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

      // Call analyze endpoint first for clarification
      const analysisResponse = await ApiService.analyzePrompt(
        prompt.trim(),
        projectId,
        mediaIds.length > 0 ? mediaIds : undefined
      )

      // If clarification is needed, show questions
      if (analysisResponse.needsClarification && analysisResponse.questions && analysisResponse.questions.length > 0) {
        setClarificationQuestions(analysisResponse.questions)
        setAnalysisId(analysisResponse.analysisId)
        setPendingPrompt(prompt.trim())
        setPendingMediaIds(mediaIds)
        setShowClarification(true)
        setIsSubmitting(false)
        return
      }

      // If no clarification needed, proceed directly
      await submitWithClarification(prompt.trim(), mediaIds)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to analyze prompt')
      setIsSubmitting(false)
    }
  }

  const submitWithClarification = async (
    promptText: string,
    mediaIds: string[],
    clarificationAnswers?: ClarificationAnswer[],
    skippedClarification?: boolean
  ) => {
    try {
      const response = await ApiService.submitPrompt(
        promptText,
        projectId,
        mediaIds.length > 0 ? mediaIds : undefined,
        clarificationAnswers,
        analysisId,
        skippedClarification
      )

      // Check for insufficient credits
      if (response.insufficientCredits) {
        setError(response.message || "You've run out of credits. Purchase more to continue building.")
        navigate('/billing')
        return
      }

      const jobIdToTrack = response.promptId || response.jobId
      if (!jobIdToTrack) {
        setError('No job ID returned from server')
        setAppState('error')
        return
      }

      // Start generating - stay on initial screen
      setIsGenerating(true)
      setShowClarification(false)

      // Clear attached files after successful submission
      clearFiles()

      // Save answers for potential retry
      if (clarificationAnswers) {
        setLastClarificationAnswers(clarificationAnswers)
      }

      const cleanup = await ApiService.pollJobStatus(
        jobIdToTrack,
        (status) => {
          console.log('[NewProjectStarter] Poll status received:', status.status, 'previewUrl:', status.previewUrl)
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            console.log('[NewProjectStarter] Setting appState to ready, will redirect...')
            setAppState('ready')
            setIsGenerating(false)
            setShowFailedBuildOptions(false)
          } else if (status.status === 'FAILED' || status.errorMessage) {
            setError(status.errorMessage || 'Generation failed')
            setIsGenerating(false)
            // Show failed build options if we had clarification
            if (lastClarificationAnswers.length > 0 || clarificationAnswers) {
              setShowFailedBuildOptions(true)
            } else {
              setAppState('error')
            }
          }
          // For other statuses (QUEUED, PROCESSING, BUILDING), keep showing initial screen
        },
        (error) => {
          setError(error.message)
          setIsGenerating(false)
          if (lastClarificationAnswers.length > 0 || clarificationAnswers) {
            setShowFailedBuildOptions(true)
          } else {
            setAppState('error')
          }
        }
      )

      pollCleanupRef.current = cleanup
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit prompt')
      setIsGenerating(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClarificationSubmit = (answers: ClarificationAnswer[]) => {
    setIsSubmitting(true)
    submitWithClarification(pendingPrompt, pendingMediaIds, answers, false)
  }

  const handleSurpriseMe = () => {
    setIsSubmitting(true)
    submitWithClarification(pendingPrompt, pendingMediaIds, undefined, true)
  }

  const handleClarificationCancel = () => {
    setShowClarification(false)
    setPendingPrompt('')
    setPendingMediaIds([])
    setClarificationQuestions([])
  }

  const handleRevisePreferences = () => {
    setShowFailedBuildOptions(false)
    setShowClarification(true)
    setError(null)
  }

  const handleTryAgain = () => {
    setShowFailedBuildOptions(false)
    setError(null)
    setIsSubmitting(true)
    submitWithClarification(pendingPrompt, pendingMediaIds, lastClarificationAnswers, false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current()
      }
    }
  }, [])

  // When app is ready, trigger parent to reload (which will show the preview)
  // Note: We only set appState to 'ready' when previewUrl exists (see pollJobStatus callback)
  React.useEffect(() => {
    if (appState === 'ready') {
      console.log('[NewProjectStarter] appState is ready, triggering parent reload')
      onBuildComplete?.()
    }
  }, [appState, onBuildComplete])

  return (
    <div className="min-h-screen">
      {/* Header Navigation */}
      <div className="px-6 py-4">
        <Button
          variant="light"
          size="md"
          onPress={() => navigate('/projects')}
          startContent={<ArrowLeft className="h-4 w-4" />}
          className="rounded-full hover:bg-husky-50"
        >
          Back to Projects
        </Button>
      </div>

      {/* Main Content */}
      {appState === 'initial' && (
        <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-6">
          <div className="w-full max-w-3xl flex flex-col items-center">
            {/* Main Heading */}
            {!showClarification && (
              <div className="text-center mb-12">
                <Sparkles className="w-12 h-12 text-husky-500 mx-auto mb-6 animate-float" />
                <h1 className="text-4xl font-bold mb-3 text-gray-900">
                  How can I help you today?
                </h1>
                <p className="text-default-500">Describe what you'd like to add or change</p>
              </div>
            )}

            {/* Loading Indicator - shown while generating */}
            {isGenerating && (
              <div className="mb-8 p-4 rounded-2xl glass border border-white/30 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl status-processing flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
                <div>
                  <span className="text-sm font-medium text-default-700">
                    {jobStatus?.status === 'QUEUED' && 'Analyzing your idea...'}
                    {jobStatus?.status === 'PROCESSING' && 'Generating your app...'}
                    {jobStatus?.status === 'BUILDING' && 'Building your app...'}
                    {!jobStatus?.status && 'Starting generation...'}
                  </span>
                  <p className="text-xs text-default-500">This may take a minute</p>
                </div>
              </div>
            )}

            {/* Prompt Input */}
            {!showClarification && !showFailedBuildOptions && (
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
            )}

            {/* Clarification Panel */}
            {showClarification && (
              <ClarificationPanel
                questions={clarificationQuestions}
                onSubmit={handleClarificationSubmit}
                onSurpriseMe={handleSurpriseMe}
                onCancel={handleClarificationCancel}
                isSubmitting={isSubmitting}
                prompt={pendingPrompt}
              />
            )}

            {/* Failed Build Options */}
            {showFailedBuildOptions && (
              <FailedBuildOptions
                onRevisePreferences={handleRevisePreferences}
                onTryAgain={handleTryAgain}
                errorMessage={error || undefined}
              />
            )}

            {/* Action Buttons - Only show when not generating, not in clarification, and not showing failed build options */}
            {!isGenerating && !showClarification && !showFailedBuildOptions && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="bordered"
                  className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                  onPress={() => {
                    setPrompt("Create a landing page for a SaaS product");
                  }}
                  startContent={<Layout className="w-4 h-4 text-husky-500" />}
                >
                  Landing page
                </Button>
                <Button
                  variant="bordered"
                  className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                  onPress={() => {
                    setPrompt("Build a dashboard with charts");
                  }}
                  startContent={<BarChart3 className="w-4 h-4 text-husky-500" />}
                >
                  Dashboard
                </Button>
                <Button
                  variant="bordered"
                  className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                  onPress={() => {
                    setPrompt("Design a portfolio website");
                  }}
                  startContent={<Palette className="w-4 h-4 text-husky-500" />}
                >
                  Portfolio
                </Button>
                <Button
                  variant="bordered"
                  className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                  onPress={() => {
                    setPrompt("Create a blog layout");
                  }}
                  startContent={<FileText className="w-4 h-4 text-husky-500" />}
                >
                  Blog
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
            <div className="w-16 h-16 rounded-2xl status-failed flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Generation Failed</h3>
            <p className="text-default-500 mb-6">{error}</p>
            <Button
              color="primary"
              onPress={() => {
                setAppState('initial')
                setError(null)
                setIsGenerating(false)
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}