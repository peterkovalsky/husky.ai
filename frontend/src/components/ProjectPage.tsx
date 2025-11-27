import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type ProjectDetails } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { ChatWidget } from './ChatWidget'
import { NewProjectStarter } from './NewProjectStarter'
import { Button } from '@heroui/react'
import { Code2, ArrowLeft, Loader2 } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

// Helper function to add cache-busting parameter to preview URL
const getCacheBustedUrl = (url: string) => {
  const timestamp = Date.now()
  return url.includes('?') ? `${url}&t=${timestamp}` : `${url}?t=${timestamp}`
}

export const ProjectPage = () => {
  const { project_id } = useParams<{ project_id: string }>()
  const navigate = useNavigate()
  const { setCurrentProject } = useProject()
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null)
  const [latestJobStatus, setLatestJobStatus] = useState<JobStatus | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string>('')
  // Track the current URL in a ref to avoid stale closures in onLoad/onError
  const currentPreviewUrlRef = useRef(currentPreviewUrl)

  // Sidebar state with localStorage persistence
  const [isSidebarLocked, setIsSidebarLocked] = useLocalStorage('husky_sidebar_locked', true)
  const [isSidebarOpen, setIsSidebarOpen] = useLocalStorage('husky_sidebar_open', true)
  const [isHoveringLeftEdge, setIsHoveringLeftEdge] = useState(false)
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false)

  // Counter to force reload - increment to trigger re-fetch
  const [reloadCounter, setReloadCounter] = useState(0)

  // Reset state when project_id changes
  useEffect(() => {
    setProjectDetails(null)
    setLatestJobStatus(null)
    setIframeLoaded(false)
    setCurrentPreviewUrl('')
    currentPreviewUrlRef.current = ''
    setError(null)
  }, [project_id])

  useEffect(() => {
    const loadProject = async () => {
      if (!project_id) return

      console.log('[ProjectPage] loadProject starting for project_id:', project_id)
      try {
        // Get all project details in one API call
        const details = await ApiService.getProjectDetails(project_id)
        console.log('[ProjectPage] loadProject got details:', details)
        setProjectDetails(details)

        // Find the latest READY or COMPLETED prompt for preview
        const readyPrompts = details.recentPrompts.filter(p => p.status === 'READY' || p.status === 'COMPLETED')
        if (readyPrompts.length > 0) {
          const latest = readyPrompts[0] // recentPrompts are already sorted by createdAt desc

          // Get job status for the latest prompt to get preview URL
          try {
            const jobStatus = await ApiService.getJobStatus(latest.id)
            if (jobStatus.previewUrl) {
              const cacheBustedUrl = getCacheBustedUrl(jobStatus.previewUrl)
              setLatestJobStatus(jobStatus)
              setCurrentPreviewUrl(cacheBustedUrl)
              currentPreviewUrlRef.current = cacheBustedUrl
            }
          } catch {
            console.warn('Could not fetch job status for prompt:', latest.id)
          }
        }

        console.log('[ProjectPage] loadProject completed successfully')
      } catch (err) {
        console.error('[ProjectPage] Failed to load project:', err)
        setError(err instanceof Error ? err.message : 'Failed to load project')
      }
    }

    loadProject()
  }, [project_id, reloadCounter])

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
        const cacheBustedUrl = getCacheBustedUrl(previewUrl)
        setLatestJobStatus(prev => prev ? { ...prev, previewUrl } : null)
        setCurrentPreviewUrl(cacheBustedUrl)
        currentPreviewUrlRef.current = cacheBustedUrl
      }

      // Reset iframe loaded state - this will show loading overlay again
      setIframeLoaded(false)

      // Force reload by updating src with new cache-busting timestamp
      if (iframeRef.current && currentPreviewUrlRef.current) {
        iframeRef.current.src = getCacheBustedUrl(currentPreviewUrlRef.current)
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
    const latestReadyPrompt = projectDetails.recentPrompts.find(p => p.status === 'READY' || p.status === 'COMPLETED')

    // If there are prompts but no ready preview and not in special cases, redirect
    if (!hasNoBuilds && !allBuildsFailed && !latestReadyPrompt) {
      navigate('/')
    }
  }, [projectDetails, navigate])

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
  const allBuildsFailed = (projectDetails?.recentPrompts?.length ?? 0) > 0 &&
    projectDetails?.recentPrompts?.every(p => p.status === 'FAILED')
  const latestReadyPrompt = projectDetails?.recentPrompts?.find(p => p.status === 'READY' || p.status === 'COMPLETED')
  const hasReadyPreview = latestReadyPrompt && latestJobStatus?.previewUrl

  // Special case: NewProjectStarter is completely different UI
  if (projectDetails && (hasNoBuilds || allBuildsFailed)) {
    return (
      <NewProjectStarter
        projectId={projectDetails.project.id}
        projectName={projectDetails.project.name}
        onBuildComplete={() => setReloadCounter(c => c + 1)}
      />
    )
  }

  // Fully loaded when we have project details, preview URL, and iframe is loaded
  const isFullyLoaded = projectDetails && hasReadyPreview && iframeLoaded
  const shouldShowLoading = !isFullyLoaded

  // Debug logging
  console.log('[ProjectPage] State check:', {
    projectDetails: !!projectDetails,
    hasReadyPreview: !!hasReadyPreview,
    currentPreviewUrl,
    iframeLoaded,
    isFullyLoaded,
    shouldShowLoading
  })

  // Determine if sidebar should be visible
  // When locked: show if open OR if hovering (to allow reopening)
  // When unlocked: show ONLY when hovering (ignore isSidebarOpen)
  const shouldShowSidebar = isSidebarLocked
    ? (isSidebarOpen || isHoveringLeftEdge || isHoveringSidebar)
    : (isHoveringLeftEdge || isHoveringSidebar)
  const sidebarWidth = 400 // Fixed width in pixels

  return (
    <div className="h-screen flex relative bg-background">
      {/* Loading overlay - covers everything until fully ready */}
      {shouldShowLoading && (
        <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading project...</p>
          </div>
        </div>
      )}

      {/* Left edge hover zone - active when sidebar is not visible */}
      {!shouldShowSidebar && isFullyLoaded && (
        <div
          className="absolute left-0 top-0 h-full w-5 z-40"
          onMouseEnter={() => setIsHoveringLeftEdge(true)}
          onMouseLeave={() => setIsHoveringLeftEdge(false)}
        />
      )}

      {/* Chat Sidebar - only show when fully loaded */}
      {isFullyLoaded && (
        <div
          className={`
            ${(isSidebarLocked && isSidebarOpen) ? 'relative' : 'absolute left-0 top-0 h-full z-30'}
            transition-transform duration-300 ease-in-out
            ${shouldShowSidebar ? 'translate-x-0' : '-translate-x-full'}
            ${!shouldShowSidebar ? 'pointer-events-none' : ''}
          `}
          style={{ width: `${sidebarWidth}px` }}
          onMouseEnter={() => {
            setIsHoveringSidebar(true)
          }}
          onMouseLeave={() => {
            setIsHoveringSidebar(false)
            setIsHoveringLeftEdge(false)
          }}
        >
          <ChatWidget
            projectId={projectDetails.project.id}
            isSidebarLocked={isSidebarLocked}
            onToggleLock={() => setIsSidebarLocked(!isSidebarLocked)}
            isSidebarOpen={isSidebarOpen}
            onToggleOpen={() => {
              setIsSidebarOpen(!isSidebarOpen)
              // Clear hover states when explicitly closing
              if (isSidebarOpen) {
                setIsHoveringLeftEdge(false)
                setIsHoveringSidebar(false)
              }
            }}
          />
        </div>
      )}

      {/* Iframe container */}
      <div
        className={`
          flex-1 h-full relative
          transition-all duration-300 ease-in-out
        `}
        style={{
          marginLeft: isSidebarLocked && isSidebarOpen && isFullyLoaded ? `0px` : '0px'
        }}
      >
        {/* Iframe - ALWAYS rendered from the start, NEVER unmounts or remounts */}
        {/* No key prop = stable element, only src updates */}
        {/* Use undefined instead of empty string to avoid browser warning */}
        <iframe
          ref={iframeRef}
          src={currentPreviewUrl || undefined}
          className="w-full h-full border-0"
          title="Project Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => {
            console.log('[ProjectPage] iframe onLoad fired, currentPreviewUrlRef:', currentPreviewUrlRef.current)
            // Only mark as loaded if we actually have content (use ref to avoid stale closure)
            if (currentPreviewUrlRef.current) {
              console.log('[ProjectPage] Setting iframeLoaded to true')
              setIframeLoaded(true)
            }
          }}
          onError={() => {
            console.log('[ProjectPage] iframe onError fired, currentPreviewUrlRef:', currentPreviewUrlRef.current)
            if (currentPreviewUrlRef.current) {
              setIframeLoaded(true)
            }
          }}
        />
      </div>
    </div>
  )
}