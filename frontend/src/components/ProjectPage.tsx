import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ApiService, type JobStatus, type ProjectDetails } from '../services/api'
import { useProject } from '../contexts/ProjectContext'
import { Dashboard } from './Dashboard'
import { ChatWidget } from './ChatWidget'
import { NewProjectStarter } from './NewProjectStarter'
import { Button } from './ui/button'
import { Code2, ArrowLeft, Loader2 } from 'lucide-react'

export const ProjectPage = () => {
  const { project_id } = useParams<{ project_id: string }>()
  const navigate = useNavigate()
  const { setCurrentProject } = useProject()
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null)
  const [latestJobStatus, setLatestJobStatus] = useState<JobStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const [iframeLoading, setIframeLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const loadProject = async () => {
      if (!project_id) return

      try {
        setLoading(true)
        
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
            }
          } catch {
            console.warn('Could not fetch job status for prompt:', latest.id)
          }
        }
      } catch (err) {
        console.error('Failed to load project:', err)
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
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
      }
      
      // Force iframe reload by changing key and reset loading state
      setIframeLoading(true)
      setIframeKey(prev => prev + 1)
    }

    window.addEventListener('reloadPreview', handleReloadPreview as EventListener)
    
    return () => {
      window.removeEventListener('reloadPreview', handleReloadPreview as EventListener)
    }
  }, [latestJobStatus])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    )
  }

  if (error || !projectDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-6">{error || 'The requested project could not be found.'}</p>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  // Check if there are no builds or all builds have failed
  const hasNoBuilds = projectDetails.stats.totalBuilds === 0
  const allBuildsFailed = projectDetails.recentPrompts.length > 0 && 
    projectDetails.recentPrompts.every(p => p.status === 'FAILED')
  
  // Check if there's a latest READY prompt with preview URL
  const latestReadyPrompt = projectDetails.recentPrompts.find(p => p.status === 'READY')
  
  // If no builds exist or all builds failed, show the default screen (new project starter)
  if (hasNoBuilds || allBuildsFailed) {
    return (
      <NewProjectStarter 
        projectId={projectDetails.project.id}
        projectName={projectDetails.project.name}
      />
    )
  }
  
  // If there's a latest prompt with preview, show the preview page
  if (latestReadyPrompt && latestJobStatus?.previewUrl) {
    return (
      <div className="h-screen flex flex-col relative">
        {/* Loading overlay */}
        {iframeLoading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={latestJobStatus.previewUrl}
          className="w-full h-full border-0"
          title="Project Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => setIframeLoading(false)}
          onError={() => setIframeLoading(false)}
        />
        
        {/* Chat Widget */}
        <ChatWidget />
      </div>
    )
  }

  // This case is now handled by the hasNoBuilds check above
  // If no prompts exist, totalBuilds will be 0 and hasNoBuilds will be true

  // If there are prompts but no ready preview, redirect to edit mode (Dashboard)
  return (
    <>
      <Dashboard />
      <ChatWidget />
    </>
  )
}