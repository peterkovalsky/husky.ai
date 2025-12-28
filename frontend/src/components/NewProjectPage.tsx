import { useState, useEffect } from 'react'
import React from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ApiService } from '../services/api'
import { Button, Spinner } from '@heroui/react'
import { PromptInput } from './PromptInput'
import { useMediaUpload } from '../hooks/useMediaUpload'
import { Sparkles, Layout, BarChart3, Palette, FileText, AlertTriangle } from 'lucide-react'
import type { ProjectPageLocationState } from '../types/onboarding'

export const NewProjectPage = () => {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Get initial prompt from router state (email/password auth) or query param (Google OAuth)
  const initialPromptFromState = (location.state as { initialPrompt?: string })?.initialPrompt
  const initialPromptFromQuery = searchParams.get('prompt')
  const initialPrompt = initialPromptFromState || initialPromptFromQuery

  // Media upload hook - no project yet, so no projectId
  const {
    attachedImages,
    isDragging,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeFile,
    getMediaIds,
    hasUploadingFiles,
    hasFailedFiles,
  } = useMediaUpload({
    projectId: undefined,
    onError: (message) => setError(message),
    maxFiles: 1,
  })

  // Set initial prompt from auth flow if provided
  useEffect(() => {
    if (initialPrompt && !prompt) {
      setPrompt(initialPrompt)
      // Clean up URL query param after reading it (for Google OAuth flow)
      if (initialPromptFromQuery) {
        navigate('/', { replace: true })
      }
    }
  }, [initialPrompt, initialPromptFromQuery, navigate, prompt])

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

      // Step 1: Call analyze endpoint to get suggested project name
      console.log('[NewProjectPage] Analyzing prompt...')
      const analysisResponse = await ApiService.analyzePrompt(
        prompt.trim(),
        undefined, // No projectId yet
        mediaIds.length > 0 ? mediaIds : undefined
      )

      // Step 2: Create the project with AI-suggested name
      console.log('[NewProjectPage] Creating project with name:', analysisResponse.suggestedProjectName)
      const project = await ApiService.createProjectFromPrompt(
        analysisResponse.suggestedProjectName || 'New Project'
      )
      console.log('[NewProjectPage] Project created:', project.id)

      // Step 3: Navigate to project page with onboarding state
      const locationState: ProjectPageLocationState = {
        initialPrompt: prompt.trim(),
        mediaIds: mediaIds,
        startOnboarding: true,
      }

      console.log('[NewProjectPage] Navigating to project page with onboarding state')
      navigate(`/project/${project.id}`, { state: locationState })
    } catch (error) {
      console.error('[NewProjectPage] Error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create project')
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="h-full">
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full flex flex-col items-center max-w-3xl">
          {/* Main Heading */}
          <div className="text-center mb-12">
            <Sparkles className="w-12 h-12 text-husky-500 mx-auto mb-6 animate-float" />
            <h1 className="text-4xl font-bold mb-3 text-gray-900">
              What would you like to build?
            </h1>
            <p className="text-default-500">Describe your app idea and let AI bring it to life</p>
          </div>

          {/* Loading Indicator */}
          {isSubmitting && (
            <div className="mb-8 flex items-center gap-4">
              <Spinner size="lg" color="primary" />
              <div>
                <span className="text-sm font-medium text-default-700">
                  Creating your project...
                </span>
                <p className="text-xs text-default-500">This will just take a moment</p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-6 w-full p-4 rounded-xl bg-danger-50 border border-danger-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-danger-700">{error}</p>
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  className="mt-2"
                  onPress={() => setError(null)}
                >
                  Dismiss
                </Button>
              </div>
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
              isDisabled={isSubmitting}
              placeholder="Describe your app idea..."
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              isDragging={isDragging}
              autoFocus={true}
              showLoadingOverlay={false}
            />
          </div>

          {/* Quick Start Buttons */}
          {!isSubmitting && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="bordered"
                className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                onPress={() => {
                  setPrompt("Create a landing page for a SaaS product")
                }}
                startContent={<Layout className="w-4 h-4 text-husky-500" />}
              >
                Landing page
              </Button>
              <Button
                variant="bordered"
                className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                onPress={() => {
                  setPrompt("Build a dashboard with charts")
                }}
                startContent={<BarChart3 className="w-4 h-4 text-husky-500" />}
              >
                Dashboard
              </Button>
              <Button
                variant="bordered"
                className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                onPress={() => {
                  setPrompt("Design a portfolio website")
                }}
                startContent={<Palette className="w-4 h-4 text-husky-500" />}
              >
                Portfolio
              </Button>
              <Button
                variant="bordered"
                className="rounded-full border-husky-200 hover:border-husky-400 hover:bg-husky-50 transition-colors"
                onPress={() => {
                  setPrompt("Create a blog layout")
                }}
                startContent={<FileText className="w-4 h-4 text-husky-500" />}
              >
                Blog
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
