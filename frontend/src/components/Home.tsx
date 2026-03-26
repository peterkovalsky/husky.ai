import { useProject } from '../contexts/ProjectContext'
import { Card, Button, Chip } from '@heroui/react'
import { Code2, Globe, Loader2, AlertCircle, Plus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { PublishingStatus, ProjectStatus, type Project } from '../services/api'

export const Home = () => {
  const { projects, loading, refreshProjects } = useProject()
  const navigate = useNavigate()

  // Filter to only ACTIVE projects and sort by modified date descending (most recent first)
  const sortedProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.status === ProjectStatus.ACTIVE || p.status === undefined)
      .sort((a, b) => {
        const dateA = new Date(a.modifiedAt || a.createdAt).getTime()
        const dateB = new Date(b.modifiedAt || b.createdAt).getTime()
        return dateB - dateA // Descending order (most recent first)
      })
  }, [projects])

  // Refresh projects when component mounts or becomes visible
  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  const formatRelativeDate = (dateString: string) => {
    if (!dateString) return 'Unknown'

    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Unknown'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const getPublishingStatusBadge = (project: Project) => {
    const status = project.publishedStatus || PublishingStatus.UNPUBLISHED

    switch (status) {
      case PublishingStatus.PUBLISHED:
        return (
          <Chip
            size="sm"
            color="success"
            className="text-white"
            startContent={<Globe className="h-3 w-3" />}
          >
            Published
          </Chip>
        )
      case PublishingStatus.PUBLISHING:
        return (
          <Chip
            size="sm"
            className="bg-gradient-processing text-white border-0"
            startContent={<Loader2 className="h-3 w-3 animate-spin" />}
          >
            Publishing
          </Chip>
        )
      case PublishingStatus.UNPUBLISHING:
        return (
          <Chip
            size="sm"
            variant="flat"
            startContent={<Loader2 className="h-3 w-3 animate-spin" />}
          >
            Unpublishing
          </Chip>
        )
      case PublishingStatus.FAILED:
        return (
          <Chip
            size="sm"
            className="bg-gradient-failed text-white border-0"
            startContent={<AlertCircle className="h-3 w-3" />}
          >
            Publish Failed
          </Chip>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-husky-500 animate-pulse-husky mx-auto mb-4"></div>
          <p className="text-default-500">Loading projects...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2 text-gray-900">
            Your Projects
          </h2>
          <p className="text-default-500">Select a project to continue building your app</p>
        </div>

        {!loading && sortedProjects.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-husky-500 mx-auto mb-6" />
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-default-500 mb-8 max-w-md mx-auto">
              Create your first project and let AI build a beautiful app for you
            </p>
            <Button
              size="lg"
              color="primary"
              onPress={() => navigate('/')}
              startContent={<Plus className="h-5 w-5" />}
            >
              Create Your First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedProjects.map((project) => (
              <div key={project.id} className="flex flex-col animate-in">
                {/* Thumbnail Card */}
                <Card
                  isPressable
                  onPress={() => navigate(`/project/${project.id}`)}
                  className="group relative overflow-hidden border border-default-200 shadow-none"
                >
                  {/* Publishing Status Badge - Overlaid on thumbnail */}
                  {getPublishingStatusBadge(project) && (
                    <div className="absolute top-2 left-2 z-10">
                      {getPublishingStatusBadge(project)}
                    </div>
                  )}

                  {/* Thumbnail or fallback */}
                  {project.thumbnailUrl ? (
                    <div className="w-full aspect-video bg-default-100 overflow-hidden">
                      <img
                        src={project.thumbnailUrl}
                        alt={`${project.name} preview`}
                        className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-video bg-default-100 flex items-center justify-center">
                      <Code2 className="w-12 h-12 text-default-300" />
                    </div>
                  )}
                </Card>

                {/* Project Info - Below the card */}
                <div className="pt-3 px-1">
                  <h3
                    className="text-base font-semibold cursor-pointer truncate"
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    {project.name}
                  </h3>
                  <p className="text-sm text-default-500">
                    Edited {formatRelativeDate(project.modifiedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
