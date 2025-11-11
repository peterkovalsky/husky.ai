import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type ProjectDetails } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { ChatWidget } from './ChatWidget'
import { NewProjectStarter } from './NewProjectStarter'
import { Button } from '@heroui/react'
import { Code2, ArrowLeft, Loader2 } from 'lucide-react'

export const ProjectPage = () => {
  const { project_id } = useParams<{ project_id: string }>()
  const navigate = useNavigate()
  const { setCurrentProject } = useProject()
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null)
  const [latestJobStatus, setLatestJobStatus] = useState<JobStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string>('')

  // Reset state when project_id changes
  useEffect(() => {
    setProjectDetails(null)
    setLatestJobStatus(null)
    setLoading(true)
    setIframeLoaded(false)
    setCurrentPreviewUrl('')
    setError(null)
  }, [project_id])

  useEffect(() => {
    const loadProject = async () => {
      if (!project_id) return

      try {
        // Get all project details in one API call
        const details = await ApiService.getProjectDetails(project_id)
        setProjectDetails(details)

        // Find the latest READY prompt for preview
        const readyPrompts = details.recentPrompts.filter(p => p.status === 'READY')
        if (readyPrompts.length > 0) {
          const latest = readyPrompts[0] // recentPrompts are already sorted by createdAt desc

          // Get job status for the latest prompt to get preview URL
          try {
            const jobStatus = await ApiService.getJobStatus(latest.id)
            if (jobStatus.previewUrl) {
              setLatestJobStatus(jobStatus)
              setCurrentPreviewUrl(getCacheBustedUrl(jobStatus.previewUrl))
            }
          } catch {
            console.warn('Could not fetch job status for prompt:', latest.id)
          }
        }

        // Project data loaded
        setLoading(false)
      } catch (err) {
        console.error('Failed to load project:', err)
        setError(err instanceof Error ? err.message : 'Failed to load project')
        setLoading(false)
      }
    }

    loadProject()
  }, [project_id])

  // Set current project in context when project details are loaded
  useEffect(() => {
    if (projectDetails) {
      setCurrentProject({
        id: projectDetails.project.id,
        name: projectDetails.project.name,
        workspaceId: projectDetails.project.workspaceId,
        createdAt: projectDetails.project.createdAt,
        modifiedAt: projectDetails.project.modifiedAt
      })
    }
  }, [projectDetails, setCurrentProject])

  // Listen for preview reload events from ChatWidget
  useEffect(() => {
    const handleReloadPreview = (event: CustomEvent) => {
      const { previewUrl } = event.detail

      // Update the job status with new preview URL if provided
      if (previewUrl && latestJobStatus) {
        setLatestJobStatus(prev => prev ? { ...prev, previewUrl } : null)
        setCurrentPreviewUrl(getCacheBustedUrl(previewUrl))
      }

      // Reset iframe loaded state - this will show loading overlay again
      setIframeLoaded(false)

      // Force reload by updating src with new cache-busting timestamp
      if (iframeRef.current && currentPreviewUrl) {
        iframeRef.current.src = getCacheBustedUrl(currentPreviewUrl)
      }
    }

    window.addEventListener('reloadPreview', handleReloadPreview as EventListener)

    return () => {
      window.removeEventListener('reloadPreview', handleReloadPreview as EventListener)
    }
  }, [latestJobStatus, currentPreviewUrl])

  // Handle redirect case when no valid preview exists
  useEffect(() => {
    if (!projectDetails) return

    const hasNoBuilds = projectDetails.stats.totalBuilds === 0
    const allBuildsFailed = projectDetails.recentPrompts.length > 0 &&
      projectDetails.recentPrompts.every(p => p.status === 'FAILED')
    const latestReadyPrompt = projectDetails.recentPrompts.find(p => p.status === 'READY')

    // If there are prompts but no ready preview and not in special cases, redirect
    if (!hasNoBuilds && !allBuildsFailed && !latestReadyPrompt) {
      navigate('/')
    }
  }, [projectDetails, navigate])

  // Helper function to add cache-busting parameter to preview URL
  const getCacheBustedUrl = (url: string) => {
    const timestamp = Date.now()
    return url.includes('?') ? `${url}&t=${timestamp}` : `${url}?t=${timestamp}`
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-6">{error || 'The requested project could not be found.'}</p>
          <Button onPress={() => navigate('/')} startContent={<ArrowLeft className="h-4 w-4" />}>
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  // Determine content type early (even before projectDetails loads)
  const hasNoBuilds = projectDetails?.stats.totalBuilds === 0
  const allBuildsFailed = projectDetails?.recentPrompts.length > 0 &&
    projectDetails?.recentPrompts.every(p => p.status === 'FAILED')
  const latestReadyPrompt = projectDetails?.recentPrompts.find(p => p.status === 'READY')
  const hasReadyPreview = latestReadyPrompt && latestJobStatus?.previewUrl

  // Special case: NewProjectStarter is completely different UI
  if (projectDetails && (hasNoBuilds || allBuildsFailed)) {
    return (
      <NewProjectStarter
        projectId={projectDetails.project.id}
        projectName={projectDetails.project.name}
      />
    )
  }

  // Simple boolean: show loading until both project details AND iframe are ready
  const isFullyLoaded = projectDetails && hasReadyPreview && iframeLoaded
  const shouldShowLoading = !isFullyLoaded

  return (
    <div className="h-screen flex flex-col relative bg-background">
      {/* Loading overlay - covers everything until fully ready */}
      {shouldShowLoading && (
        <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading project...</p>
          </div>
        </div>
      )}

      {/* Iframe - ALWAYS rendered from the start, NEVER unmounts or remounts */}
      {/* No key prop = stable element, only src updates */}
      <iframe
        ref={iframeRef}
        src={currentPreviewUrl}
        className="w-full h-full border-0"
        title="Project Preview"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => {
          // Only mark as loaded if we actually have content
          if (currentPreviewUrl) {
            setIframeLoaded(true)
          }
        }}
        onError={() => {
          if (currentPreviewUrl) {
            setIframeLoaded(true)
          }
        }}
      />

      {/* Chat widget - only show when fully loaded */}
      {isFullyLoaded && (
        <ChatWidget
          projectId={projectDetails.project.id}
        />
      )}
    </div>
  )

  // This case is now handled by the hasNoBuilds check above and the redirect useEffect
  // If no prompts exist, totalBuilds will be 0 and hasNoBuilds will be true

  return null
}