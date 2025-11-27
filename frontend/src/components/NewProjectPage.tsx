import { useState, useRef } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type Project } from '../services/api'
import { Button, Spinner } from '@heroui/react'
import { PromptInput } from './PromptInput'
import { useMediaUpload } from '../hooks/useMediaUpload'
import ClarificationPanel from './ClarificationPanel'
import FailedBuildOptions from './FailedBuildOptions'
import type { ClarificationQuestion, ClarificationAnswer } from '../types/clarification'

type AppState = 'initial' | 'ready' | 'error'

export const NewProjectPage = () => {
  const [prompt, setPrompt] = useState('')
  const [appState, setAppState] = useState<AppState>('initial')
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [createdProject, setCreatedProject] = useState<Project | null>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const navigate = useNavigate()

  // Clarification state
  const [showClarification, setShowClarification] = useState(false)
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([])
  const [analysisId, setAnalysisId] = useState<string>('')
  const [pendingPrompt, setPendingPrompt] = useState<string>('')
  const [pendingMediaIds, setPendingMediaIds] = useState<string[]>([])
  const [suggestedProjectName, setSuggestedProjectName] = useState<string>('')
  const [lastClarificationAnswers, setLastClarificationAnswers] = useState<ClarificationAnswer[]>([])
  const [showFailedBuildOptions, setShowFailedBuildOptions] = useState(false)

  // Temporary project ID for media uploads (null until we create a project)
  const [tempProjectId, setTempProjectId] = useState<string | null>(null)

  // Media upload hook - only enable if we have a project for uploads
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
    projectId: tempProjectId || 'temp-new-project',
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

      // Call analyze endpoint WITHOUT projectId - this will generate a suggested name
      const analysisResponse = await ApiService.analyzePrompt(
        prompt.trim(),
        undefined, // No projectId yet
        mediaIds.length > 0 ? mediaIds : undefined
      )

      // Store suggested name for project creation
      if (analysisResponse.suggestedProjectName) {
        setSuggestedProjectName(analysisResponse.suggestedProjectName)
      }

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

      // If no clarification needed, proceed directly - create project and submit
      await createProjectAndSubmit(
        prompt.trim(),
        mediaIds,
        analysisResponse.suggestedProjectName || 'New Project',
        analysisResponse.analysisId
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to analyze prompt')
      setIsSubmitting(false)
    }
  }

  const createProjectAndSubmit = async (
    promptText: string,
    mediaIds: string[],
    projectName: string,
    currentAnalysisId: string,
    clarificationAnswers?: ClarificationAnswer[],
    skippedClarification?: boolean
  ) => {
    try {
      // Step 1: Create the project with AI-suggested name
      console.log('[NewProjectPage] Creating project with name:', projectName)
      const project = await ApiService.createProjectFromPrompt(projectName)
      setCreatedProject(project)
      setTempProjectId(project.id)
      console.log('[NewProjectPage] Project created:', project.id)

      // Step 2: Submit the prompt to the new project
      const response = await ApiService.submitPrompt(
        promptText,
        project.id,
        mediaIds.length > 0 ? mediaIds : undefined,
        clarificationAnswers,
        currentAnalysisId,
        skippedClarification
      )

      // Start generating
      setIsGenerating(true)
      setShowClarification(false)

      // Clear attached files after successful submission
      clearFiles()

      // Save answers for potential retry
      if (clarificationAnswers) {
        setLastClarificationAnswers(clarificationAnswers)
      }

      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status) => {
          console.log('[NewProjectPage] Poll status received:', status.status, 'previewUrl:', status.previewUrl)
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            console.log('[NewProjectPage] Setting appState to ready, will redirect...')
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
      setError(error instanceof Error ? error.message : 'Failed to create project')
      setIsGenerating(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClarificationSubmit = (answers: ClarificationAnswer[]) => {
    setIsSubmitting(true)
    createProjectAndSubmit(
      pendingPrompt,
      pendingMediaIds,
      suggestedProjectName || 'New Project',
      analysisId,
      answers,
      false
    )
  }

  const handleSurpriseMe = () => {
    setIsSubmitting(true)
    createProjectAndSubmit(
      pendingPrompt,
      pendingMediaIds,
      suggestedProjectName || 'New Project',
      analysisId,
      undefined,
      true
    )
  }

  const handleClarificationCancel = () => {
    setShowClarification(false)
    setPendingPrompt('')
    setPendingMediaIds([])
    setClarificationQuestions([])
    setSuggestedProjectName('')
  }

  const handleRevisePreferences = () => {
    setShowFailedBuildOptions(false)
    setShowClarification(true)
    setError(null)
  }

  const handleTryAgain = async () => {
    if (!createdProject) {
      setError('No project to retry')
      return
    }

    setShowFailedBuildOptions(false)
    setError(null)
    setIsSubmitting(true)

    try {
      // Re-submit to the already created project
      const response = await ApiService.submitPrompt(
        pendingPrompt,
        createdProject.id,
        pendingMediaIds.length > 0 ? pendingMediaIds : undefined,
        lastClarificationAnswers,
        analysisId,
        false
      )

      setIsGenerating(true)

      const cleanup = await ApiService.pollJobStatus(
        response.promptId || response.jobId,
        (status) => {
          setJobStatus(status)
          if (status.status === 'READY' && status.previewUrl) {
            setAppState('ready')
            setIsGenerating(false)
            setShowFailedBuildOptions(false)
          } else if (status.status === 'FAILED' || status.errorMessage) {
            setError(status.errorMessage || 'Generation failed')
            setIsGenerating(false)
            setShowFailedBuildOptions(true)
          }
        },
        (error) => {
          setError(error.message)
          setIsGenerating(false)
          setShowFailedBuildOptions(true)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to retry')
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

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current()
      }
    }
  }, [])

  // When app is ready, navigate to the project page
  React.useEffect(() => {
    if (appState === 'ready' && createdProject) {
      console.log('[NewProjectPage] Build complete, navigating to project:', createdProject.id)
      navigate(`/project/${createdProject.id}`)
    }
  }, [appState, createdProject, navigate])

  return (
    <div className="h-full bg-background">
      {/* Main Content */}
      {appState === 'initial' && (
        <div className="h-full flex items-center justify-center p-6">
          <div className="w-full max-w-3xl flex flex-col items-center">
            {/* Main Heading - hidden during clarification */}
            {!showClarification && (
              <h1 className="text-4xl font-normal text-foreground mb-12 text-center">
                What would you like to build?
              </h1>
            )}

            {/* Loading Indicator - shown while generating */}
            {isGenerating && (
              <div className="mb-8 flex items-center gap-3 text-primary">
                <Spinner color="primary" />
                <span className="text-sm font-medium">
                  {jobStatus?.status === 'QUEUED' && 'Analyzing your idea...'}
                  {jobStatus?.status === 'PROCESSING' && 'Generating your app...'}
                  {jobStatus?.status === 'BUILDING' && 'Building your app...'}
                  {!jobStatus?.status && 'Starting generation...'}
                </span>
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
                  placeholder="Describe your app idea..."
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  isDragging={isDragging}
                  autoFocus={true}
                />
              </div>
            )}

            {/* Clarification Panel */}
            {showClarification && (
              <div className="pt-12 w-full">
                <ClarificationPanel
                  questions={clarificationQuestions}
                  onSubmit={handleClarificationSubmit}
                  onSurpriseMe={handleSurpriseMe}
                  onCancel={handleClarificationCancel}
                  isSubmitting={isSubmitting}
                  prompt={pendingPrompt}
                />
              </div>
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
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Create a landing page for a SaaS product");
                  }}
                >
                  Create a landing page
                </Button>
                <Button
                  variant="bordered"                  
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Build a dashboard with charts");
                  }}
                >
                  Build a dashboard
                </Button>
                <Button
                  variant="bordered"             
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Design a portfolio website");
                  }}
                >
                  Design portfolio
                </Button>
                <Button
                  variant="bordered"       
                  className="rounded-full"
                  onPress={() => {
                    setPrompt("Create a blog layout");
                  }}
                >
                  Create blog
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {appState === 'error' && (
        <div className="flex items-center justify-center h-full">
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
              setCreatedProject(null)
            }}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
