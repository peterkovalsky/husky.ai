import { useProject } from '../contexts/ProjectContext'
import { Card, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Chip } from '@heroui/react'
import { EditProjectDialog } from './EditProjectDialog'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { PublishDialog } from './PublishDialog'
import { Code2, MoreVertical, Trash2, Globe, Loader2, AlertCircle, Edit, Plus, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { PublishingStatus, ProjectStatus, type Project } from '../services/api'

export const Home = () => {
  const { projects, loading, deleteProject, refreshProjects } = useProject()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

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

  const handleDeleteProject = (project: Project) => {
    setSelectedProject(project)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteProject = async (projectId: string) => {
    if (deleteProject) {
      await deleteProject(projectId)
    }
  }

  const handleEditProject = (project: Project) => {
    setSelectedProject(project)
    setEditDialogOpen(true)
  }

  const handlePublishClick = (project: Project) => {
    console.log('[Home] Publish clicked for project:', project)
    setSelectedProject(project)
    console.log('[Home] Opening publish dialog')
    setPublishDialogOpen(true)
  }

  const getPublishingStatusBadge = (project: Project) => {
    const status = project.publishedStatus || PublishingStatus.UNPUBLISHED

    switch (status) {
      case PublishingStatus.PUBLISHED:
        return (
          <Chip
            size="sm"
            className="bg-gradient-ready text-white border-0"
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
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold mb-2 text-gray-900">
              Your Projects
            </h2>
            <p className="text-default-500">Select a project to continue building your app</p>
          </div>
          {sortedProjects.length > 0 && (
            <Button
              color="primary"
              onPress={() => navigate('/project/new')}
              startContent={<Plus className="h-4 w-4" />}
            >
              Create Project
            </Button>
          )}
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
              onPress={() => navigate('/project/new')}
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
                  className="relative overflow-hidden border border-default-200 shadow-none hover:border-husky-300 transition-colors"
                >
                  {/* Action Menu - Overlaid on thumbnail */}
                  <div className="absolute top-2 right-2 z-10">
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          as="div"
                          isIconOnly
                          size="sm"
                          className="glass hover:bg-white/90 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4 text-default-700" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Project actions">
                        <DropdownItem
                          key="edit"
                          textValue="Edit Project"
                          onClick={() => handleEditProject(project)}
                        >
                          <div className="flex items-center">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Project
                          </div>
                        </DropdownItem>
                        {(project.publishedStatus === PublishingStatus.UNPUBLISHED || project.publishedStatus === PublishingStatus.FAILED) ? (
                          <DropdownItem
                            key="publish"
                            textValue="Publish"
                            onClick={() => handlePublishClick(project)}
                            isDisabled={!project.currentVersion || project.currentVersion === 0}
                            description={!project.currentVersion || project.currentVersion === 0 ? 'No successful builds available' : undefined}
                          >
                            <div className="flex items-center">
                              <Globe className="mr-2 h-4 w-4" />
                              Publish
                            </div>
                          </DropdownItem>
                        ) : null}
                        {project.publishedStatus === PublishingStatus.PUBLISHED ? (
                          <DropdownItem
                            key="republish"
                            textValue="Republish"
                            onClick={() => handlePublishClick(project)}
                          >
                            <div className="flex items-center">
                              <Globe className="mr-2 h-4 w-4" />
                              Republish
                            </div>
                          </DropdownItem>
                        ) : null}
                        <DropdownItem
                          key="delete"
                          textValue="Delete Project"
                          className="text-danger"
                          color="danger"
                          onClick={() => handleDeleteProject(project)}
                        >
                          <div className="flex items-center">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Project
                          </div>
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>

                  {/* Publishing Status Badge - Overlaid on thumbnail */}
                  {getPublishingStatusBadge(project) && (
                    <div className="absolute top-2 left-2 z-10">
                      {getPublishingStatusBadge(project)}
                    </div>
                  )}

                  {/* Thumbnail or fallback */}
                  {project.thumbnailUrl ? (
                    <div className="w-full aspect-video bg-default-100">
                      <img
                        src={project.thumbnailUrl}
                        alt={`${project.name} preview`}
                        className="w-full h-full object-cover object-top"
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
                    className="text-base font-semibold cursor-pointer hover:text-husky-600 transition-colors truncate"
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

      {/* Dialogs */}
      {selectedProject && (
        <>
          <EditProjectDialog
            projectId={selectedProject.id}
            currentName={selectedProject.name}
            currentDescription={undefined}
            isOpen={editDialogOpen}
            onOpenChange={() => setEditDialogOpen(!editDialogOpen)}
            onProjectUpdated={refreshProjects}
          />
          <DeleteProjectDialog
            isOpen={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            projectName={selectedProject.name}
            projectId={selectedProject.id}
            publishedStatus={selectedProject.publishedStatus}
            onConfirm={confirmDeleteProject}
          />
          <PublishDialog
            isOpen={publishDialogOpen}
            onOpenChange={setPublishDialogOpen}
            projectId={selectedProject.id}
            onSuccess={refreshProjects}
          />
        </>
      )}
    </div>
  )
}
