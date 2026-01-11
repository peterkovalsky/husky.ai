import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ApiService, type JobStatus, type ProjectDetails } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { ChatWidget } from './ChatWidget'
import { NewProjectStarter } from './NewProjectStarter'
import InspirationGallery from './InspirationGallery'
import OnboardingQuestionPanel from './OnboardingQuestionPanel'
import { Button, Spinner, Card, CardHeader, CardBody } from '@heroui/react'
import { Code2, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useOnboarding } from '../hooks/useOnboarding'
import type { ProjectPageLocationState } from '../types/onboarding'

// Helper function to add cache-busting parameter to preview URL
const getCacheBustedUrl = (url: string) => {
  const timestamp = Date.now()
  return url.includes('?') ? `${url}&t=${timestamp}` : `${url}?t=${timestamp}`
}

// Funny rotating status messages for the build process (first build takes ~2 min)
const BUILD_STATUS_MESSAGES = [
  "Brewing some digital magic...",
  "Teaching pixels to dance...",
  "Convincing electrons to cooperate...",
  "Polishing the user experience...",
  "Herding digital cats...",
  "Untangling the internet...",
  "Watering the code garden...",
  "Asking the hamsters to run faster...",
  "Sprinkling some unicorn dust...",
  "Aligning the cosmic bits...",
  "Warming up the creative engines...",
  "Negotiating with the cloud...",
  "Painting with ones and zeros...",
  "Almost there, promise...",
]

// Custom hook for rotating build messages
function useRotatingMessage(isActive: boolean) {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setMessageIndex(0)
      return
    }

    // Rotate every 8 seconds (15 messages × 8 sec = 120 sec = 2 min coverage)
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % BUILD_STATUS_MESSAGES.length)
    }, 8000)

    return () => clearInterval(interval)
  }, [isActive])

  return BUILD_STATUS_MESSAGES[messageIndex]
}

export const ProjectPage = () => {
  const { project_id } = useParams<{ project_id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { setCurrentProject } = useProject()

  // Get location state for onboarding
  const locationState = location.state as ProjectPageLocationState | null

  // Onboarding hook
  const {
    phase: onboardingPhase,
    data: onboardingData,
    onboardingMessages,
    currentQuestion,
    error: onboardingError,
    isLoading: isOnboardingLoading,
    buildStatus: onboardingBuildStatus,
    buildJustCompleted,
    buildJustFailed,
    startOnboarding,
    handleInspoSelect,
    handleInspoSkip,
    handleQuestionAnswer,
    handleQuestionSkip,
  } = useOnboarding(project_id)

  // Debug: log project_id on every render
  console.log('[ProjectPage] Render - project_id from useParams:', project_id, 'type:', typeof project_id)
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

  // Rotating build status message (for PROCESSING and BUILDING phases)
  const isBuildInProgress = onboardingPhase === 'BUILDING' &&
    (onboardingBuildStatus === 'PROCESSING' || onboardingBuildStatus === 'BUILDING')
  const rotatingMessage = useRotatingMessage(isBuildInProgress)

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
    let isMounted = true

    const loadProject = async () => {
      if (!project_id) {
        console.log('[ProjectPage] loadProject skipped - no project_id')
        return
      }

      console.log('[ProjectPage] loadProject starting for project_id:', project_id, 'reloadCounter:', reloadCounter)
      try {
        // Get all project details in one API call
        console.log('[ProjectPage] Calling ApiService.getProjectDetails...')
        const startTime = Date.now()
        const details = await ApiService.getProjectDetails(project_id)
        const duration = Date.now() - startTime
        console.log('[ProjectPage] loadProject got details in', duration, 'ms:', details)
        console.log('[ProjectPage] recentPrompts:', details.recentPrompts)

        // Check if component is still mounted before updating state
        if (!isMounted) {
          console.log('[ProjectPage] Component unmounted during API call, skipping state update')
          return
        }

        console.log('[ProjectPage] Setting projectDetails state...')
        setProjectDetails(details)
        console.log('[ProjectPage] projectDetails state set')

        // Find the latest READY or COMPLETED prompt for preview
        console.log('[ProjectPage] All prompt statuses:', details.recentPrompts.map(p => ({ id: p.id, status: p.status })))
        const readyPrompts = details.recentPrompts.filter(p => p.status === 'READY' || p.status === 'COMPLETED')
        console.log('[ProjectPage] Ready prompts found:', readyPrompts.length)
        if (readyPrompts.length > 0) {
          const latest = readyPrompts[0] // recentPrompts are already sorted by createdAt desc
          console.log('[ProjectPage] Latest ready prompt:', latest.id, latest.status)

          // Get job status for the latest prompt to get preview URL
          try {
            console.log('[ProjectPage] Fetching job status for prompt:', latest.id)
            const jobStatus = await ApiService.getJobStatus(latest.id)
            console.log('[ProjectPage] Job status response:', jobStatus)
            if (!isMounted) {
              console.log('[ProjectPage] Component unmounted during job status fetch, skipping state update')
              return
            }
            if (jobStatus.previewUrl) {
              console.log('[ProjectPage] Setting preview URL:', jobStatus.previewUrl)
              const cacheBustedUrl = getCacheBustedUrl(jobStatus.previewUrl)
              setLatestJobStatus(jobStatus)
              setCurrentPreviewUrl(cacheBustedUrl)
              currentPreviewUrlRef.current = cacheBustedUrl
            } else {
              console.log('[ProjectPage] No preview URL in job status')
            }
          } catch (jobErr) {
            console.warn('[ProjectPage] Could not fetch job status for prompt:', latest.id, jobErr)
          }
        } else {
          console.log('[ProjectPage] No ready prompts found, will show loading or NewProjectStarter')
        }

        console.log('[ProjectPage] loadProject completed successfully')
      } catch (err) {
        console.error('[ProjectPage] Failed to load project:', err)
        console.error('[ProjectPage] Error details:', {
          name: err instanceof Error ? err.name : 'unknown',
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        })
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load project')
        }
      }
    }

    console.log('[ProjectPage] useEffect triggered, calling loadProject()')
    loadProject()

    return () => {
      console.log('[ProjectPage] useEffect cleanup - marking as unmounted')
      isMounted = false
    }
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

  // Handle onboarding from router state (when redirected from NewProjectPage)
  useEffect(() => {
    if (locationState?.startOnboarding && locationState.initialPrompt && project_id) {
      console.log('[ProjectPage] Starting onboarding from router state')
      // Start the onboarding flow
      startOnboarding(locationState.initialPrompt, locationState.mediaIds || [])

      // Clear the location state to prevent re-triggering on refresh
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [locationState, project_id, startOnboarding, navigate, location.pathname])

  // Refresh project details when build just completed (to update build count and preview URL)
  useEffect(() => {
    if (buildJustCompleted && project_id) {
      console.log('[ProjectPage] Build just completed, refreshing project details')
      ApiService.getProjectDetails(project_id).then(async details => {
        setProjectDetails(details)

        // Find the latest READY prompt and get its preview URL
        const readyPrompts = details.recentPrompts.filter(p => p.status === 'READY' || p.status === 'COMPLETED')
        if (readyPrompts.length > 0) {
          const latest = readyPrompts[0]
          try {
            const jobStatus = await ApiService.getJobStatus(latest.id)
            if (jobStatus.previewUrl) {
              console.log('[ProjectPage] Setting preview URL after build complete:', jobStatus.previewUrl)
              const cacheBustedUrl = getCacheBustedUrl(jobStatus.previewUrl)
              setLatestJobStatus(jobStatus)
              setCurrentPreviewUrl(cacheBustedUrl)
              currentPreviewUrlRef.current = cacheBustedUrl
            }
          } catch (err) {
            console.warn('[ProjectPage] Could not fetch job status after build complete:', err)
          }
        }
      }).catch(err => {
        console.error('[ProjectPage] Failed to refresh project details:', err)
      })
    }
  }, [buildJustCompleted, project_id])

  // Listen for preview reload events from ChatWidget/useOnboarding
  useEffect(() => {
    const handleReloadPreview = (event: CustomEvent) => {
      const { previewUrl } = event.detail

      // Always update preview URL if provided (critical for first build!)
      if (previewUrl) {
        const cacheBustedUrl = getCacheBustedUrl(previewUrl)

        // Update or create latestJobStatus with the new preview URL
        setLatestJobStatus(prev => prev
          ? { ...prev, previewUrl }
          : { status: 'READY', previewUrl } as JobStatus
        )
        setCurrentPreviewUrl(cacheBustedUrl)
        currentPreviewUrlRef.current = cacheBustedUrl

        console.log('[ProjectPage] reloadPreview event - set preview URL:', cacheBustedUrl)
      }

      // Reset iframe loaded state - this will show loading overlay again
      setIframeLoaded(false)

      // Force reload by updating src with new cache-busting timestamp
      if (iframeRef.current && (previewUrl || currentPreviewUrlRef.current)) {
        const urlToUse = previewUrl || currentPreviewUrlRef.current
        iframeRef.current.src = getCacheBustedUrl(urlToUse)
      }
    }

    window.addEventListener('reloadPreview', handleReloadPreview as EventListener)

    return () => {
      window.removeEventListener('reloadPreview', handleReloadPreview as EventListener)
    }
  }, []) // No dependencies - handler uses refs for current values

  // Note: Removed aggressive redirect logic that was causing users to be redirected
  // to home page after a build completed. The page now stays on ProjectPage and either:
  // 1. Shows NewProjectStarter when there are no builds or all builds failed
  // 2. Shows the preview iframe when there's a ready build
  // 3. Shows loading state while waiting for builds to complete

  // Poll for in-progress builds and reload iframe when ready
  // Note: ChatWidget also polls and handles message status updates.
  // This polling is for cases where user navigates to the page with a build already in progress.
  // We should NOT trigger a full reload (setReloadCounter) because that causes ChatWidget
  // to lose its in-session message state. Instead, just refresh the iframe.
  useEffect(() => {
    if (!projectDetails) return

    // Find in-progress prompt to poll
    const inProgressPrompt = projectDetails.recentPrompts.find(
      p => p.status === 'QUEUED' || p.status === 'PROCESSING' || p.status === 'BUILDING'
    )

    if (!inProgressPrompt) return

    console.log('[ProjectPage] Found in-progress prompt, starting poll:', inProgressPrompt.id)

    let cleanup: (() => void) | null = null

    const startPolling = async () => {
      cleanup = await ApiService.pollJobStatus(
        inProgressPrompt.id,
        (status) => {
          console.log('[ProjectPage] Poll status received:', status.status)
          if (status.status === 'READY' && status.previewUrl) {
            console.log('[ProjectPage] Build ready, refreshing iframe only')
            // Instead of full reload, just update the preview URL and refresh iframe
            const cacheBustedUrl = getCacheBustedUrl(status.previewUrl)
            setLatestJobStatus(status)
            setCurrentPreviewUrl(cacheBustedUrl)
            currentPreviewUrlRef.current = cacheBustedUrl
            setIframeLoaded(false)

            // Force iframe reload
            if (iframeRef.current) {
              iframeRef.current.src = cacheBustedUrl
            }
          } else if (status.status === 'FAILED') {
            console.log('[ProjectPage] Build failed')
            // For failed builds, we do need to reload to update UI state
            setReloadCounter(c => c + 1)
          }
        },
        (error) => {
          console.error('[ProjectPage] Poll error:', error)
        }
      )
    }

    startPolling()

    return () => {
      if (cleanup) {
        cleanup()
      }
    }
  }, [projectDetails])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-6">{error || 'The requested project could not be found.'}</p>
          <Button onPress={() => navigate('/projects')} startContent={<ArrowLeft className="h-4 w-4" />}>
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

  // hasReadyPreview is true if:
  // 1. We have a ready prompt AND a preview URL, OR
  // 2. Build just completed AND we have a preview URL (projectDetails may not be refreshed yet)
  const hasPreviewUrl = !!(latestJobStatus?.previewUrl || currentPreviewUrl)
  const hasReadyPreview = (latestReadyPrompt && hasPreviewUrl) || (buildJustCompleted && hasPreviewUrl)

  // Check if onboarding is in progress
  const isOnboardingActive = onboardingPhase !== 'NONE'

  // Special case: NewProjectStarter is completely different UI
  // BUT only show if not in onboarding mode AND build didn't just complete/fail
  // The buildJustCompleted/buildJustFailed flags prevent flash of NewProjectStarter after first build
  if (projectDetails && !isOnboardingActive && !buildJustCompleted && !buildJustFailed && (hasNoBuilds || allBuildsFailed)) {
    return (
      <NewProjectStarter
        projectId={projectDetails.project.id}
        projectName={projectDetails.project.name}
        onBuildComplete={() => setReloadCounter(c => c + 1)}
      />
    )
  }

  // Fully loaded when we have project details and (preview URL OR onboarding is active OR build just failed)
  // Note: iframeLoaded is intentionally NOT included here to prevent ChatWidget from unmounting
  // when the iframe is refreshed. ChatWidget needs to stay mounted to preserve message state.
  const isFullyLoaded = projectDetails && (hasReadyPreview || isOnboardingActive || buildJustFailed)
  // Show loading overlay only during initial load, not during iframe refresh, onboarding, or failure
  const shouldShowLoading = !projectDetails || (!hasReadyPreview && !isOnboardingActive && !buildJustFailed)

  // Debug logging
  console.log('[ProjectPage] State check:', {
    projectDetails: !!projectDetails,
    latestReadyPrompt: latestReadyPrompt ? { id: latestReadyPrompt.id, status: latestReadyPrompt.status } : null,
    latestJobStatus: latestJobStatus ? { previewUrl: !!latestJobStatus.previewUrl, status: latestJobStatus.status } : null,
    hasPreviewUrl,
    buildJustCompleted,
    buildJustFailed,
    hasReadyPreview,
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
            onboardingPhase={onboardingPhase}
            onboardingMessages={onboardingMessages}
            buildJustCompleted={buildJustCompleted}
          />
        </div>
      )}

      {/* Preview/Content container */}
      <div
        className={`
          flex-1 h-full relative
          transition-all duration-300 ease-in-out
        `}
        style={{
          marginLeft: isSidebarLocked && isSidebarOpen && isFullyLoaded ? `0px` : '0px'
        }}
      >
        {/* Onboarding: Analyzing phase */}
        {onboardingPhase === 'ANALYZING' && (
          <div className="h-full flex items-center justify-center bg-background">
            <div className="text-center">
              <Spinner size="lg" color="primary" />
              <p className="mt-4 text-default-500">Analyzing your request...</p>
            </div>
          </div>
        )}

        {/* Onboarding: Inspiration selection phase - centered panel */}
        {onboardingPhase === 'INSPO_SELECTION' && (
          <div className="h-full flex items-center justify-center p-6">
            <Card className="w-full max-w-2xl border border-default-200 shadow-none bg-white overflow-hidden">
              <CardHeader className="flex flex-col gap-1 pb-2">
                <h2 className="text-lg font-semibold">Pick a design that inspires you</h2>
                <p className="text-sm text-default-500 font-normal">Select a style or skip to let AI decide</p>
              </CardHeader>
              <CardBody className="p-0 overflow-hidden">
                <InspirationGallery
                  onSelect={() => {/* legacy, not used */}}
                  onSelectWithItem={(id, item) => handleInspoSelect(id, item)}
                  onSkip={handleInspoSkip}
                  isLoading={isOnboardingLoading}
                />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Onboarding: Clarification phase - centered panel */}
        {onboardingPhase === 'CLARIFICATION' && currentQuestion && (
          <div className="h-full flex items-center justify-center p-6">
            <Card className="w-full max-w-lg border border-default-200 shadow-none bg-white overflow-hidden">
              <CardHeader className="flex flex-col gap-1 pb-2">
                <h2 className="text-lg font-semibold">A few quick questions</h2>
                <p className="text-sm text-default-500 font-normal">Help us understand your needs better</p>
              </CardHeader>
              <CardBody className="p-0 overflow-hidden">
                <OnboardingQuestionPanel
                  question={currentQuestion}
                  questionNumber={(onboardingData?.currentQuestionIndex ?? 0) + 1}
                  totalQuestions={onboardingData?.clarificationQuestions.length ?? 0}
                  onAnswer={handleQuestionAnswer}
                  onSkip={handleQuestionSkip}
                  isLoading={isOnboardingLoading}
                />
              </CardBody>
            </Card>
          </div>
        )}

        {/* Onboarding: Submitting phase */}
        {onboardingPhase === 'SUBMITTING' && (
          <div className="h-full flex items-center justify-center bg-background">
            <div className="text-center">
              <Spinner size="lg" color="primary" />
              <p className="mt-4 text-default-500">Submitting your prompt...</p>
            </div>
          </div>
        )}

        {/* Onboarding: Building phase */}
        {onboardingPhase === 'BUILDING' && (
          <div className="h-full flex items-center justify-center bg-background">
            <div className="text-center max-w-xs">
              <Spinner size="lg" color="primary" />
              <p
                key={rotatingMessage}
                className="mt-4 font-medium animate-fade-in"
              >
                {onboardingBuildStatus === 'QUEUED' && <span className="text-default-600">Queued... Getting ready to build</span>}
                {(onboardingBuildStatus === 'PROCESSING' || onboardingBuildStatus === 'BUILDING' || !onboardingBuildStatus) && (
                  <span className="text-shimmer">{rotatingMessage}</span>
                )}
              </p>
              <p className="mt-2 text-xs text-default-400">
                This usually takes 1-2 minutes
              </p>
            </div>
          </div>
        )}

        {/* Build failed state */}
        {buildJustFailed && onboardingPhase === 'NONE' && (
          <div className="h-full flex items-center justify-center bg-background">
            <Card className="max-w-md border border-danger-200 shadow-none">
              <CardBody className="text-center py-8">
                <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-danger" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Build Failed</h2>
                <p className="text-default-500 mb-6">
                  {onboardingError || 'Something went wrong while building your app. Please try again.'}
                </p>
                <Button
                  color="primary"
                  onPress={() => {
                    // Reload the page to start fresh
                    window.location.reload()
                  }}
                >
                  Try Again
                </Button>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Normal preview mode (no onboarding and no failure) */}
        {onboardingPhase === 'NONE' && !buildJustFailed && (
          <>
            {/* Iframe loading overlay - shown when iframe is refreshing (but not during initial load) */}
            {isFullyLoaded && !iframeLoaded && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Refreshing preview...</p>
                </div>
              </div>
            )}
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
          </>
        )}

        {/* Onboarding error display */}
        {onboardingError && onboardingError !== 'insufficient_credits' && (
          <div className="absolute bottom-4 left-4 right-4 z-20">
            <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
              <p className="text-danger-700 text-sm">{onboardingError}</p>
            </div>
          </div>
        )}

        {/* Insufficient credits display */}
        {onboardingError === 'insufficient_credits' && (
          <div className="h-full flex items-center justify-center bg-background">
            <Card className="max-w-md border border-warning-200 shadow-none">
              <CardBody className="text-center py-8">
                <div className="w-16 h-16 bg-warning-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">💳</span>
                </div>
                <h2 className="text-xl font-semibold mb-2">Out of Credits</h2>
                <p className="text-default-500 mb-6">
                  You've run out of credits. Purchase more to continue building your app.
                </p>
                <Button
                  color="warning"
                  onPress={() => navigate('/billing')}
                >
                  Purchase Credits
                </Button>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}