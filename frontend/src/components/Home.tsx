import { useProject } from '../contexts/ProjectContext'
import { Card, CardBody, CardHeader, Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Divider, Chip } from '@heroui/react'
import { CreateProjectDialog } from './CreateProjectDialog'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { PublishDialog } from './PublishDialog'
import { Code2, Calendar, FolderOpen, MoreVertical, Trash2, Globe, Loader2, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { PublishingStatus, type Project } from '../services/api'

export const Home = () => {
  const { projects, loading, deleteProject, refreshProjects } = useProject()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)

  // Refresh projects when component mounts or becomes visible
  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown Date'
    
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid Date'
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
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
          <Chip size="sm" color="success" variant="flat" startContent={<Globe className="h-3 w-3" />}>
            Published
          </Chip>
        )
      case PublishingStatus.PUBLISHING:
        return (
          <Chip size="sm" color="primary" variant="flat" startContent={<Loader2 className="h-3 w-3 animate-spin" />}>
            Publishing
          </Chip>
        )
      case PublishingStatus.UNPUBLISHING:
        return (
          <Chip size="sm" color="default" variant="flat" startContent={<Loader2 className="h-3 w-3 animate-spin" />}>
            Unpublishing
          </Chip>
        )
      case PublishingStatus.FAILED:
        return (
          <Chip size="sm" color="danger" variant="flat" startContent={<AlertCircle className="h-3 w-3" />}>
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
          <div className="w-8 h-8 border-4 border-default-200 border-t-primary rounded-full animate-spin mx-auto"></div>
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
            <h2 className="text-3xl font-bold mb-2">Your Projects</h2>
            <p className="text-default-500">Select a project to continue building your app</p>
          </div>
          {projects.length > 0 && (
            <CreateProjectDialog />
          )}
        </div>

        {!loading && projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-default-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-8 h-8 text-default-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-default-500 mb-6">Create your first project to get started</p>
            <CreateProjectDialog isFirstProject={true} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                isPressable
                onPress={() => navigate(`/project/${project.id}`)}
              >
                <CardHeader className="flex-row justify-between items-start">
                  <div className="flex flex-col gap-3">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                      <Code2 className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">{project.name}</h3>
                  </div>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button
                        as="div"
                        isIconOnly
                        variant="light"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Project actions">
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
                </CardHeader>
                <CardBody>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-default-500">
                      <Calendar className="mr-2 h-4 w-4" />
                      Created {formatDate(project.createdAt)}
                    </div>
                    {getPublishingStatusBadge(project) && (
                      <>
                        <Divider />
                        <div className="flex items-center gap-2">
                          {getPublishingStatusBadge(project)}
                        </div>
                      </>
                    )}
                    <Divider />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-default-500">
                        Last modified {formatDate(project.modifiedAt)}
                      </span>
                      <Button size="sm" variant="light">
                        Open →
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Project Dialog */}
      {selectedProject && (
        <>
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